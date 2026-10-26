/**
 * 文件原文的 token 计数（DeepSeek V4.1 Flash / GLM-5.3）。
 *
 * 为什么在宿主侧数：两个词表分别是 6 MB 与 19 MB 的 tokenizer.json，搬到
 * 浏览器里解析既慢又占内存，而且每次刷新页面都要重来；宿主加载一次后常驻
 * 内存，面板只发原文、只收数字。
 *
 * 为什么是 @huggingface/tokenizers 而不是 @huggingface/transformers：后者
 * 为了跑推理把 onnxruntime-node 和 sharp 一起拖进来（几十 MB，还有原生
 * 二进制），而这个功能只需要 tokenizer.json 的纯 JS 实现。同属 Hugging
 * Face 家族、零依赖、没有 N-API 构建，数字与 Rust 版 tokenizers 逐位一致
 * （tokens.test.ts 里有固定用例；开发时也用 Python tokenizers 对同一批
 * 文件做过交叉核对）。
 *
 * 词表怎么来：不随插件发布，也不打进构建产物。第一次计数时按协议层固定
 * 的 revision 从 Hugging Face 下载 tokenizer.json，落到插件数据目录
 * `$DSH_HOME/plugin/data/custom-instruction-manager/tokenizer/` 下，之后只读
 * 本地文件。缓存
 * 只有"有/没有"两种状态——不做过期、不做过期清理、不做手动管理，体积也
 * 就是两份词表。
 *
 * 计数结果本身**不**缓存：面板每次进详情页都重新数一遍，数字永远跟着当前
 * 文件内容走。这里缓存的只有"解析好的 tokenizer 对象"和磁盘上那份词表。
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Tokenizer } from '@huggingface/tokenizers'
import { errorText } from './error-text.ts'
import { TOKEN_MODELS, type TokenCountEntry, type TokenModelSpec } from './protocol/tokens.ts'
import { dshHome } from './store.ts'
import { tokenizerCacheDir } from './store/paths.ts'

/** 词表缓存目录（`$DSH_HOME/plugin/data/custom-instruction-manager/tokenizer`）。 */
export function tokenCacheDir(home = dshHome()): string {
  return tokenizerCacheDir(home)
}

/** 缓存文件名：仓库名 + 固定 revision 前 12 位，换 revision 就是另一个文件。 */
function cacheFile(dir: string, spec: TokenModelSpec): string {
  return join(dir, spec.repo.replaceAll('/', '__') + '@' + spec.revision.slice(0, 12) + '.json')
}

/** 下载 URL：`resolve/<revision>/tokenizer.json`（固定 revision，不吃 `main` 的漂移）。 */
export function tokenizerUrl(spec: TokenModelSpec): string {
  return 'https://huggingface.co/' + spec.repo + '/resolve/' + spec.revision + '/tokenizer.json'
}

/** 计数可注入的依赖（测试用临时目录 + 假 fetch，不联网）。 */
export interface CountTokensOptions {
  /** 词表缓存目录；默认在插件数据目录下的 `tokenizer/`。 */
  dir?: string
  /** 下载实现；默认全局 fetch。 */
  fetch?: typeof globalThis.fetch
  /** 单次下载超时（默认 120s，19 MB 词表在慢网下也够）。 */
  timeoutMs?: number
}

/** 已加载的 tokenizer：按模型 id 常驻，失败的不留（下次请求可以重试）。 */
const loaded = new Map<string, Promise<Tokenizer>>()

/**
 * 词表 JSON 的最低形状校验：`model.type` 与 `model.vocab` 必须在。
 *
 * 真实目的是挡住"下载回来的其实是一个 HTML 错误页/网关提示"这种情形——
 * 那种响应 HTTP 也可能是 200，只有解析后的结构能区分。
 */
function assertTokenizerJson(parsed: unknown, spec: TokenModelSpec): Record<string, unknown> {
  const root = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  const model = root?.model
  const shaped = typeof model === 'object' && model !== null && typeof (model as Record<string, unknown>).vocab === 'object'
  if (root === undefined || !shaped) throw new Error('词表文件不是 tokenizer.json（' + spec.repo + '）')
  return root
}

/** 读缓存文件；损坏（缺失/半截/不是 tokenizer.json）一律当作没有。 */
async function readCached(file: string, spec: TokenModelSpec): Promise<Record<string, unknown> | undefined> {
  try {
    return assertTokenizerJson(JSON.parse(await readFile(file, 'utf8')), spec)
  } catch {
    return undefined
  }
}

/** 下载词表并写入缓存（先写临时文件再 rename，读者永远看不到半截文件）。 */
async function download(file: string, spec: TokenModelSpec, options: CountTokensOptions): Promise<Record<string, unknown>> {
  const doFetch = options.fetch ?? globalThis.fetch
  const response = await doFetch(tokenizerUrl(spec), {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  })
  if (!response.ok) throw new Error('词表下载失败：HTTP ' + response.status + '（' + spec.repo + '）')
  const text = await response.text()
  const parsed = assertTokenizerJson(JSON.parse(text), spec)
  await mkdir(dirname(file), { recursive: true })
  // 并发下载同一份词表理论上不会发生（loaded 已按模型去重），但临时名仍带
  // pid + 时间戳，避免两个宿主进程互相踩。
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp'
  await writeFile(tmp, text)
  await rename(tmp, file)
  return parsed
}

/**
 * 取一个模型的 tokenizer（首次是下载 + 解析，之后常驻内存）。
 *
 * 同一个模型的并发请求共享同一个 promise：面板连点两下详情页不会下载
 * 两遍词表。失败时把这个 promise 从表里摘掉，下一次请求重新试。
 */
function loadTokenizer(spec: TokenModelSpec, options: CountTokensOptions): Promise<Tokenizer> {
  const pending = loaded.get(spec.id)
  if (pending !== undefined) return pending
  const dir = options.dir ?? tokenCacheDir()
  const file = cacheFile(dir, spec)
  const promise = (async () => {
    const cached = await readCached(file, spec)
    const json = cached ?? await download(file, spec, options)
    return new Tokenizer(json, {})
  })()
  loaded.set(spec.id, promise)
  promise.catch(() => { if (loaded.get(spec.id) === promise) loaded.delete(spec.id) })
  return promise
}

/**
 * 数一份原文在各模型词表下的 token 数。
 *
 * 每个模型独立成败：一个词表没下载下来，另一个照样返回数字（`entries` 里
 * 失败项带 `error`）。整族人一起失败只可能是 fetch 之外的编程错误。
 *
 * `add_special_tokens: false`：统计的是文件原文本身，不含 BOS/EOS 这类
 * 包装；面板的脚注也这么写。
 *
 * @param text - 文件原文，原样计数（不 trim、不合并空行）。
 * @param options - 缓存目录/下载实现/超时（测试注入）。
 * @returns 每个模型一条结果，顺序与 TOKEN_MODELS 一致。
 */
export async function countTokens(text: string, options: CountTokensOptions = {}): Promise<TokenCountEntry[]> {
  return Promise.all(TOKEN_MODELS.map(async (spec): Promise<TokenCountEntry> => {
    try {
      const tokenizer = await loadTokenizer(spec, options)
      return { id: spec.id, label: spec.label, tokens: tokenizer.encode(text, { add_special_tokens: false }).ids.length }
    } catch (error) {
      return { id: spec.id, label: spec.label, error: errorText(error) }
    }
  }))
}

/** 丢掉内存里的 tokenizer（测试用；生产不需要）。 */
export function resetTokenizers(): void {
  loaded.clear()
}

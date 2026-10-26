/**
 * Token 计数模块：词表"缓存命中 → 直接读盘 / 未命中 → 下载"两条路径、
 * 同一词表的并发去重、以及"一个模型挂了不影响另一个模型"的失败语义。
 *
 * 用一份三词的 WordLevel 词表当 fixture：计数逻辑（load → encode →
 * ids.length）和真词表完全同一条路径，但不需要联网、也不需要在仓库里
 * 放 25 MB 的词表。真词表的数字与 Rust 版 tokenizers 一致，这条结论来自
 * 开发时的交叉核对（同一批文件两边逐位相同），单测覆盖的是它外面的管线。
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TOKEN_MODEL_IDS, resolveTokenSelection, TOKEN_MODELS } from './protocol.ts'
import { countTokens, installModel, modelStates, removeModel, resetTokenizers, tokenCacheDir, tokenizerUrl } from './tokens.ts'

/** 最小可用 tokenizer.json：空白切分 + 三词词表，数出来就是词数。 */
const FIXTURE = {
  version: '1.0',
  truncation: null,
  padding: null,
  added_tokens: [],
  normalizer: null,
  pre_tokenizer: { type: 'Whitespace' },
  post_processor: null,
  decoder: null,
  model: { type: 'WordLevel', vocab: { '[UNK]': 0, hello: 1, world: 2 }, unk_token: '[UNK]' },
}

/** 按仓库分派词表下载的假 fetch；返回调用记录以断言"只下载一次"。 */
function fakeFetch(options: { failRepos?: readonly string[], payload?: string } = {}) {
  const calls: string[] = []
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input)
    calls.push(url)
    const repo = TOKEN_MODELS.find((model) => url.includes(model.repo))
    if (repo === undefined) return new Response('unexpected url', { status: 599 })
    if (options.failRepos?.includes(repo.repo) === true) return new Response('nope', { status: 503 })
    return new Response(options.payload ?? JSON.stringify(FIXTURE), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { impl: impl as unknown as typeof globalThis.fetch, calls }
}

describe('token counting', () => {
  let dir: string
  let cacheDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-tokens-'))
    cacheDir = join(dir, 'tokenizers')
    resetTokenizers()
  })

  afterEach(async () => {
    resetTokenizers()
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  it('returns one entry per default model, in order, with real token counts', async () => {
    const fetch = fakeFetch()
    const entries = await countTokens('hello world', { dir: cacheDir, fetch: fetch.impl })
    const defaults = TOKEN_MODELS.filter((model) => model.preset)
    expect(entries.map((entry) => entry.id)).toEqual(defaults.map((model) => model.id))
    expect(entries.map((entry) => entry.label)).toEqual(defaults.map((model) => model.label))
    expect(entries.every((entry) => entry.tokens === 2 && entry.error === undefined)).toBe(true)
  })

  it('counts an empty file as zero tokens (an empty file is not an error)', async () => {
    const fetch = fakeFetch()
    const entries = await countTokens('', { dir: cacheDir, fetch: fetch.impl })
    expect(entries.every((entry) => entry.tokens === 0)).toBe(true)
  })

  it('downloads each vocabulary once and keeps it resident afterwards', async () => {
    const fetch = fakeFetch()
    await countTokens('hello', { dir: cacheDir, fetch: fetch.impl })
    await countTokens('hello world', { dir: cacheDir, fetch: fetch.impl })
    const defaults = TOKEN_MODELS.filter((model) => model.preset)
    expect(fetch.calls).toHaveLength(defaults.length)
    expect(fetch.calls.sort()).toEqual(defaults.map((model) => tokenizerUrl(model)).sort())
  })

  it('shares one download between concurrent counts of the same vocabulary', async () => {
    const fetch = fakeFetch()
    const [first, second] = await Promise.all([
      countTokens('hello', { dir: cacheDir, fetch: fetch.impl }),
      countTokens('world', { dir: cacheDir, fetch: fetch.impl }),
    ])
    expect(fetch.calls).toHaveLength(TOKEN_MODELS.filter((model) => model.preset).length)
    expect(first.every((entry) => entry.tokens === 1)).toBe(true)
    expect(second.every((entry) => entry.tokens === 1)).toBe(true)
  })

  it('reads the cached vocabulary from disk after a restart, with no network at all', async () => {
    await countTokens('hello world', { dir: cacheDir, fetch: fakeFetch().impl })
    resetTokenizers()
    const offline = fakeFetch({ failRepos: TOKEN_MODELS.map((model) => model.repo) })
    const entries = await countTokens('hello world', { dir: cacheDir, fetch: offline.impl })
    expect(entries.every((entry) => entry.tokens === 2)).toBe(true)
    expect(offline.calls).toHaveLength(0)
    // 缓存落在插件数据目录的 tokenizer/ 下，文件名固定，一个模型一份。
    expect((await readdir(cacheDir)).sort()).toEqual(TOKEN_MODELS.filter((model) => model.preset).map((model) => model.repo.replaceAll('/', '__') + '@' + model.revision.slice(0, 12) + '.json').sort())
  })

  it('replaces a corrupt cache file instead of failing', async () => {
    await mkdir(cacheDir, { recursive: true })
    const file = join(cacheDir, TOKEN_MODELS[0].repo.replaceAll('/', '__') + '@' + TOKEN_MODELS[0].revision.slice(0, 12) + '.json')
    await writeFile(file, '{"model":')
    const fetch = fakeFetch()
    const entries = await countTokens('hello world', { dir: cacheDir, fetch: fetch.impl })
    expect(entries[0].tokens).toBe(2)
    expect(JSON.parse(await readFile(file, 'utf8')).model.vocab.hello).toBe(1)
  })

  it('reports a per-model failure without losing the other model', async () => {
    const broken = TOKEN_MODELS[1].repo
    const fetch = fakeFetch({ failRepos: [broken] })
    const entries = await countTokens('hello world', { dir: cacheDir, fetch: fetch.impl })
    expect(entries[0].tokens).toBe(2)
    expect(entries[0].error).toBeUndefined()
    expect(entries[1].tokens).toBeUndefined()
    expect(entries[1].error).toContain('503')
  })

  it('rejects a payload that is not a tokenizer.json (an error page served as 200)', async () => {
    const fetch = fakeFetch({ payload: '<html>gateway error</html>' })
    const entries = await countTokens('hello', { dir: cacheDir, fetch: fetch.impl })
    expect(entries.every((entry) => entry.tokens === undefined && entry.error !== undefined)).toBe(true)
  })

  it('gives a failed model another chance on the next request', async () => {
    const broken = TOKEN_MODELS[0].repo
    const first = await countTokens('hello', { dir: cacheDir, fetch: fakeFetch({ failRepos: [broken] }).impl })
    expect(first[0].error).toBeDefined()
    const second = await countTokens('hello', { dir: cacheDir, fetch: fakeFetch().impl })
    expect(second[0].tokens).toBe(1)
  })

  it('defaults the cache directory to the plugin data dir', () => {
    expect(tokenCacheDir('/tmp/example-home')).toBe(join('/tmp/example-home', 'plugin', 'data', 'custom-instruction-manager', 'tokenizer'))
  })
})

describe('token model selection', () => {
  let dir: string
  let cacheDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-token-selection-'))
    cacheDir = join(dir, 'tokenizer')
    resetTokenizers()
  })

  afterEach(async () => {
    resetTokenizers()
    await rm(dir, { recursive: true, force: true })
  })

  it('defaults to the preset models and treats a saved empty list as "none"', () => {
    expect(resolveTokenSelection(undefined)).toEqual([...DEFAULT_TOKEN_MODEL_IDS])
    expect(resolveTokenSelection([])).toEqual([])
    // 未知 id（模型下线）丢掉，顺序按协议层而不是保存顺序
    expect(resolveTokenSelection(['kimi-k3', 'ghost-model', 'glm-5.3'])).toEqual(['glm-5.3', 'kimi-k3'])
  })

  it('counts only the selected models', async () => {
    const fetch = fakeFetch()
    const all = await countTokens('hello world', { dir: cacheDir, fetch: fetch.impl, models: TOKEN_MODELS.map((model) => model.id) })
    expect(all.map((entry) => entry.id)).toEqual(TOKEN_MODELS.map((model) => model.id))

    resetTokenizers()
    const onlyKimi = await countTokens('hello world', { dir: cacheDir, fetch: fetch.impl, models: ['kimi-k3'] })
    expect(onlyKimi.map((entry) => entry.id)).toEqual(['kimi-k3'])
    expect(onlyKimi[0].tokens).toBe(2)

    const none = await countTokens('hello world', { dir: cacheDir, fetch: fetch.impl, models: [] })
    expect(none).toEqual([])
  })

  it('marks a model installed only after its vocabulary is on disk', async () => {
    const fetch = fakeFetch()
    const before = modelStates([...DEFAULT_TOKEN_MODEL_IDS], cacheDir)
    expect(before.every((model) => !model.installed)).toBe(true)

    await installModel('kimi-k3', { dir: cacheDir, fetch: fetch.impl })
    const after = modelStates([...DEFAULT_TOKEN_MODEL_IDS, 'kimi-k3'], cacheDir)
    expect(after.find((model) => model.id === 'kimi-k3')).toMatchObject({ installed: true, selected: true })
    expect(after.find((model) => model.id === 'glm-5.3')?.installed).toBe(false)
  })

  it('deleting a model removes its file and forces a fresh download next time', async () => {
    const fetch = fakeFetch()
    await installModel('kimi-k3', { dir: cacheDir, fetch: fetch.impl })
    await removeModel('kimi-k3', { dir: cacheDir })
    expect(modelStates(['kimi-k3'], cacheDir)[0].installed).toBe(false)

    // 内存里也逐出了：再数一次必须重新下载（fetch 又被调用）
    const again = fakeFetch()
    await countTokens('hello', { dir: cacheDir, fetch: again.impl, models: ['kimi-k3'] })
    expect(again.calls).toEqual([tokenizerUrl(TOKEN_MODELS.find((model) => model.id === 'kimi-k3') ?? TOKEN_MODELS[0])])
  })

  it('rejects an unknown model id', async () => {
    await expect(installModel('nope', { dir: cacheDir, fetch: fakeFetch().impl })).rejects.toThrow('unknown token model')
    await expect(removeModel('nope', { dir: cacheDir })).rejects.toThrow('unknown token model')
  })
})

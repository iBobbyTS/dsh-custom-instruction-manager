/**
 * Token 计数域路由：数一份原始正文在**当前选中**的各模型词表下的 token 数，
 * 以及管理这个选中集合（哪些模型出现在表格里）。
 *
 * 为什么正文是 POST 而不是 GET：被判的就是文件正文本身，几十 KB 到几 MB，
 * 塞进 URL 既超长又会被各种代理截断；GET 也带不上"每次现算"的语义。
 *
 * 为什么正文由浏览器送来而不是给个路径让宿主自己读：面板已经有这段原文
 * （详情页就是这么显示的），送过来就保证"数的就是用户看到的"；换成路径
 * 还要再解析一遍技能名/工作区、再判一次可读边界，多一条路径就多一处裁决。
 * 代价是正文过一遍 loopback，几 KB 到几十 KB，可忽略。
 *
 * 请求体上限比本族其它路由（64 KB）宽松，因为正文本身就是载荷；上限见
 * protocol/tokens.ts 的 TOKEN_COUNT_MAX_BYTES。
 *
 * 选中集合是"要用哪些模型"的唯一来源：勾选即下载词表、取消即删掉那份词表，
 * 两者都在 /tokens/select 里一次做完，不存在需要另外清理的中间态。
 */

import {
  resolveTokenSelection,
  SKILL_HUB_API,
  TOKEN_COUNT_MAX_BYTES,
  type TokenCountResponse,
  type TokenModelsResponse,
  type TokenSelectResponse,
} from '../protocol.ts'
import { countTokens, installModel, modelOf, modelStates, removeModel, tokenCacheDir } from '../tokens.ts'
import { readString, writeError, writeJson, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** Token 计数域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function tokensRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  const dir = (): string => deps.tokenCacheDir ?? tokenCacheDir(deps.home)
  const countOptions = (): { dir: string; fetch: typeof deps.fetchImpl } => ({ dir: dir(), fetch: deps.fetchImpl })

  return [
    // ------------------------------------------------------- token models
    // 「管理模型」的数据源：全部可选模型 + 选中/已下载状态。
    {
      path: SKILL_HUB_API.tokensModels,
      methods: ['GET'],
      handler: async ({ res }) => {
        const selection = resolveTokenSelection(await deps.store.getTokenModels())
        const response: TokenModelsResponse = { ok: true, models: modelStates(selection, dir()) }
        writeJson(res, 200, response)
      },
    },
    // ------------------------------------------------------- token select
    // 改选中集合：勾选先下载（失败就不记这次选择），取消勾选删掉那份词表。
    {
      path: SKILL_HUB_API.tokensSelect,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const id = readString(body, 'id')
        if (modelOf(id) === undefined) {
          writeError(res, 400, 'unknown token model: ' + (id === '' ? '(missing)' : id))
          return
        }
        const selected = body.selected === true
        const current = resolveTokenSelection(await deps.store.getTokenModels())
        if (selected) {
          // 下载失败直接抛给统一错误映射：不把"要用的模型"记成选中，面板会停在
          // 未勾选状态，用户可以重试。
          await installModel(id, countOptions())
        } else {
          await removeModel(id, countOptions())
        }
        const next = selected
          ? resolveTokenSelection([...current, id])
          : resolveTokenSelection(current.filter((entry) => entry !== id))
        await deps.store.setTokenModels(next)
        const response: TokenSelectResponse = { ok: true, models: modelStates(next, dir()) }
        writeJson(res, 200, response)
      },
    },
    // -------------------------------------------------------------- tokens
    // 现算各模型的 token 数：只数选中的那些，宿主侧词表常驻，首次调用才下载。
    {
      path: SKILL_HUB_API.tokens,
      methods: ['POST'],
      jsonBody: true,
      bodyLimit: TOKEN_COUNT_MAX_BYTES,
      handler: async ({ res, body }) => {
        const text = body.text
        // 空原文不是错误（空文件就是 0 个 token），但字段类型不对是客户端 bug。
        if (typeof text !== 'string') {
          writeError(res, 400, 'text must be a string')
          return
        }
        const selection = resolveTokenSelection(await deps.store.getTokenModels())
        const entries = await countTokens(text, { ...countOptions(), models: selection })
        const response: TokenCountResponse = { ok: true, entries }
        writeJson(res, 200, response)
      },
    },
  ]
}

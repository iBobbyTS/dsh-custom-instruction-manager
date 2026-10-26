/**
 * Token 计数域路由：数一份原始正文在各模型词表下的 token 数。
 *
 * 为什么是 POST 而不是 GET：被判的就是文件正文本身，几十 KB 到几 MB，
 * 塞进 URL 既超长又会被各种代理截断；GET 也带不上"每次现算"的语义。
 *
 * 为什么正文由浏览器送来而不是给个路径让宿主自己读：面板已经有这段原文
 * （详情页就是这么显示的），送过来就保证"数的就是用户看到的"；换成路径
 * 还要再解析一遍技能名/工作区、再判一次可读边界，多一条路径就多一处裁决。
 * 代价是正文过一遍 loopback，几 KB 到几十 KB，可忽略。
 *
 * 这一条路由的请求体上限比本族其它路由（64 KB）宽松，因为正文本身就是
 * 载荷；上限见 protocol/tokens.ts 的 TOKEN_COUNT_MAX_BYTES。
 */

import { SKILL_HUB_API, TOKEN_COUNT_MAX_BYTES, type TokenCountResponse } from '../protocol.ts'
import { countTokens, tokenCacheDir } from '../tokens.ts'
import { writeError, writeJson, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** Token 计数域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function tokensRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // -------------------------------------------------------------- tokens
    // 现算各模型的 token 数：宿主侧词表常驻，首次调用才下载。
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
        const entries = await countTokens(text, {
          dir: deps.tokenCacheDir ?? tokenCacheDir(deps.home),
          fetch: deps.fetchImpl,
        })
        const response: TokenCountResponse = { ok: true, entries }
        writeJson(res, 200, response)
      },
    },
  ]
}

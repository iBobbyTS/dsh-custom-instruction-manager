/**
 * MCP 域路由：服务器列表与启用/禁用。
 *
 * 只读 + 开关，不写任何文件：
 *   - GET  /api/skill-hub/mcp          投影 Loader 行 + 行配置 + 当前工具；
 *   - POST /api/skill-hub/mcp/toggle   转发给 dsh 的插件管理接口，
 *     并把刷新后的列表一并回传（面板不用再补一次请求）。
 *
 * 开关的可写性由 dsh 判定：`readOnlyReason` 的行（受保护 / 补丁里没有 id）
 * 会被管理接口拒绝，这里不重复实现那套规则，只如实回传结果。
 */

import { buildMcpResponse, McpAccessError } from '../mcp.ts'
import { SKILL_HUB_API, type McpToggleResponse } from '../protocol.ts'
import { readString, writeError, writeJson, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** MCP 域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function mcpRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // --------------------------------------------------------------- 列表
    {
      path: SKILL_HUB_API.mcp,
      methods: ['GET'],
      handler: async ({ res }) => {
        const access = deps.mcp
        if (access === undefined) {
          writeError(res, 503, 'MCP access is unavailable in this deployment')
          return
        }
        writeJson(res, 200, buildMcpResponse(await access.list()))
      },
    },
    // --------------------------------------------------------------- 开关
    {
      path: SKILL_HUB_API.mcpToggle,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const access = deps.mcp
        if (access === undefined) {
          writeError(res, 503, 'MCP access is unavailable in this deployment')
          return
        }
        const entryId = readString(body, 'entryId').trim()
        if (entryId === '') {
          writeError(res, 400, 'entryId is required')
          return
        }
        const enabled = body.enabled
        if (typeof enabled !== 'boolean') {
          writeError(res, 400, 'enabled must be a boolean')
          return
        }
        try {
          const outcome = await access.setEnabled(entryId, enabled)
          // 开关会触发 dsh 重组；紧接着读一次列表，回传的就是生效后的状态。
          const mcp = buildMcpResponse(await access.list())
          writeJson(res, 200, { ok: true, ...outcome, mcp } satisfies McpToggleResponse)
        } catch (error) {
          // 「不是 MCP 行 / 找不到」是调用方错误，不该报成 500。
          if (error instanceof McpAccessError) {
            writeError(res, error.status, error.message)
            return
          }
          throw error
        }
      },
    },
  ]
}

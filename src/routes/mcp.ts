/**
 * MCP 域路由：服务器列表、启用/禁用、新建/编辑、删除。
 *
 * 读写分工：
 *   - GET  /api/skill-hub/mcp          投影 Loader 行 + 行配置 + 当前工具；
 *   - POST /api/skill-hub/mcp/toggle   转发给 dsh 的插件管理接口；
 *   - POST /api/skill-hub/mcp/save     新建（无 entryId）或编辑（有 entryId）；
 *   - POST /api/skill-hub/mcp/remove   删除本插件受管块里的行。
 *
 * 保存/删除只改 profile 补丁：受管块由本插件重写，其余行交给 dsh 的
 * config-editor（整份校验 + 原子写 + 热应用）。校验错误按字段回 400，冲突
 * （同名服务器、非受管行）回 409，未知行回 404。
 */

import type { ServerResponse } from 'node:http'
import { McpAccessError, buildMcpResponse } from '../mcp.ts'
import { McpPatchError, normalizeServerInput } from '../mcp-patch.ts'
import {
  SKILL_HUB_API,
  type McpFieldError,
  type McpRemoveResponse,
  type McpSaveResponse,
  type McpToggleResponse,
} from '../protocol.ts'
import { readString, writeError, writeJson, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** 400：字段级校验失败（界面按字段标红，而不是弹一条泛泛的错误）。 */
function writeFieldErrors(res: ServerResponse, error: string, fields: readonly McpFieldError[]): void {
  writeJson(res, 400, { error, fields })
}

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
    // --------------------------------------------------------------- 保存
    {
      path: SKILL_HUB_API.mcpSave,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const access = deps.mcp
        const config = deps.mcpConfig
        if (access === undefined || config === undefined) {
          writeError(res, 503, 'MCP management is unavailable in this deployment')
          return
        }
        const entryIdRaw = body.entryId
        if (entryIdRaw !== undefined && (typeof entryIdRaw !== 'string' || entryIdRaw.trim() === '')) {
          writeError(res, 400, 'entryId must be a non-empty string when present')
          return
        }
        const entryId = typeof entryIdRaw === 'string' ? entryIdRaw.trim() : undefined
        const normalized = normalizeServerInput(body.server)
        if (normalized.server === undefined) {
          writeFieldErrors(res, 'invalid MCP server config', normalized.errors)
          return
        }
        try {
          const outcome = await config.save(normalized.server, entryId)
          const mcp = buildMcpResponse(await access.list())
          writeJson(res, 200, { ok: true, ...outcome, mcp } satisfies McpSaveResponse)
        } catch (error) {
          if (error instanceof McpPatchError && error.field !== undefined) {
            writeFieldErrors(res, error.message, [{ field: error.field, code: 'duplicate' }])
            return
          }
          if (error instanceof McpAccessError || error instanceof McpPatchError) {
            writeError(res, error.status, error.message)
            return
          }
          throw error
        }
      },
    },
    // --------------------------------------------------------------- 删除
    {
      path: SKILL_HUB_API.mcpRemove,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const access = deps.mcp
        const config = deps.mcpConfig
        if (access === undefined || config === undefined) {
          writeError(res, 503, 'MCP management is unavailable in this deployment')
          return
        }
        const entryId = readString(body, 'entryId').trim()
        if (entryId === '') {
          writeError(res, 400, 'entryId is required')
          return
        }
        try {
          const outcome = await config.remove(entryId)
          const mcp = buildMcpResponse(await access.list())
          writeJson(res, 200, { ok: true, ...outcome, mcp } satisfies McpRemoveResponse)
        } catch (error) {
          if (error instanceof McpPatchError && error.field !== undefined) {
            writeFieldErrors(res, error.message, [{ field: error.field, code: 'duplicate' }])
            return
          }
          if (error instanceof McpAccessError || error instanceof McpPatchError) {
            writeError(res, error.status, error.message)
            return
          }
          throw error
        }
      },
    },
  ]
}

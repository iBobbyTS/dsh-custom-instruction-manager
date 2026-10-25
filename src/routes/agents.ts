/**
 * AGENTS.md 域路由：只读的指令文件清单（用户级 + 每个已知工作区）。
 *
 * 这一页不写任何文件，也没有开关语义——dsh 对指令文件没有启用/禁用概念。
 * 排除目录清单走既有的 /config 路由（HubConfig.excludeDirs），这一族只负责
 * 按当前配置扫一遍磁盘。
 */

import { SKILL_HUB_API } from '../protocol.ts'
import { InstructionFileError, readInstructionFile, scanInstructionGroups } from '../instructions.ts'
import { writeError, writeJson, writeRouteError, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** AGENTS.md 页的全部路由 spec（由 routes.ts 包上统一围栏）。 */
export function agentsRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    {
      path: SKILL_HUB_API.agents,
      methods: ['GET'],
      handler: async ({ res }) => {
        try {
          writeJson(res, 200, await scanInstructionGroups(deps))
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },
    {
      path: SKILL_HUB_API.agentsFile,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const requested = (url.searchParams.get('path') ?? '').trim()
        if (requested === '') { writeError(res, 400, 'path is required'); return }
        try {
          writeJson(res, 200, { ok: true, file: await readInstructionFile(deps, requested) })
        } catch (error) {
          if (error instanceof InstructionFileError) { writeError(res, error.status, error.message); return }
          writeRouteError(res, error)
        }
      },
    },
  ]
}

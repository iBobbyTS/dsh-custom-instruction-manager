/**
 * 分组域路由：groups。从 routes.ts 原样搬出，handler 逻辑不变。
 * 集合顺序由名称决定（工作区分组的顺序来自 dsh 侧面栏），不再支持手动重排。
 */

import { SKILL_HUB_API } from '../protocol.ts'
import { buildGroups, writeJson, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** 分组域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function groupRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // -------------------------------------------------------------- groups
    // 系统集合组 + origin 映射（前端分组栏的数据源）。
    {
      path: SKILL_HUB_API.groups,
      methods: ['GET'],
      handler: async ({ res }) => {
        writeJson(res, 200, await buildGroups(deps))
      },
    },
  ]
}

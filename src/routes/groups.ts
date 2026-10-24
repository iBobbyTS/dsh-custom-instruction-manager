/**
 * 分组域路由：groups / collection 重排 / source-group 重排。从 routes.ts
 * 原样搬出，handler 逻辑不变。
 */

import {
  SKILL_HUB_API,
  type CollectionReorderResponse,
  type SourceGroupReorderResponse,
} from '../protocol.ts'
import {
  buildGroups,
  readStrings,
  writeJson,
  type RouteSpec,
  type SkillHubRouteDeps,
} from './helpers.ts'

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
    // ------------------------------------------------- collection/reorder
    // 拖拽重排来源集合顺序
    {
      path: SKILL_HUB_API.collectionReorder,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const orderedNames = readStrings(body, 'orderedNames')
        const order = await deps.store.reorderCollections(orderedNames)
        const groups = await buildGroups(deps)
        writeJson(res, 200, { ok: true, collections: groups.collections, order } satisfies CollectionReorderResponse)
      },
    },
    // ------------------------------------------------ source-group/reorder
    // 拖拽重排来源顶层分组（project / collections / personal 统一顺序）
    {
      path: SKILL_HUB_API.sourceGroupReorder,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const orderedKeys = readStrings(body, 'orderedKeys')
        const order = await deps.store.reorderSourceGroups(orderedKeys)
        writeJson(res, 200, { ok: true, order } satisfies SourceGroupReorderResponse)
      },
    },
  ]
}

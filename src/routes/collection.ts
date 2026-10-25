/**
 * routes 共享层 · 集合装配：origin 映射 → 集合组，以及 groups 路由的数据源。
 * 从 helpers.ts 原样搬出；集合顺序固定按名称，不再有手动重排。
 */

import type { CollectionGroup, GroupsResponse } from '../protocol.ts'
import type { SkillHubRouteDeps } from './deps.ts'

/**
 * 由 origin 映射（skillName → 仓库）构建集合组，按集合名排序。
 * catalog/groups 与 sources 路由共用这一份排序语义。
 */
export function buildCollections(origins: Readonly<Record<string, string>>): CollectionGroup[] {
  const byCollection = new Map<string, string[]>()
  for (const [skillName, origin] of Object.entries(origins)) {
    const list = byCollection.get(origin)
    if (list === undefined) byCollection.set(origin, [skillName])
    else list.push(skillName)
  }
  return [...byCollection.entries()]
    .map(([name, skillNames]) => ({ name, skillNames: [...skillNames].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** 系统集合组 + origin 映射（groups 路由的数据源）。 */
export async function buildGroups(deps: SkillHubRouteDeps): Promise<GroupsResponse> {
  const origins = await deps.store.listOrigins()
  return { ok: true, collections: buildCollections(origins), origins }
}

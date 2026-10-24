/** 系统集合组：按 origin（来源集合标识）自动聚合。 */
export interface CollectionGroup {
  /** 集合名（origin 值，如 "superpowers" / "anthropics/skills"）。 */
  name: string
  /** 该集合下的技能名，按名称排序。 */
  skillNames: string[]
}

/** GET /api/skill-hub/groups */
export interface GroupsResponse {
  ok: true
  /** 系统集合组（按拖拽顺序，兜底按名称）。 */
  collections: CollectionGroup[]
  /** skillName → 集合名 的完整映射。 */
  origins: Record<string, string>
  /** 来源分组整体顺序（project / col:xxx / uncategorized-source），用于 SourcesView 顶层排序 */
  sourceGroupOrder?: string[]
  /** 兼容旧 collectionOrder 字段 */
  collectionOrder?: string[]
}

/** POST /api/skill-hub/collections/reorder — 拖拽重排来源集合 */
export interface CollectionReorderRequest {
  /** 按新顺序排列的集合名列表（需包含全部 name） */
  orderedNames: string[]
}
/** POST /api/skill-hub/collections/reorder */
export interface CollectionReorderResponse {
  ok: true
  collections: CollectionGroup[]
  order: string[]
}

/** POST /api/skill-hub/source-groups/reorder — 拖拽重排来源顶层分组（project / collections / personal） */
export interface SourceGroupReorderRequest {
  /** 按新顺序排列的顶层分组 key 列表（project / col:xxx / uncategorized-source） */
  orderedKeys: string[]
}
export interface SourceGroupReorderResponse {
  ok: true
  order: string[]
}

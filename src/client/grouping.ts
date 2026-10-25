/**
 * Pure grouping helpers for the skill-hub panel (no React/DOM deps, so the
 * merge/classify/filter logic stays unit-testable).
 *
 * The "分组" view groups a skill by its origin collection (sidecar sources →
 * backend-aggregated CollectionGroup).
 *
 * Switch semantics: a skill's enabled state is global (the file is renamed
 * once), so a group switch is derived from its members' actual states:
 * all members enabled → 'on', all disabled → 'off', otherwise 'mixed'.
 * Closing a group whose member is enabled in another group is a conflict the
 * GUI resolves with a dialog; the helpers below compute both sides.
 */

import type { CatalogSkill, CollectionGroup, DisabledSkill } from '../protocol.ts'
import { isProjectSource } from '../protocol.ts'

export { isProjectSource }

/**
 * 技能是否有真实磁盘文件（用户根 / 项目根）。bundled 与第三方 provider
 * 注册的技能只存在于应用包或 provider 内存里，Finder 打不开。
 */
export function isFileSource(source: string): boolean {
  return source === 'user-dsh' || source === 'user-agents' || isProjectSource(source)
}

/** Grouped switch state derived from member enablement. */
export type GroupSwitchState = 'on' | 'off' | 'mixed'

/** The derived switch view of one group. */
export interface GroupSwitchView {
  state: GroupSwitchState
  /** Writable members currently enabled. */
  enabled: string[]
  /** Writable members currently disabled. */
  disabled: string[]
}

/**
 * Derive a group switch view from its member names and the set of currently
 * enabled skill names (catalog.skills). Members not in the enabled set count
 * as disabled (catalog.disabled or absent read-only rows).
 */
export function groupSwitchView(members: readonly string[], enabledNames: ReadonlySet<string>): GroupSwitchView {
  const enabled: string[] = []
  const disabled: string[] = []
  for (const name of members) {
    if (enabledNames.has(name)) enabled.push(name)
    else disabled.push(name)
  }
  const state: GroupSwitchState = disabled.length === 0 ? 'on' : enabled.length === 0 ? 'off' : 'mixed'
  return { state, enabled, disabled }
}

/** Names of every source collection a skill belongs to. */
export function groupNamesOf(name: string, collections: readonly CollectionGroup[]): string[] {
  const names: string[] = []
  for (const collection of collections) if (collection.skillNames.includes(name)) names.push(collection.name)
  return names
}

/**
 * Stable React key for one catalog row.
 *
 * A skill NAME is not unique in the catalog: the host keys project skills by
 * `<name>+<workspace>+<source>` on purpose, so the same name may legitimately
 * appear twice (two workspaces owning a skill of that name, or the same name
 * coming from different roots/providers). Keying rows by name alone collides
 * inside one list, and React then mis-reconciles the list: switching the
 * 平铺/分组 view leaves the stale rows in the DOM and they pile up on every
 * further switch. The identity below matches the host's logical key.
 */
export function skillRowKey(skill: Pick<CatalogSkill, 'name' | 'source' | 'workspace'>): string {
  return 'skill\0' + skill.source + '\0' + (skill.workspace ?? '') + '\0' + skill.name
}

/** Stable React key for one disabled (`.disabled`) row: its root decides which row it is. */
export function disabledRowKey(record: Pick<DisabledSkill, 'name' | 'root'>): string {
  return 'disabled\0' + record.root + '\0' + record.name
}

/**
 * Members of a group that are currently enabled AND also belong to at least
 * one other group — the set a "close" action must ask about.
 */
export function conflictsOnClose(
  members: readonly string[],
  enabledNames: ReadonlySet<string>,
  otherGroups: ReadonlyArray<{ members: readonly string[] }>,
): string[] {
  return members.filter((name) => {
    if (!enabledNames.has(name)) return false
    return otherGroups.some((group) => group.members.includes(name))
  })
}

/** Origin-repo filter value: skills with no source record (private skills). */
export const PRIVATE_SOURCE = 'private'

/**
 * Apply the origin filter ('all' or a specific origin repo; skills without a
 * source record count as PRIVATE_SOURCE). The origins map is the store's
 * skillName → repo derivation, so filtering follows the tracked source
 * records instead of the filesystem root a skill happens to live under.
 * 项目级技能（有 workspace 归属）永远不算「个人」。
 */
export function filterBySource(skills: readonly CatalogSkill[], source: string, origins: Readonly<Record<string, string>>): CatalogSkill[] {
  if (source === 'all') return [...skills]
  return skills.filter((skill) => {
    if (isProjectSource(skill.source)) return false
    return (origins[skill.name] ?? PRIVATE_SOURCE) === source
  })
}

/** One origin collection with the members visible under the current filters. */
export interface VisibleCollection {
  collection: CollectionGroup
  /** Enabled, currently visible members. */
  skills: CatalogSkill[]
  /** Disabled records passing the current name/description filter. */
  disabledMembers: DisabledSkill[]
}

/**
 * 个人技能二级分类的标题：提供者 id；已禁用记录没有提供者字段，来源
 * 又无法从已启用成员推断时退化成来源标签（用户 .dsh / 用户 .agents）。
 */
export type ProviderBucketTitle =
  | { kind: 'provider'; provider: string }
  | { kind: 'source'; source: string }

/** 个人技能按提供者（provider）聚合出的一个二级分组。 */
export interface ProviderBucket {
  /** 稳定键（`provider:<id>` / `source:<来源>`），与折叠状态共用。 */
  key: string
  title: ProviderBucketTitle
  /** 该提供者下、且通过当前筛选的已启用技能。 */
  skills: CatalogSkill[]
  /** 该提供者下、且通过当前筛选的已禁用记录。 */
  disabled: DisabledSkill[]
}

/**
 * Group the personal (untracked, non-project) skills by 提供者 — the
 * provider id the registry reports, which is what tells user-owned skills
 * apart from bundled / third-party-plugin skills.
 *
 * Bucket order follows first appearance in the incoming (already sorted)
 * list, so the chosen sort key still decides the subgroup order. Disabled
 * records carry no provider, so each one joins the bucket of a currently
 * enabled skill from the same root (user-dsh / user-agents); when that root
 * has no enabled member left, it falls back to its own source-titled bucket.
 */
export function personalProviderBuckets(
  skills: readonly CatalogSkill[],
  disabled: readonly DisabledSkill[],
): ProviderBucket[] {
  const buckets: ProviderBucket[] = []
  const byProvider = new Map<string, ProviderBucket>()
  for (const skill of skills) {
    let bucket = byProvider.get(skill.provider)
    if (bucket === undefined) {
      bucket = { key: 'provider:' + skill.provider, title: { kind: 'provider', provider: skill.provider }, skills: [], disabled: [] }
      byProvider.set(skill.provider, bucket)
      buckets.push(bucket)
    }
    bucket.skills.push(skill)
  }
  // 来源 → 已启用技能的提供者，用于把禁用记录挂回它所在的提供者分组。
  const bucketBySource = new Map<string, ProviderBucket>()
  for (const bucket of buckets) {
    for (const skill of bucket.skills) {
      if (!bucketBySource.has(skill.source)) bucketBySource.set(skill.source, bucket)
    }
  }
  const fallbacks = new Map<string, ProviderBucket>()
  for (const record of disabled) {
    // WritableRoot 本身就是来源标识（user-dsh / user-agents）。
    const source: string = record.root
    let bucket = bucketBySource.get(source)
    if (bucket === undefined) {
      bucket = fallbacks.get(source)
      if (bucket === undefined) {
        bucket = { key: 'source:' + source, title: { kind: 'source', source }, skills: [], disabled: [] }
        fallbacks.set(source, bucket)
        buckets.push(bucket)
      }
    }
    bucket.disabled.push(record)
  }
  return buckets
}

/**
 * Match origin collections against the currently visible enabled skills and
 * disabled records, dropping collections with no visible member. Without
 * this, a stale origin (skill deleted on disk, or a `.disabled` file whose
 * sidecar record was lost) renders a group header with zero rows — an empty
 * shell the sources tab otherwise never shows (project/personal groups
 * already disappear when they have nothing to display).
 */
export function visibleCollections(
  collections: readonly CollectionGroup[],
  visibleSkills: readonly CatalogSkill[],
  disabledRecords: readonly DisabledSkill[],
  normalized: string,
  sourceFilter: string,
  origins: Readonly<Record<string, string>>,
): VisibleCollection[] {
  const visible: VisibleCollection[] = []
  for (const collection of collections) {
    const skills = visibleSkills.filter((skill) => collection.skillNames.includes(skill.name))
    const disabledMembers = disabledRecords.filter((record) =>
      collection.skillNames.includes(record.name)
      && (normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized))
      && (sourceFilter === 'all' || (origins[record.name] ?? PRIVATE_SOURCE) === sourceFilter))
    if (skills.length > 0 || disabledMembers.length > 0) visible.push({ collection, skills, disabledMembers })
  }
  return visible
}

/** Catalog sort keys offered by the filter bar. */
export type SortKey = 'name' | 'added' | 'uses'

/**
 * Sort a skill list in place-safe copy order: name ascending, added
 * descending (newest first, unknown addedAt last), or uses descending
 * (most-called first). Unknown values always trail.
 */
export function sortSkills(skills: readonly CatalogSkill[], key: SortKey, getUses?: (name: string) => number | undefined): CatalogSkill[] {
  const list = [...skills]
  if (key === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name))
  } else if (key === 'added') {
    list.sort((a, b) => (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity))
  } else if (key === 'uses') {
    list.sort((a, b) => (getUses?.(b.name) ?? 0) - (getUses?.(a.name) ?? 0))
  }
  return list
}

/**
 * Rank one workspace path in the dsh sidebar (registry) order.
 * Unknown paths — including the cwd-scoped pseudo workspace and project skills
 * whose workspace is unset — trail every known one, so a partially known order
 * still renders deterministically.
 */
export function workspaceRank(path: string | undefined, order: readonly string[]): number {
  if (path === undefined) return order.length
  const index = order.indexOf(path)
  return index === -1 ? order.length : index
}

/** Localized relative-time tuple; the caller resolves it via tt(). */
export interface RelativeTime {
  key: 'time.justNow' | 'time.minutesAgo' | 'time.hoursAgo' | 'time.daysAgo' | 'time.weeksAgo'
  value?: number
}

/** Format an epoch-ms timestamp as a short relative time bucket. */
export function formatRelativeTime(ms: number, now = Date.now()): RelativeTime {
  const diff = Math.max(0, now - ms)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return { key: 'time.justNow' }
  if (minutes < 60) return { key: 'time.minutesAgo', value: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { key: 'time.hoursAgo', value: hours }
  const days = Math.floor(hours / 24)
  if (days < 7) return { key: 'time.daysAgo', value: days }
  return { key: 'time.weeksAgo', value: Math.floor(days / 7) }
}

/**
 * useGroupView — 分组视图的派生数据：来源过滤后的技能、可见集合、用户级
 * 管理方聚合、项目级成员、顶层顺序，以及「可折叠节点」与「是否已全部折叠」。
 *
 * 抽出来是因为「全部折叠」按钮长在视图切换那一行（「分组」右边），而折叠
 * 键必须和 SourcesView 渲染的节点完全一致：两处共用同一份推导，避免按钮
 * 算到的键与列表里的键对不上（点了只折叠一半）。纯派生，不发起请求。
 */

import { useMemo } from 'react'
import type { CatalogSkill, CollectionGroup, DisabledSkill } from '../../../protocol.ts'
import {
  filterBySource,
  isProjectSource,
  personalManagedBuckets,
  PRIVATE_SOURCE,
  visibleCollections,
  type ManagedBucket,
  type VisibleCollection,
} from '../../grouping.ts'
import type { SkillHubState } from '../useSkillHub.ts'

export interface GroupView {
  /** 通过来源筛选的技能（含项目级，用于分组；平铺视图自己另取 sorted）。 */
  sourceFiltered: CatalogSkill[]
  /** 通过筛选的项目级技能。 */
  projectSkillsAll: CatalogSkill[]
  hasProject: boolean
  /** 有可见成员的上游集合。 */
  visible: VisibleCollection[]
  collections: CollectionGroup[]
  /** 未绑定来源、非项目级的技能（用户级）。 */
  uncategorized: CatalogSkill[]
  personalDisabled: DisabledSkill[]
  allPersonalNames: string[]
  hasPersonal: boolean
  personalBuckets: ManagedBucket[]
  subdividedPersonal: boolean
  /** 顶层分组顺序：用户级 → 来源集合 → 项目级。 */
  topKeys: string[]
  /** 当前视图里可折叠的节点键（二级分组、集合、管理方桶）。 */
  collapsibleKeys: string[]
  /** 可折叠节点是否已全部折叠。 */
  allCollapsed: boolean
}

export function useGroupView(hub: SkillHubState): GroupView {
  const {
    catalog, groupsState, sourceFilter, origins, sorted, normalized,
    collapsedGroups, subdividedProjects,
  } = hub

  const sourceFiltered = useMemo(() => filterBySource(sorted, sourceFilter, origins), [sorted, sourceFilter, origins])
  const projectSkillsAll = useMemo(() => sourceFiltered.filter((skill) => isProjectSource(skill.source)), [sourceFiltered])
  const hasProject = projectSkillsAll.length > 0
  // 无可见成员的来源组不渲染：来源记录指向的技能可能已被删除，或禁用记录
  // 丢失导致技能既非启用也非禁用，留下一个组头有数字、展开 0 行的空壳。
  const visible = useMemo(
    () => visibleCollections(groupsState?.collections ?? [], sourceFiltered, catalog?.disabled ?? [], normalized, sourceFilter, origins),
    [groupsState, sourceFiltered, catalog, normalized, sourceFilter, origins],
  )
  const collections = useMemo(() => visible.map((entry) => entry.collection), [visible])
  const uncategorized = useMemo(
    () => sourceFiltered.filter((skill) => origins[skill.name] === undefined && !isProjectSource(skill.source)),
    [sourceFiltered, origins],
  )
  const personalDisabled = useMemo(
    () => (catalog?.disabled ?? [])
      .filter((record) => origins[record.name] === undefined)
      .filter((record) => normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized))
      .filter(() => sourceFilter === 'all' || sourceFilter === PRIVATE_SOURCE),
    [catalog, origins, normalized, sourceFilter],
  )
  const allPersonalNames = useMemo(
    () => [...uncategorized.map((skill) => skill.name), ...personalDisabled.map((record) => record.name)],
    [uncategorized, personalDisabled],
  )
  const hasPersonal = allPersonalNames.length > 0
  // 个人技能二级分类：按「管理方」聚合，复用项目级 .dsh/.agents 那一层的
  // 显示。用户自己的技能统一成 User Managed，不再逐个显示 provider id；
  // 只有一个管理方时不铺二级（单组的二级头纯属噪音）。
  const personalBuckets = useMemo(() => personalManagedBuckets(uncategorized, personalDisabled), [uncategorized, personalDisabled])
  const subdividedPersonal = personalBuckets.length > 1
  /** 顶层分组顺序：用户级 → 来源集合 → 项目级（全部由数据推导，不可重排）。 */
  const topKeys = useMemo(() => [
    ...(hasPersonal ? ['uncategorized-source'] : []),
    ...collections.map((collection) => 'col:' + collection.name),
    ...(hasProject ? ['project'] : []),
  ], [hasPersonal, collections, hasProject])
  /** 仍然可以折叠的节点（顶层已改成小标题，只剩二级/集合）。 */
  const collapsibleKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const collection of collections) keys.add('col:' + collection.name)
    for (const skill of projectSkillsAll) {
      const workspace = skill.workspace ?? skill.source
      keys.add('project:' + workspace)
      if (subdividedProjects.has(workspace)) keys.add('project:' + workspace + ':' + skill.source)
    }
    if (subdividedPersonal) for (const bucket of personalBuckets) keys.add('personal:' + bucket.key)
    return [...keys]
  }, [collections, projectSkillsAll, subdividedProjects, subdividedPersonal, personalBuckets])
  /** 可折叠节点是否已全部折叠（决定「全部折叠/展开」按钮的文案）。 */
  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every((key) => collapsedGroups.has(key))

  return {
    sourceFiltered, projectSkillsAll, hasProject, visible, collections, uncategorized,
    personalDisabled, allPersonalNames, hasPersonal, personalBuckets, subdividedPersonal,
    topKeys, collapsibleKeys, allCollapsed,
  }
}

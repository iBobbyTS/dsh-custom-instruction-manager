/**
 * Sources tab: the flat skill list or the grouped view — a project-level
 * three-tier tree (workspaces from workspace.json, each optionally split by
 * .dsh/.agents), one group per upstream collection with check/sync/
 * follow-delete actions and the tri-state switch, plus the uncategorized
 * "personal" group (project skills never count as personal).
 *
 * Top-level groups follow the official 插件 page: a plain 14/500 section
 * heading ("用户级" / "项目级"), not a collapsible header. Only nested nodes
 * (collections, project workspaces, provider buckets) keep their disclosure.
 * Ordering is derived — user-level first, then collections by name, then the
 * project tree (workspaces follow the dsh sidebar) — because the hub no longer
 * offers manual reordering.
 */

import { useMemo, type JSX } from 'react'
import { tt } from '../helpers.ts'
import { disabledRowKey, filterBySource, groupSwitchView, isProjectSource, personalProviderBuckets, PRIVATE_SOURCE, skillRowKey, visibleCollections } from '../grouping.ts'
import { SkillRow } from './SkillRow.tsx'
import { DisabledRow } from './DisabledRow.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import { SubGroup } from './SubGroup.tsx'
import { ProjectTree } from './ProjectTree.tsx'
import { CollectionCard } from './CollectionCard.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

export function SourcesView(props: { hub: SkillHubState }): JSX.Element {
  const { hub } = props
  const { catalog, groupsState, skillView, sourceFilter, origins, sorted, normalized, collapsedGroups, viewNames, sourceCheck, actionNames, checkingSource, syncingSource, batchBusy, busyNames, toggleGroupCollapse, setAllGroupsCollapsed, checkSources, requestSync, requestDelete, requestDeleteGroup, toggleGroup, enableDisabled } = hub
  /** 重复技能名集合：整表只建一次，行内用 has 取代逐行线性 includes。 */
  const duplicateNames = useMemo(() => new Set(catalog?.duplicateNames ?? []), [catalog])
  /** dsh 侧面栏的工作区顺序；项目级分组按它排列（未知名排最后）。 */
  const workspaceOrder = useMemo(() => (catalog?.workspaces ?? []).map((entry) => entry.path), [catalog])

  const sourceFiltered = filterBySource(sorted, sourceFilter, origins)
  const projectSkillsAll = sourceFiltered.filter((skill) => isProjectSource(skill.source))
  const hasProject = projectSkillsAll.length > 0
  // 无可见成员的来源组不渲染：来源记录指向的技能可能已被删除，或禁用记录
  // 丢失导致技能既非启用也非禁用，留下一个组头有数字、展开 0 行的空壳。
  const visible = visibleCollections(groupsState?.collections ?? [], sourceFiltered, catalog?.disabled ?? [], normalized, sourceFilter, origins)
  const collections = visible.map((entry) => entry.collection)
  const uncategorized = sourceFiltered.filter((skill) => origins[skill.name] === undefined && !isProjectSource(skill.source))
  const personalDisabled = (catalog?.disabled ?? []).filter((record) => origins[record.name] === undefined)
    .filter((record) => normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized))
    .filter(() => sourceFilter === 'all' || sourceFilter === PRIVATE_SOURCE)
  const allPersonalNames = [...uncategorized.map((s) => s.name), ...personalDisabled.map((r) => r.name)]
  const hasPersonal = allPersonalNames.length > 0
  // 个人技能二级分类：按提供者（provider）聚合，复用项目级 .dsh/.agents
  // 那一层的显示。只有一个提供者时不铺二级（单组的二级头纯属噪音）。
  const personalBuckets = personalProviderBuckets(uncategorized, personalDisabled)
  const subdividedPersonal = personalBuckets.length > 1
  /** 顶层分组顺序：用户级 → 来源集合 → 项目级（全部由数据推导，不可重排）。 */
  const topKeys: string[] = [
    ...(hasPersonal ? ['uncategorized-source'] : []),
    ...collections.map((c) => 'col:' + c.name),
    ...(hasProject ? ['project'] : []),
  ]
  /** 仍然可以折叠的节点（顶层已改成小标题，只剩二级/集合）。 */
  const collapsibleKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const collection of collections) keys.add('col:' + collection.name)
    for (const skill of projectSkillsAll) {
      const workspace = skill.workspace ?? skill.source
      keys.add('project:' + workspace)
      if (hub.subdividedProjects.has(workspace)) keys.add('project:' + workspace + ':' + skill.source)
    }
    if (subdividedPersonal) for (const bucket of personalBuckets) keys.add('personal:' + bucket.key)
    return [...keys]
  }, [collections, projectSkillsAll, hub.subdividedProjects, subdividedPersonal, personalBuckets])
  /** 可折叠节点是否已全部折叠（决定「全部折叠/展开」按钮的文案）。 */
  const allCollapsed = collapsibleKeys.length > 0 && collapsibleKeys.every((key) => collapsedGroups.has(key))
  /** SkillRow 收窄后的 props：父组件统一传入它实际消费的字段。 */
  const rowProps = { uses: hub.uses, hubConfig: hub.hubConfig, busyNames, listBusy: hub.listBusy, duplicateNames, toggle: hub.toggle, openDetail: hub.openDetail, requestDeleteSkill: hub.requestDeleteSkill, reveal: hub.reveal }

  if (skillView === 'flat') {
    return <div className={css.list}>{sourceFiltered.map((skill) => <SkillRow key={skillRowKey(skill)} skill={skill} {...rowProps} />)}</div>
  }

  // 空状态：没有任何分组时提示
  const isEmptyTop = !hasProject && collections.length === 0 && !hasPersonal
  return (
    <>
      {isEmptyTop ? <div className={css.empty}>{tt('groups.noCollections')}</div> : null}
      {collapsibleKeys.length > 0 ? (
        <div className={css.listTools}>
          <button type='button' className={css.opBtn} onClick={() => { setAllGroupsCollapsed(allCollapsed ? null : collapsibleKeys) }}>
            {allCollapsed ? tt('groups.expandAll') : tt('groups.collapseAll')}
          </button>
        </div>
      ) : null}
      {topKeys.map((topKey) => {
        // Project 顶层分组：小标题 + 工作区树
        if (topKey === 'project' && hasProject) {
          return (
            <ProjectTree
              key="project"
              skills={projectSkillsAll}
              collapsedGroups={collapsedGroups}
              toggleGroupCollapse={toggleGroupCollapse}
              subdividedProjects={hub.subdividedProjects}
              toggleSubdivide={hub.toggleSubdivide}
              rowProps={rowProps}
              workspaceOrder={workspaceOrder}
            />
          )
        }
        // Collection 分组（上游集合，保留折叠与整组开关）
        if (topKey.startsWith('col:')) {
          const colName = topKey.slice(4)
          const entry = visible.find((item) => item.collection.name === colName)
          if (entry === undefined) return null
          const { collection, skills, disabledMembers } = entry
          const collapsed = collapsedGroups.has('col:' + collection.name)
          const view = groupSwitchView(collection.skillNames, viewNames)
          const check = sourceCheck[collection.name]
          const hasWritable = collection.skillNames.some((name) => actionNames.has(name))
          return (
            <CollectionCard
              key={'col:' + collection.name}
              collection={collection}
              skills={skills}
              disabledMembers={disabledMembers}
              collapsed={collapsed}
              view={view}
              check={check}
              hasWritable={hasWritable}
              editMode={hub.editMode}
              checkingSource={checkingSource}
              syncingSource={syncingSource}
              batchBusy={batchBusy}
              rowProps={rowProps}
              toggleGroupCollapse={toggleGroupCollapse}
              checkSources={checkSources}
              requestSync={requestSync}
              requestDelete={requestDelete}
              toggleGroup={toggleGroup}
              requestDeleteGroup={requestDeleteGroup}
              enableDisabled={enableDisabled}
              openDetail={hub.openDetail}
            />
          )
        }
        // Personal 顶层分组：小标题 + 提供者二级分类
        if (topKey === 'uncategorized-source' && hasPersonal) {
          if (allPersonalNames.length === 0) return null
          return (
            <section key="uncategorized-source" className={css.section}>
              <div className={css.sectionHead}>
                <h2 className={css.sectionTitle}>
                  {tt('groups.personal')} · {allPersonalNames.length}
                  <GroupSummary members={allPersonalNames} uses={hub.uses} hubConfig={hub.hubConfig} />
                </h2>
                {hub.editMode ? (
                  <span className={css.groupOps}>
                    <button type='button' className={css.opBtn + ' ' + css.opDanger} title={tt('source.deleteGroupHint', { count: allPersonalNames.length })} onClick={(event) => { event.stopPropagation(); requestDeleteGroup(tt('groups.personal'), allPersonalNames) }}>{tt('source.deleteGroup')}</button>
                  </span>
                ) : null}
              </div>
              {subdividedPersonal ? (
                /* 二级只有一层，不再套外层 .projectNest：缩进与项目级的
                   第一层细分（external-subagent 那条）对齐。 */
                personalBuckets.map((bucket) => {
                  const subKey = 'personal:' + bucket.key
                  const subCollapsed = collapsedGroups.has(subKey)
                  const { title } = bucket
                  /** 提供者桶显示 provider id；兜底桶显示本地化的根目录来源。 */
                  const titleText = title.kind === 'provider'
                    ? title.provider
                    : tt(('badge.source.' + title.source) as 'badge.source.user-dsh' | 'badge.source.user-agents')
                  return (
                    <SubGroup
                      key={subKey}
                      title={titleText}
                      titleHint={title.kind === 'provider' ? tt('groups.provider') : undefined}
                      count={bucket.skills.length + bucket.disabled.length}
                      collapsed={subCollapsed}
                      onToggle={() => { toggleGroupCollapse(subKey) }}
                    >
                      {bucket.skills.map((skill) => <SkillRow key={skillRowKey(skill)} skill={skill} {...rowProps} />)}
                      {bucket.disabled.map((record) => (<DisabledRow key={disabledRowKey(record)} record={record} busy={busyNames.has(record.name)} duplicate={duplicateNames.has(record.name)} onEnable={() => { void enableDisabled(record) }} onOpen={() => { void hub.openDetail(record.name) }} reveal={() => { hub.reveal(record.name) }} requestDelete={() => { hub.requestDeleteSkill(record.name) }} />))}
                    </SubGroup>
                  )
                })
              ) : (
                <div className={css.list}>
                  {uncategorized.map((skill) => <SkillRow key={skillRowKey(skill)} skill={skill} {...rowProps} />)}
                  {personalDisabled.map((record) => (<DisabledRow key={disabledRowKey(record)} record={record} busy={busyNames.has(record.name)} duplicate={duplicateNames.has(record.name)} onEnable={() => { void enableDisabled(record) }} onOpen={() => { void hub.openDetail(record.name) }} reveal={() => { hub.reveal(record.name) }} requestDelete={() => { hub.requestDeleteSkill(record.name) }} />))}
                </div>
              )}
            </section>
          )
        }
        return null
      })}
    </>
  )
}

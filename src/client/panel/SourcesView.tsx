/**
 * Sources tab: the flat skill list or the grouped view — a project-level
 * three-tier tree (workspaces from workspace.json, each optionally split by
 * .dsh/.agents), one group per upstream collection with check/sync/
 * follow-delete actions and the tri-state switch, plus the uncategorized
 * "personal" group (project skills never count as personal).
 *
 * Top-level groups follow the official 插件 page: a plain 14/500 section
 * heading ("用户级" / "项目级"), not a collapsible header. Only nested nodes
 * (collections, project workspaces, managed-by buckets) keep their disclosure.
 * Ordering is derived — user-level first, then collections by name, then the
 * project tree (workspaces follow the dsh sidebar) — because the hub no longer
 * offers manual reordering.
 *
 * The grouping derivation lives in useGroupView (shared with the toolbar's
 * collapse-all button, which sits next to the view switcher); this component
 * only renders it.
 */

import { useMemo, type JSX } from 'react'
import { managedByText, tt } from '../helpers.ts'
import { disabledRowKey, groupSwitchView, skillRowKey } from '../grouping.ts'
import type { GroupView } from './hooks/useGroupView.ts'
import { SkillRow } from './SkillRow.tsx'
import { DisabledRow } from './DisabledRow.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import { SubGroup } from './SubGroup.tsx'
import { ProjectTree } from './ProjectTree.tsx'
import { CollectionCard } from './CollectionCard.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

export function SourcesView(props: { hub: SkillHubState; view: GroupView }): JSX.Element {
  const { hub, view } = props
  const {
    catalog, skillView, collapsedGroups, viewNames, sourceCheck, actionNames,
    checkingSource, syncingSource, batchBusy, busyNames, toggleGroupCollapse,
    checkSources, requestSync, requestDelete, toggleGroup, enableDisabled,
  } = hub
  const {
    sourceFiltered, projectSkillsAll, hasProject, visible, collections,
    uncategorized, personalDisabled, allPersonalNames, hasPersonal,
    personalBuckets, subdividedPersonal, topKeys,
  } = view
  /** 重复技能名集合：整表只建一次，行内用 has 取代逐行线性 includes。 */
  const duplicateNames = useMemo(() => new Set(catalog?.duplicateNames ?? []), [catalog])
  /** dsh 侧面栏的工作区顺序；项目级分组按它排列（未知名排最后）。 */
  const workspaceOrder = useMemo(() => (catalog?.workspaces ?? []).map((entry) => entry.path), [catalog])
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
          const switchView = groupSwitchView(collection.skillNames, viewNames)
          const check = sourceCheck[collection.name]
          const hasWritable = collection.skillNames.some((name) => actionNames.has(name))
          return (
            <CollectionCard
              key={'col:' + collection.name}
              collection={collection}
              skills={skills}
              disabledMembers={disabledMembers}
              collapsed={collapsed}
              view={switchView}
              check={check}
              hasWritable={hasWritable}
              checkingSource={checkingSource}
              syncingSource={syncingSource}
              batchBusy={batchBusy}
              rowProps={rowProps}
              toggleGroupCollapse={toggleGroupCollapse}
              checkSources={checkSources}
              requestSync={requestSync}
              requestDelete={requestDelete}
              toggleGroup={toggleGroup}
              enableDisabled={enableDisabled}
              openDetail={hub.openDetail}
            />
          )
        }
        // Personal 顶层分组：小标题 + 管理方二级分类
        if (topKey === 'uncategorized-source' && hasPersonal) {
          if (allPersonalNames.length === 0) return null
          return (
            <section key="uncategorized-source" className={css.section}>
              <div className={css.sectionHead}>
                <h2 className={css.sectionTitle}>
                  {tt('groups.personal')} · {allPersonalNames.length}
                  <GroupSummary members={allPersonalNames} uses={hub.uses} hubConfig={hub.hubConfig} />
                </h2>
              </div>
              {subdividedPersonal ? (
                /* 二级只有一层，不再套外层 .projectNest：缩进与项目级的
                   第一层细分（external-subagent 那条）对齐。 */
                personalBuckets.map((bucket) => {
                  const subKey = 'personal:' + bucket.key
                  const subCollapsed = collapsedGroups.has(subKey)
                  return (
                    <SubGroup
                      key={subKey}
                      title={managedByText(bucket.managed)}
                      titleHint={tt('groups.managedBy')}
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

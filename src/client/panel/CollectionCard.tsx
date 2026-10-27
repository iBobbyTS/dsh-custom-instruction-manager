/**
 * CollectionCard — 一个上游来源集合分组：组头（来源链接 + 成员数 + 用量
 * 汇总）、检查/同步/跟删徽章，以及展开后的技能行。
 * 数据与动作均由 SourcesView 传入；顺序由集合名决定。
 */

import type { JSX } from 'react'
import type { CatalogSkill, CollectionGroup, SourceCheckResult } from '../../protocol.ts'
import { skillRowKey } from '../grouping.ts'
import { tt } from '../helpers.ts'
import { SourceStatusBadge } from './SourceStatusBadge.tsx'
import { SkillRow, type SkillRowProps } from './SkillRow.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import type { SkillHubState } from './useSkillHub.ts'
import css from './panel.module.css'

export interface CollectionCardProps {
  collection: CollectionGroup
  /** 该集合内、且通过筛选的技能。 */
  skills: CatalogSkill[]
  /** 该集合分组是否折叠。 */
  collapsed: boolean
  /** 该来源的上游检查结果。 */
  check: SourceCheckResult | undefined
  /** 正在检查的来源名。 */
  checkingSource: string | null
  /** 正在同步的来源名。 */
  syncingSource: string | null
  /** SkillRow 共用的收窄 props（skill 由行内传入）。 */
  rowProps: Omit<SkillRowProps, 'skill'>
  toggleGroupCollapse: SkillHubState['toggleGroupCollapse']
  checkSources: SkillHubState['checkSources']
  requestSync: SkillHubState['requestSync']
  requestDelete: SkillHubState['requestDelete']
}

export function CollectionCard(props: CollectionCardProps): JSX.Element {
  const {
    collection, skills, collapsed, check,
    checkingSource, syncingSource, rowProps,
    toggleGroupCollapse, checkSources, requestSync, requestDelete,
  } = props
  const { uses, hubConfig } = rowProps
  return (
    <section className={css.section}>
      <div className={css.groupHead}>
        <button type='button' className={css.disclosure} aria-expanded={!collapsed} onClick={() => { toggleGroupCollapse('col:' + collection.name) }}>
          <span className={css.chevron + (collapsed ? ' ' + css.chevronCollapsed : '')} />
          <span className={css.groupTitle}>
            <a className={css.sourceLink} href={'https://github.com/' + collection.name} target='_blank' rel='noreferrer' onClick={(event) => { event.stopPropagation() }}>{collection.name}</a>
            {' · ' + collection.skillNames.length}
            <GroupSummary members={collection.skillNames} uses={uses} hubConfig={hubConfig} />
          </span>
        </button>
        <span className={css.groupOps}>
          <SourceStatusBadge
            check={check}
            checking={checkingSource === collection.name}
            onCheck={() => { void checkSources(collection.name) }}
          />
          {check !== undefined && check.changed && check.updated.length > 0
            ? <button type='button' className={css.opBtn} disabled={syncingSource !== null} onClick={(event) => { event.stopPropagation(); requestSync(collection.name, check.updated) }}>
                {syncingSource === collection.name ? tt('source.syncing') : tt('source.sync')}
              </button>
            : null}
          {check !== undefined && check.deleted.length > 0
            ? <button type='button' className={css.opBtn + ' ' + css.opDanger} onClick={(event) => { event.stopPropagation(); requestDelete(collection.name, check.deleted) }}>{tt('source.followDelete')}</button>
            : null}
        </span>
      </div>
      {!collapsed ? (
        <div className={css.list}>
          {skills.map((skill) => <SkillRow key={skillRowKey(skill)} skill={skill} {...rowProps} />)}
        </div>
      ) : null}
    </section>
  )
}

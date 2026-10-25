/**
 * ProjectTree — 项目级顶层分组：小标题（照官方 插件 页的「内置插件配置」）+ 按
 * workspace 聚合的二级节点（可折叠），并支持按 .dsh/.agents 细分两层。
 * 分组顺序 = dsh 侧面栏的工作区顺序；不再支持拖动/上移下移重排。
 */

import type { JSX } from 'react'
import type { CatalogSkill } from '../../protocol.ts'
import { skillRowKey, workspaceRank } from '../grouping.ts'
import { tt } from '../helpers.ts'
import { SkillRow, type SkillRowProps } from './SkillRow.tsx'
import { GroupSummary } from './GroupSummary.tsx'
import { SubGroup } from './SubGroup.tsx'
import css from './panel.module.css'

export interface ProjectTreeProps {
  /** 技能来源筛选后的项目技能。 */
  skills: CatalogSkill[]
  /** 折叠的树键（'project:<workspace>' / 'project:<workspace>:<source>'）。 */
  collapsedGroups: ReadonlySet<string>
  toggleGroupCollapse: (key: string) => void
  /** 已细分（按 .dsh/.agents）的项目键。 */
  subdividedProjects: ReadonlySet<string>
  toggleSubdivide: (key: string) => void
  /** SkillRow 收窄后的 props（skill 由行内传入）；uses / hubConfig 也取自它。 */
  rowProps: Omit<SkillRowProps, 'skill'>
  /** 已知工作区路径，按 dsh 侧面栏顺序（catalog.workspaces）；空数组即保持原序。 */
  workspaceOrder?: readonly string[]
}

export function ProjectTree(props: ProjectTreeProps): JSX.Element {
  const { skills, collapsedGroups, toggleGroupCollapse, subdividedProjects, toggleSubdivide, rowProps, workspaceOrder = [] } = props
  // 按 workspace 聚合，与拆分前逻辑一致
  const byProject = new Map<string, { title: string; skills: CatalogSkill[] }>()
  for (const skill of skills) {
    const key = skill.workspace ?? skill.source
    const entry = byProject.get(key)
    if (entry === undefined) byProject.set(key, { title: skill.workspaceTitle ?? skill.workspace ?? tt('groups.project'), skills: [skill] })
    else entry.skills.push(skill)
  }
  // 项目分组顺序 = 侧面栏的工作区顺序；未知工作区按出现顺序排在后面。
  const projects = [...byProject.entries()]
    .sort((a, b) => workspaceRank(a[0], workspaceOrder) - workspaceRank(b[0], workspaceOrder))
  return (
    <section className={css.section}>
      <div className={css.sectionHead}>
        <h2 className={css.sectionTitle}>{tt('groups.project')} · {byProject.size}</h2>
      </div>
      {projects.map(([key, proj]) => {
        const projKey = 'project:' + key
        const projCollapsed = collapsedGroups.has(projKey)
        const subdivided = subdividedProjects.has(key)
        return (
          <div key={projKey} className={css.projectNest}>
            <div className={css.groupHead}>
              <button type='button' className={css.disclosure} aria-expanded={!projCollapsed} onClick={() => { toggleGroupCollapse(projKey) }}>
                <span className={css.chevron + (projCollapsed ? ' ' + css.chevronCollapsed : '')} />
                <span className={css.groupTitle}>{proj.title} · {proj.skills.length}<GroupSummary members={proj.skills.map((s) => s.name)} uses={rowProps.uses} hubConfig={rowProps.hubConfig} /></span>
              </button>
              <span className={css.groupOps}>
                <button type='button' className={css.opBtn} onClick={(event) => { event.stopPropagation(); toggleSubdivide(key) }}>{subdivided ? tt('groups.merge') : tt('groups.subdivide')}</button>
              </span>
            </div>
            {!projCollapsed ? (
              subdivided ? (
                <div className={css.projectNest}>
                  {(['project-dsh', 'project-agents'] as const).map((source) => {
                    const list = proj.skills.filter((skill) => skill.source === source)
                    if (list.length === 0) return null
                    const srcKey = projKey + ':' + source
                    const srcCollapsed = collapsedGroups.has(srcKey)
                    return (
                      <SubGroup
                        key={srcKey}
                        title={tt(('badge.source.' + source) as 'badge.source.project-dsh' | 'badge.source.project-agents')}
                        count={list.length}
                        collapsed={srcCollapsed}
                        onToggle={() => { toggleGroupCollapse(srcKey) }}
                      >
                        {list.map((skill) => <SkillRow key={skillRowKey(skill)} skill={skill} {...rowProps} />)}
                      </SubGroup>
                    )
                  })}
                </div>
              ) : (
                <div className={css.list}>
                  {proj.skills.map((skill) => <SkillRow key={skillRowKey(skill)} skill={skill} {...rowProps} />)}
                </div>
              )
            ) : null}
          </div>
        )
      })}
    </section>
  )
}

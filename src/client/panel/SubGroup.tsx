/**
 * 二级分组：缩进 + 发丝引导线 + 披露箭头 + 「标题 · 数量」。
 *
 * 项目级技能（.dsh / .agents 细分）与个人技能（按提供者细分）共用这一套
 * 显示，二级不再套卡片面，只有缩进与一条竖线。
 */

import type { JSX, ReactNode } from 'react'
import css from './panel.module.css'

export interface SubGroupProps {
  /** 分组标题（已本地化的来源标签，或提供者 id）。 */
  title: string
  /** 标题悬停提示（如「提供者」）。 */
  titleHint?: string
  /** 成员数（已启用 + 已禁用）。 */
  count: number
  collapsed: boolean
  onToggle: () => void
  children: ReactNode
}

export function SubGroup(props: SubGroupProps): JSX.Element {
  const { title, titleHint, count, collapsed, onToggle, children } = props
  return (
    <div className={css.projectNest}>
      <div className={css.groupHead}>
        <button type='button' className={css.disclosure} aria-expanded={!collapsed} onClick={onToggle}>
          <span className={css.chevron + (collapsed ? ' ' + css.chevronCollapsed : '')} />
          <span className={css.groupTitle} title={titleHint}>{title} · {count}</span>
        </button>
      </div>
      {!collapsed ? children : null}
    </div>
  )
}

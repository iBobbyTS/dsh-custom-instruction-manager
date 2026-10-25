/**
 * One enabled skill row: name + invocation dots + usage meta, the trailing
 * enable switch, and the row menu (在 Finder 中显示 / 删除). Shared by the
 * flat list and both grouped views.
 */

import type { JSX, KeyboardEvent } from 'react'
import type { CatalogSkill, HubConfig } from '../../protocol.ts'
import { IconFolderCloseOutline16, IconTrashOutline16 } from '../icons.tsx'
import { isFileSource } from '../grouping.ts'
import { isDisplayNameDistinct, tt } from '../helpers.ts'
import { relativeTimeText } from './format.ts'
import { InvocationDots } from './InvocationDots.tsx'
import { RowMenu, type RowMenuItem } from './RowMenu.tsx'
import css from './panel.module.css'

/** The narrowed hub surface one skill row consumes. */
export interface SkillRowProps {
  skill: CatalogSkill
  /** skillName → usage stats. */
  uses: ReadonlyMap<string, { count: number; lastUsed?: number }>
  /** Effective hub config; null while it has not loaded. */
  hubConfig: HubConfig | null
  /** Names with an in-flight toggle/delete. */
  busyNames: ReadonlySet<string>
  /** True while a list operation runs (also blocks row deletes). */
  listBusy: boolean
  /** Names that collide with another skill (duplicate badge). */
  duplicateNames: ReadonlySet<string>
  toggle: (skill: CatalogSkill, enabled: boolean) => Promise<void>
  openDetail: (name: string) => Promise<void>
  /** 打开删除确认（移入系统废纸篓）。 */
  requestDeleteSkill: (name: string) => void
  /** 在 Finder 中显示该技能文件（cwd 用于定位项目技能）。 */
  reveal: (name: string, cwd?: string) => void
}

export function SkillRow(props: SkillRowProps): JSX.Element {
  const { skill, uses, hubConfig, busyNames, listBusy, duplicateNames, toggle, openDetail, requestDeleteSkill, reveal } = props
  const stat = uses.get(skill.name)
  const count = stat?.count ?? 0
  const lastUsed = stat?.lastUsed
  const isDuplicate = duplicateNames.has(skill.name)
  /** 键盘打开详情：Enter 或空格。仅当焦点在行本身（而非行内按钮）时生效。 */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openDetail(skill.name)
    }
  }
  /** 行菜单项：Finder 展示对所有落盘技能开放；删除只给可写（非只读）技能。 */
  const menuItems: RowMenuItem[] = [
    {
      id: 'reveal',
      label: tt('row.reveal'),
      icon: <IconFolderCloseOutline16 size={14} />,
      ...(isFileSource(skill.source) ? {} : { disabled: true, disabledHint: tt('row.revealUnavailable') }),
    },
    ...(skill.writable
      ? [{
          id: 'delete',
          label: tt('row.delete'),
          icon: <IconTrashOutline16 size={14} />,
          danger: true,
          disabled: busyNames.has(skill.name) || listBusy,
        }]
      : []),
  ]
  return (
    <div
      className={css.row}
      role='button'
      tabIndex={0}
      aria-label={tt('row.open', { name: skill.name })}
      onClick={() => { void openDetail(skill.name) }}
      onKeyDown={onKeyDown}
    >
      <div className={css.rowMain}>
        <div className={css.rowName}>
          <span className={css.rowNameText}>{skill.name}</span>
          {isDisplayNameDistinct(skill.name, skill.displayName) ? <span className={css.displayName} title={skill.displayName}>{skill.displayName}</span> : null}
          {count > 0 && hubConfig?.showUseCount !== false ? <span className={css.useCount}>{count}</span> : null}
          <InvocationDots invocation={skill.invocation} hubConfig={hubConfig} />
          {isDuplicate ? <span className={css.badge + ' ' + css.statusError} title={tt('row.duplicateHint')}>{tt('row.duplicate')}</span> : null}
          {lastUsed !== undefined && hubConfig?.showUseTime !== false ? <span className={css.useTime}>{relativeTimeText(lastUsed)}</span> : null}
        </div>
        <div className={css.rowDesc} title={skill.description}>{skill.shortDescription ?? skill.description}</div>
      </div>
      {skill.writable
        ? <button
            type='button'
            role='switch'
            aria-checked={true}
            aria-label={tt('row.disable')}
            className={css.switch + ' ' + css.switchOn}
            disabled={busyNames.has(skill.name)}
            onClick={(event) => { event.stopPropagation(); void toggle(skill, false) }}
          ><span className={css.switchThumb} /></button>
        : <span className={css.badge + ' ' + css.badgeReadonly}>{tt('row.readonly')}</span>}
      <RowMenu
        label={tt('row.menu', { name: skill.name })}
        items={menuItems}
        onSelect={(id) => {
          if (id === 'reveal') { reveal(skill.name, skill.workspace); return }
          if (id === 'delete') requestDeleteSkill(skill.name)
        }}
      />
    </div>
  )
}

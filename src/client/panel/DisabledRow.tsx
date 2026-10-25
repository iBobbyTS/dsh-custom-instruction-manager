/**
 * One disabled skill row (name + description + root badge + enable switch +
 * the row menu). Shared by the source-group lists and the personal buckets.
 */

import type { JSX, KeyboardEvent } from 'react'
import type { DisabledSkill, WritableRoot } from '../../protocol.ts'
import { IconFolderCloseOutline16, IconTrashOutline16 } from '../icons.tsx'
import { tt } from '../helpers.ts'
import type { HubKey } from '../locales.ts'
import { RowMenu } from './RowMenu.tsx'
import css from './panel.module.css'

/** Source badge label for a disabled record, derived from its writable root. */
function disabledSourceLabel(root: WritableRoot): string {
  return tt(('badge.source.' + root) as HubKey)
}

/** 禁用行同样带「…」菜单：Finder 展示 + 删除（禁用文件整条移入废纸篓）。 */
export function DisabledRow(props: {
  record: DisabledSkill
  busy: boolean
  onEnable: () => void
  duplicate?: boolean
  onOpen?: () => void
  /** 在 Finder 中显示这条禁用记录的文件。 */
  reveal?: () => void
  /** 打开删除确认（移入系统废纸篓）。 */
  requestDelete?: () => void
}): JSX.Element {
  const { record, busy, onEnable, duplicate, onOpen, reveal, requestDelete } = props
  /** 键盘打开详情：Enter 或空格。仅当焦点在行本身（而非行内开关）时生效。 */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (onOpen === undefined || event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }
  return (
    <div
      className={css.row + (onOpen === undefined ? ' ' + css.rowStatic : '')}
      role={onOpen === undefined ? undefined : 'button'}
      tabIndex={onOpen === undefined ? undefined : 0}
      aria-label={onOpen === undefined ? undefined : tt('row.open', { name: record.name })}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      <div className={css.rowMain}>
        <div className={css.rowName}>{record.name}{duplicate === true ? <span className={css.badge + ' ' + css.statusError} style={{ marginLeft: 6 }} title={tt('row.duplicateHint')}>{tt('row.duplicate')}</span> : null}</div>
        <div className={css.rowDesc} title={record.description}>{record.description}</div>
      </div>
      <span className={css.badges}>
        <span className={css.badge + ' ' + css.badgeSource}>{disabledSourceLabel(record.root)}</span>
      </span>
      <button type='button' role='switch' aria-checked={false} aria-label={tt('row.enable')} className={css.switch} disabled={busy} onClick={(event) => { event.stopPropagation(); onEnable() }}><span className={css.switchThumb} /></button>
      {reveal !== undefined || requestDelete !== undefined
        ? <RowMenu
            label={tt('row.menu', { name: record.name })}
            items={[
              ...(reveal !== undefined ? [{ id: 'reveal', label: tt('row.reveal'), icon: <IconFolderCloseOutline16 size={14} /> }] : []),
              ...(requestDelete !== undefined ? [{ id: 'delete', label: tt('row.delete'), icon: <IconTrashOutline16 size={14} />, danger: true, disabled: busy }] : []),
            ]}
            onSelect={(id) => {
              if (id === 'reveal') reveal?.()
              if (id === 'delete') requestDelete?.()
            }}
          />
        : null}
    </div>
  )
}

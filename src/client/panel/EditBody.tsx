/**
 * 详情页的正文区：只读态是等宽 `<pre>`，编辑态换成等宽文本域 + 保存/取消。
 *
 * 两个详情页（技能正文、指令文件整份原文）共用这一个组件；编辑状态由面板
 * 持有并以 props 传入，所以每一种状态都能用 renderToStaticMarkup 直接断言。
 * ⌘S / Ctrl+S 在文本域里等同「保存」。
 */

import type { JSX } from 'react'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

/** 编辑态的展示与动作（两个详情页共用的 prop 形状）。 */
export interface EditModeProps {
  /** 是否处于编辑态。 */
  active: boolean
  draft: string
  /** 保存中（按钮禁用，避免连点写两次）。 */
  busy: boolean
  /** 上一次保存失败的原因（停在编辑态显示）。 */
  error?: string
  onDraft: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export interface EditBodyProps {
  /** 只读态显示的正文。 */
  content: string
  edit: EditModeProps
  /** 文本域的无障碍名称（缺省用「编辑」）。 */
  label?: string
}

export function EditBody(props: EditBodyProps): JSX.Element {
  const { content, edit, label } = props
  if (!edit.active) return <pre className={css.detailContent}>{content}</pre>
  return (
    <div className={css.editBlock}>
      <textarea
        className={css.editArea}
        value={edit.draft}
        aria-label={label ?? tt('detail.edit')}
        spellCheck={false}
        autoFocus
        onChange={(event) => { edit.onDraft(event.target.value) }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            if (!edit.busy) edit.onSave()
          }
        }}
      />
      {edit.error !== undefined ? <div className={css.editError} role='alert'>{edit.error}</div> : null}
      <div className={css.editBar}>
        <button type='button' className={css.button + ' ' + css.primary} disabled={edit.busy} onClick={edit.onSave}>
          {edit.busy ? tt('detail.editSaving') : tt('detail.editSave')}
        </button>
        <button type='button' className={css.button} disabled={edit.busy} onClick={edit.onCancel}>
          {tt('detail.editCancel')}
        </button>
        <span className={css.editHint}>{tt('detail.editShortcut')}</span>
      </div>
    </div>
  )
}

/**
 * 详情页的正文区：没有单独的编辑态——可写文件的正文就是同一个框，直接改；
 * 下面固定一行「保存 / 放弃所有编辑」。
 *
 * 盒子与只读时完全一样（等宽、`.5px` 发丝边、圆角、内边距、最大 62vh 后内部
 * 滚动），高度跟随内容，不设任何编辑专用的高度或拖拽手柄。状态由面板持有，
 * 这里只收 props，所以每一种状态都能用 renderToStaticMarkup 直接断言。
 * ⌘S / Ctrl+S 在框里等同「保存」。
 */

import { useEffect, useLayoutEffect, useRef, type JSX } from 'react'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

/** 正文区的展示与动作（两个详情页共用的 prop 形状）。 */
export interface EditModeProps {
  /** 可写文件才给可编辑的框；内置/插件技能没有文件，保持只读 <pre>。 */
  editable: boolean
  draft: string
  /** 保存中（按钮禁用，避免连点写两次）。 */
  busy: boolean
  /** 草稿与磁盘内容不同（没有改动时保存/放弃都是禁用的）。 */
  dirty: boolean
  /** 上一次保存失败的原因。 */
  error?: string
  onDraft: (value: string) => void
  onSave: () => void
  /** 放弃所有编辑 = 恢复成载入时的磁盘内容；二次确认由面板/hook 负责。 */
  onDiscard: () => void
}

export interface EditBodyProps {
  /** 只读态显示的正文（可写时用 draft，这里只在不可写时用到）。 */
  content: string
  edit: EditModeProps
  /** 文本域的无障碍名称。 */
  label: string
}

/** 服务端渲染时 useLayoutEffect 会告警，退回 useEffect。 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function EditBody(props: EditBodyProps): JSX.Element {
  const { content, edit, label } = props
  const area = useRef<HTMLTextAreaElement | null>(null)

  // 高度跟随内容：先归零再量 scrollHeight，CSS 的 max-height 负责封顶。
  useIsomorphicLayoutEffect(() => {
    const node = area.current
    if (node === null) return
    node.style.height = 'auto'
    node.style.height = node.scrollHeight + 'px'
  }, [edit.draft, edit.editable])

  if (!edit.editable) return <pre className={css.detailContent}>{content}</pre>
  return (
    <div className={css.editBlock}>
      <textarea
        ref={area}
        className={css.editArea}
        value={edit.draft}
        aria-label={label}
        spellCheck={false}
        onChange={(event) => { edit.onDraft(event.target.value) }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            if (!edit.busy && edit.dirty) edit.onSave()
          }
        }}
      />
      {edit.error !== undefined ? <div className={css.editError} role='alert'>{edit.error}</div> : null}
      <div className={css.editBar}>
        <button type='button' className={css.button + ' ' + css.primary} disabled={edit.busy || !edit.dirty} onClick={edit.onSave}>
          {edit.busy ? tt('detail.editSaving') : tt('detail.editSave')}
        </button>
        <button type='button' className={css.button} disabled={edit.busy || !edit.dirty} onClick={edit.onDiscard}>
          {tt('detail.editDiscardAll')}
        </button>
        <span className={css.editHint}>{tt('detail.editShortcut')}</span>
      </div>
    </div>
  )
}

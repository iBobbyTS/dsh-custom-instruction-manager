/**
 * 指令文件详情页：和技能详情同构——返回列表、大标题是文件名、下面是元数据
 * （所属分组 / 绝对路径 / 大小 / 修改时间），最后是文件的原始正文。
 *
 * 正文默认只读（原样 `<pre>`，不渲染 Markdown，等宽字体保留缩进与列表）；
 * head 的「编辑」把正文区换成文本域（整份原文可改），保存直接写回磁盘。
 * 编辑状态由面板持有，这里只收 props。
 */

import { useEffect, useRef, useState } from 'react'
import type { InstructionFileDetail, InstructionFileRef } from '../../protocol.ts'
import { copyTextToClipboard, tt } from '../helpers.ts'
import { EditBody, type EditModeProps } from './EditBody.tsx'
import { formatBytes, formatDateTime } from './format.ts'
import css from './panel.module.css'
import { TokenTable, type TokenTableProps } from './TokenTable.tsx'

export interface AgentFileDetailViewProps {
  /** 列表行（打开时立刻可用，正文尚未到达时用它渲染标题与路径）。 */
  file: InstructionFileRef
  /** 所属分组标题（用户级或工作区标题）。 */
  scope: string
  detail?: InstructionFileDetail
  loading: boolean
  error?: string
  /** Token 统计表（计数状态 + 可选模型，正文到达后异步算）。 */
  tokenTable: TokenTableProps
  /** 正文区：可写文件直接可改，不可写时 EditBody 退回只读 <pre>。 */
  edit: EditModeProps
  /** 保存成功后的一行提示。 */
  notice?: string
  onBack: () => void
}

export function AgentFileDetailView(props: AgentFileDetailViewProps): React.JSX.Element {
  const { file, scope, detail, loading, error, tokenTable, edit, notice, onBack } = props
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearTimeout(timer.current) }, [])

  const copyPath = (): void => {
    void copyTextToClipboard(file.absolute).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => { setCopied(false) }, 1200)
    })
  }

  return (
    <div className={css.panel}>
      <div className={css.detailHead}>
        <button type='button' className={css.back} onClick={onBack}>{tt('detail.back')}</button>
        <span className={css.detailName}>{file.name}</span>
        <span className={css.actions} style={{ marginLeft: 'auto', gap: 6 }}>
          <button type='button' className={css.opBtn} onClick={copyPath}>{copied ? tt('detail.copied') : tt('detail.copyPath')}</button>
        </span>
      </div>
      <div className={css.detailSub}>{file.path}</div>
      {notice !== undefined ? <div className={css.editNotice} role='status'>{notice}</div> : null}
      <div className={css.detailMeta}>
        <div className={css.detailMetaLine}>{tt('agents.scope')}: {scope}</div>
        <div className={css.detailMetaLine}>{tt('detail.path')}: {file.absolute}</div>
        {detail !== undefined ? <div className={css.detailMetaLine}>{tt('agents.size')}: {formatBytes(detail.size)}</div> : null}
        {detail !== undefined ? <div className={css.detailMetaLine}>{tt('agents.modifiedAt')}: {formatDateTime(detail.modifiedAt)}</div> : null}
      </div>
      {error !== undefined
        ? <div className={css.errorBanner}>{tt('agents.readError', { error })}</div>
        : detail !== undefined
          ? <EditBody content={detail.content} edit={edit} label={tt('detail.editAgentFile')} />
          : loading
            ? <p className={css.empty}>{tt('agents.reading')}</p>
            : null}
      <TokenTable {...tokenTable} />
    </div>
  )
}

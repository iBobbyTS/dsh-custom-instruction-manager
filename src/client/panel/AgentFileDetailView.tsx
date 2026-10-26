/**
 * 指令文件详情页：和技能详情同构——返回列表、大标题是文件名、下面是元数据
 * （所属分组 / 绝对路径 / 大小 / 修改时间），最后是文件的原始正文。
 *
 * 只读：没有编辑、没有保存。正文按原文用 `<pre>` 呈现（技能详情也是原样
 * 呈现 SKILL.md，不渲染 Markdown），等宽字体保留 AGENTS.md 里的缩进与列表。
 */

import { useEffect, useRef, useState } from 'react'
import type { InstructionFileDetail, InstructionFileRef } from '../../protocol.ts'
import { copyTextToClipboard, tt } from '../helpers.ts'
import { formatBytes, formatDateTime } from './format.ts'
import type { TokenCountState } from './hooks/useTokenCount.ts'
import css from './panel.module.css'
import { TokenTable } from './TokenTable.tsx'

export interface AgentFileDetailViewProps {
  /** 列表行（打开时立刻可用，正文尚未到达时用它渲染标题与路径）。 */
  file: InstructionFileRef
  /** 所属分组标题（用户级或工作区标题）。 */
  scope: string
  detail?: InstructionFileDetail
  loading: boolean
  error?: string
  /** Token 统计（正文到达后由 useTokenCount 异步算）。 */
  tokens: TokenCountState
  onBack: () => void
}

export function AgentFileDetailView(props: AgentFileDetailViewProps): React.JSX.Element {
  const { file, scope, detail, loading, error, tokens, onBack } = props
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
      <div className={css.detailMeta}>
        <div className={css.detailMetaLine}>{tt('agents.scope')}: {scope}</div>
        <div className={css.detailMetaLine}>{tt('detail.path')}: {file.absolute}</div>
        {detail !== undefined ? <div className={css.detailMetaLine}>{tt('agents.size')}: {formatBytes(detail.size)}</div> : null}
        {detail !== undefined ? <div className={css.detailMetaLine}>{tt('agents.modifiedAt')}: {formatDateTime(detail.modifiedAt)}</div> : null}
      </div>
      {error !== undefined
        ? <div className={css.errorBanner}>{tt('agents.readError', { error })}</div>
        : detail !== undefined
          ? <pre className={css.detailContent}>{detail.content}</pre>
          : loading
            ? <p className={css.empty}>{tt('agents.reading')}</p>
            : null}
      <TokenTable state={tokens} />
    </div>
  )
}

/**
 * AGENTS.md 页：只读的指令文件清单。
 *
 * 分组标题是「用户级」+ 每个工作区（没有单独的「项目级」层），组内一行一个
 * 文件：大标题是真实文件名，副标题是从项目文件夹父目录算起的路径
 * （`lmdo-website`、`lmdo-website/docs`）。没有候选文件的分组保留标题，
 * 下面一行灰字「无 AGENTS.md」。
 *
 * 排除目录的编辑入口放在这一页（不放「关于」）：它是本页扫描的剪枝清单，
 * 默认 `.agent-work`，保存走 /config 并立即重扫。
 */

import { useState } from 'react'
import type { AgentsResponse, InstructionFileRef } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import type { AgentsScanProgress } from './hooks/useAgentsFlow.ts'
import css from './panel.module.css'

export interface AgentsViewProps {
  data: AgentsResponse | null
  /** 扫描进度；null = 没有扫描在跑。有进度时「重新扫描」变成不可点的「扫描中（x%）」。 */
  scan: AgentsScanProgress | null
  error: string | null
  /** 排除目录保存中：禁用输入与按钮，避免连点写两次。 */
  saving: boolean
  onRefresh: () => void
  /** @param dirs - 完整清单；null = 清除覆盖、回落到默认清单。 */
  onSaveExcludeDirs: (dirs: string[] | null) => void
  /** 点开一行：进入该文件的正文页（scope = 所属分组标题）。 */
  onOpenFile: (file: InstructionFileRef, scope: string) => void
}

/** 目录名合法性：非空、不含路径分隔符（与 host 侧 /config 的校验一致）。 */
function normalizeDirName(text: string): string | undefined {
  const name = text.trim()
  if (name === '' || name.includes('/') || name.includes('\\')) return undefined
  return name
}

/** 扫描百分比：第 0 步之前 total 还是 0，按 0% 显示。 */
function scanPercent(scan: AgentsScanProgress | null): number {
  if (scan === null || scan.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((scan.done / scan.total) * 100)))
}

export function AgentsView(props: AgentsViewProps): React.JSX.Element {
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const dirs = props.data?.excludeDirs ?? []
  const scanning = props.scan !== null

  const addDraft = (): void => {
    const name = normalizeDirName(draft)
    if (name === undefined) return
    setDraft('')
    if (dirs.includes(name)) return
    props.onSaveExcludeDirs([...dirs, name])
  }

  return (
    <>
      <div className={css.agentsBar}>
        <button
          type='button'
          className={css.opBtn + (editorOpen ? ' ' + css.opBtnActive : '')}
          aria-expanded={editorOpen}
          onClick={() => { setEditorOpen((open) => !open) }}
        >{tt('agents.exclude')} ({dirs.length})</button>
        <button type='button' className={css.opBtn} disabled={scanning} onClick={props.onRefresh}>
          {scanning ? tt('agents.scanningPercent', { percent: scanPercent(props.scan) }) : tt('agents.rescan')}
        </button>
      </div>

      {editorOpen
        ? (
          <div className={css.agentsPanel}>
            <p className={css.agentsHint}>{tt('agents.excludeHint')}</p>
            <div className={css.agentsChips}>
              {dirs.length === 0
                ? <span className={css.agentsChipEmpty}>{tt('agents.excludeEmpty')}</span>
                : dirs.map((dir) => (
                  <span key={dir} className={css.agentsChip}>
                    {dir}
                    <button
                      type='button'
                      className={css.agentsChipRemove}
                      title={tt('agents.remove')}
                      aria-label={tt('agents.remove') + ' ' + dir}
                      disabled={props.saving}
                      onClick={() => { props.onSaveExcludeDirs(dirs.filter((entry) => entry !== dir)) }}
                    >×</button>
                  </span>
                ))}
            </div>
            <div className={css.agentsAddRow}>
              <input
                className={css.search + ' ' + css.agentsInput}
                value={draft}
                placeholder={tt('agents.placeholder')}
                aria-label={tt('agents.placeholder')}
                disabled={props.saving}
                onChange={(event) => { setDraft(event.target.value) }}
                onKeyDown={(event) => { if (event.key === 'Enter') addDraft() }}
              />
              <button
                type='button'
                className={css.button}
                disabled={props.saving || normalizeDirName(draft) === undefined || dirs.includes(normalizeDirName(draft) ?? '')}
                onClick={addDraft}
              >{tt('agents.add')}</button>
              <button
                type='button'
                className={css.opBtn}
                disabled={props.saving}
                onClick={() => { props.onSaveExcludeDirs(null) }}
              >{tt('agents.reset')}</button>
            </div>
          </div>
        )
        : null}

      {props.error !== null ? <div className={css.errorBanner}>{tt('agents.error', { error: props.error })}</div> : null}
      {props.data === null && scanning ? <p className={css.empty}>{tt('agents.loading')}</p> : null}

      {(props.data?.groups ?? []).map((group, index) => (
        <section key={group.kind + '\0' + index} className={css.section + ' ' + css.agentsGroup}>
          <h2 className={css.sectionTitle}>{group.kind === 'user' ? tt('agents.user') : (group.title ?? '')}</h2>
          {group.files.length === 0
            ? <p className={css.agentsEmpty}>{tt('agents.none')}</p>
            : (
              <div className={css.list}>
                {group.files.map((file, fileIndex) => {
                  const scope = group.kind === 'user' ? tt('agents.user') : (group.title ?? '')
                  // 旧版 host 的清单行没有 absolute：那种行不当作按钮，避免点开一个空路径。
                  const canOpen = file.absolute !== '' && file.absolute !== undefined
                  const open = (): void => { if (canOpen) props.onOpenFile(file, scope) }
                  return (
                    <div
                      key={(file.absolute ?? file.path) + '\0' + fileIndex}
                      className={css.row + (canOpen ? '' : ' ' + css.rowStatic)}
                      role={canOpen ? 'button' : undefined}
                      tabIndex={canOpen ? 0 : undefined}
                      title={file.absolute ?? file.path}
                      onClick={open}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        open()
                      }}
                    >
                      <div className={css.rowMain}>
                        <div className={css.rowName}>
                          <span className={css.rowNameText}>{file.name}</span>
                        </div>
                        <div className={css.agentPath}>{file.path}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </section>
      ))}
    </>
  )
}

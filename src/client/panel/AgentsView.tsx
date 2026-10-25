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
import type { AgentsResponse } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import css from './panel.module.css'

export interface AgentsViewProps {
  data: AgentsResponse | null
  loading: boolean
  error: string | null
  /** 排除目录保存中：禁用输入与按钮，避免连点写两次。 */
  saving: boolean
  onRefresh: () => void
  /** @param dirs - 完整清单；null = 清除覆盖、回落到默认清单。 */
  onSaveExcludeDirs: (dirs: string[] | null) => void
}

/** 目录名合法性：非空、不含路径分隔符（与 host 侧 /config 的校验一致）。 */
function normalizeDirName(text: string): string | undefined {
  const name = text.trim()
  if (name === '' || name.includes('/') || name.includes('\\')) return undefined
  return name
}

export function AgentsView(props: AgentsViewProps): React.JSX.Element {
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const dirs = props.data?.excludeDirs ?? []

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
        <button type='button' className={css.opBtn} disabled={props.loading} onClick={props.onRefresh}>
          {props.loading ? tt('agents.scanning') : tt('agents.rescan')}
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
      {props.data === null && props.loading ? <p className={css.empty}>{tt('agents.loading')}</p> : null}

      {(props.data?.groups ?? []).map((group, index) => (
        <section key={group.kind + '\0' + index} className={css.section + ' ' + css.agentsGroup}>
          <h2 className={css.sectionTitle}>{group.kind === 'user' ? tt('agents.user') : (group.title ?? '')}</h2>
          {group.files.length === 0
            ? <p className={css.agentsEmpty}>{tt('agents.none')}</p>
            : (
              <div className={css.list}>
                {group.files.map((file, fileIndex) => (
                  <div key={file.path + '\0' + file.name + '\0' + fileIndex} className={css.row + ' ' + css.rowStatic}>
                    <div className={css.rowMain}>
                      <div className={css.rowName}>
                        <span className={css.rowNameText}>{file.name}</span>
                      </div>
                      <div className={css.agentPath}>{file.path}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>
      ))}
    </>
  )
}

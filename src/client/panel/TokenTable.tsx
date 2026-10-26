/**
 * Token 统计表：模型 / Tokens / 状态。
 *
 * 行来自协议层的 TOKEN_MODELS，而不是上一次响应：第一次计数还没回来时，
 * 表格已经是完整的两行「待计数」，不会先空着再突然长出内容，也不会因为
 * 某个模型失败而少一行。数字由宿主用真 tokenizer 现算——不是字符数/字节
 * 数估算，脚注把口径写清楚。
 *
 * 纯展示：状态与数字都由 useTokenCount 给，这里不自己发请求。
 */

import type { JSX } from 'react'
import { TOKEN_MODELS } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import css from './panel.module.css'
import type { TokenCountState } from './hooks/useTokenCount.ts'

export interface TokenTableProps {
  state: TokenCountState
}

/** 一行要显示的三格内容。 */
interface Row {
  /** Tokens 列：数字，或占位破折号。 */
  tokens: string
  /** 状态列。 */
  status: string
  /** 失败行：这一个模型自己的原因（另一个模型可能正常）。 */
  detail?: string
  failed?: boolean
}

export function TokenTable({ state }: TokenTableProps): JSX.Element {
  const rowOf = (modelId: string): Row => {
    switch (state.status) {
      case 'idle':
        return { tokens: '—', status: tt('tokens.pending') }
      case 'loading':
        return { tokens: '—', status: tt('tokens.counting') }
      case 'failed':
        // 整个请求失败：原因写在脚注里，不必在两行里重复两遍。
        return { tokens: '—', status: tt('tokens.failed'), failed: true }
      case 'ready': {
        const entry = state.entries.find((item) => item.id === modelId)
        if (entry?.error !== undefined) return { tokens: '—', status: tt('tokens.failed'), detail: entry.error, failed: true }
        if (entry?.tokens === undefined) return { tokens: '—', status: tt('tokens.failed'), failed: true }
        return { tokens: entry.tokens.toLocaleString(), status: tt('tokens.done') }
      }
    }
  }

  /** 脚注：口径常驻，状态相关的补充说明按档拼在后面。 */
  const notes = [tt('tokens.footnote')]
  if (state.status === 'idle') notes.push(tt('tokens.empty'))
  if (state.status === 'loading') notes.push(tt('tokens.downloading'))
  if (state.status === 'failed') notes.push(state.error)

  return (
    <section className={css.tokenBlock} aria-label={tt('tokens.title')} aria-busy={state.status === 'loading'}>
      <div className={css.tokenHead}>
        <span className={css.tokenTitle}>{tt('tokens.title')}</span>
        <span className={css.tokenHint}>{tt('tokens.subtitle')}</span>
      </div>
      <table className={css.tokenTable}>
        <thead>
          <tr>
            <th scope='col'>{tt('tokens.model')}</th>
            <th scope='col' className={css.tokenNum}>{tt('tokens.tokens')}</th>
            <th scope='col' className={css.tokenStatusHead}>{tt('tokens.status')}</th>
          </tr>
        </thead>
        <tbody>
          {TOKEN_MODELS.map((model) => {
            const row = rowOf(model.id)
            return (
              <tr key={model.id}>
                <td>{model.label}</td>
                <td className={css.tokenNum}>{row.tokens}</td>
                <td
                  className={css.tokenStatusHead + (row.failed === true ? ' ' + css.tokenFailed : '')}
                  title={row.detail}
                >
                  {row.status}
                  {row.detail !== undefined ? <span className={css.tokenDetail}> · {row.detail}</span> : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className={css.tokenFoot}>{notes.join(' · ')}</div>
    </section>
  )
}

/**
 * Token 统计表：模型 / Tokens。
 *
 * 行来自协议层的 TOKEN_MODELS，而不是上一次响应：计数还没回来时表格已经
 * 是完整的两行（Tokens 列显示 `-`），不会先空着再突然长出内容，也不会因为
 * 某个模型失败而少一行。数字由宿主用真 tokenizer 现算——不是字符数/字节
 * 数估算。
 *
 * 没有状态列：没数出来就是 `-`；失败的那一行用红色，原因由 title 带出。
 * 计数中与失败在视觉上是两回事，但都不占一列版面。
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

/** 一行的 Tokens 格：数字，或没数出来时的 `-`。 */
interface Cell {
  text: string
  /** 失败原因（悬停可见）；另一个模型可能正常。 */
  error?: string
}

export function TokenTable({ state }: TokenTableProps): JSX.Element {
  const cellOf = (modelId: string): Cell => {
    if (state.status !== 'ready') {
      // idle / loading / 整个请求失败：这个模型的数字都还没有。
      return { text: '-', error: state.status === 'failed' ? state.error : undefined }
    }
    const entry = state.entries.find((item) => item.id === modelId)
    if (entry?.tokens === undefined) return { text: '-', error: entry?.error }
    return { text: entry.tokens.toLocaleString() }
  }

  return (
    <section className={css.tokenBlock} aria-label={tt('tokens.title')} aria-busy={state.status === 'loading'}>
      <div className={css.tokenHead}>
        <span className={css.tokenTitle}>{tt('tokens.title')}</span>
      </div>
      <table className={css.tokenTable}>
        <thead>
          <tr>
            <th scope='col'>{tt('tokens.model')}</th>
            <th scope='col' className={css.tokenNum}>{tt('tokens.tokens')}</th>
          </tr>
        </thead>
        <tbody>
          {TOKEN_MODELS.map((model) => {
            const cell = cellOf(model.id)
            return (
              <tr key={model.id}>
                <td>{model.label}</td>
                <td
                  className={css.tokenNum + (cell.error !== undefined ? ' ' + css.tokenFailed : '')}
                  title={cell.error}
                >
                  {cell.text}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

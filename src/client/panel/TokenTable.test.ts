/**
 * Token 统计表：四种状态各自的三列文案，以及"行数由协议常量决定"这条
 * 结构性质——计数还没回来时表格也已经是完整的两行，不会先空后跳。
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TOKEN_MODELS } from '../../protocol.ts'
import type { TokenCountState } from './hooks/useTokenCount.ts'
import { TokenTable } from './TokenTable.tsx'

function render(state: TokenCountState): string {
  return renderToStaticMarkup(createElement(TokenTable, { state }))
}

describe('token table', () => {
  it('renders one row per protocol model before any count has run', () => {
    const html = render({ status: 'idle' })
    for (const model of TOKEN_MODELS) expect(html).toContain(model.label)
    expect(html.match(/待计数/g)).toHaveLength(TOKEN_MODELS.length)
    expect(html).toContain('仅文件原文，不含提示词包装开销')
    expect(html).toContain('未提供文件内容')
  })

  it('shows counting and the download note while the request is in flight', () => {
    const html = render({ status: 'loading' })
    expect(html.match(/计数中/g)).toHaveLength(TOKEN_MODELS.length)
    expect(html).toContain('首次计数需下载词表')
    expect(html).toContain('aria-busy="true"')
  })

  it('shows thousands-separated numbers per model when counts arrive', () => {
    const html = render({
      status: 'ready',
      entries: [
        { id: TOKEN_MODELS[0].id, label: TOKEN_MODELS[0].label, tokens: 1234567 },
        { id: TOKEN_MODELS[1].id, label: TOKEN_MODELS[1].label, tokens: 1180 },
      ],
    })
    expect(html.match(/完成/g)).toHaveLength(TOKEN_MODELS.length)
    expect(html).toContain('1,234,567')
    expect(html).toContain('1,180')
    expect(html).not.toContain('计数中')
  })

  it('marks the failing model only, keeping the other number', () => {
    const html = render({
      status: 'ready',
      entries: [
        { id: TOKEN_MODELS[0].id, label: TOKEN_MODELS[0].label, tokens: 42 },
        { id: TOKEN_MODELS[1].id, label: TOKEN_MODELS[1].label, error: '词表下载失败：HTTP 503' },
      ],
    })
    expect(html).toContain('42')
    expect(html).toContain('失败')
    expect(html).toContain('HTTP 503')
  })

  it('reports a whole-request failure in the footnote, once', () => {
    const html = render({ status: 'failed', error: 'unauthorized: browser session required' })
    expect(html.match(/失败/g)).toHaveLength(TOKEN_MODELS.length)
    expect(html.match(/unauthorized: browser session required/g)).toHaveLength(1)
  })
})

/**
 * Token 统计表：两列（模型 / Tokens），没数出来时 Tokens 列是 `-`；
 * 行数由协议常量决定——计数还没回来时表格也已经是完整的两行。
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

/** 表格里的所有单元格文本（表头 + 数据），用来数 `-` 与数字。 */
function cells(html: string): string[] {
  return [...html.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((match) => match[1])
}

describe('token table', () => {
  it('renders one row per protocol model with a two-column header', () => {
    const html = render({ status: 'idle' })
    for (const model of TOKEN_MODELS) expect(html).toContain(model.label)
    expect(html).toContain('模型')
    expect(html).toContain('Tokens')
    expect(html).not.toContain('状态')
    expect(html).not.toContain('仅文件原文')
    expect(html).not.toContain('当前文件内容')
  })

  it('shows a dash in the tokens column until the count is in', () => {
    for (const state of [{ status: 'idle' } as const, { status: 'loading' } as const]) {
      const html = render(state)
      expect(cells(html).filter((cell) => cell === '-')).toHaveLength(TOKEN_MODELS.length)
    }
    expect(render({ status: 'loading' })).toContain('aria-busy="true"')
  })

  it('shows thousands-separated numbers per model when counts arrive', () => {
    const html = render({
      status: 'ready',
      entries: [
        { id: TOKEN_MODELS[0].id, label: TOKEN_MODELS[0].label, tokens: 1234567 },
        { id: TOKEN_MODELS[1].id, label: TOKEN_MODELS[1].label, tokens: 1180 },
      ],
    })
    expect(html).toContain('1,234,567')
    expect(html).toContain('1,180')
    expect(cells(html).filter((cell) => cell === '-')).toHaveLength(0)
    expect(html).toContain('aria-busy="false"')
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
    expect(html).toContain('title="词表下载失败：HTTP 503"')
    expect(cells(html).filter((cell) => cell === '-')).toHaveLength(1)
  })

  it('dashes both rows with the reason when the whole request failed', () => {
    const html = render({ status: 'failed', error: 'unauthorized: browser session required' })
    expect(cells(html).filter((cell) => cell === '-')).toHaveLength(TOKEN_MODELS.length)
    expect(html.match(/title="unauthorized: browser session required"/g)).toHaveLength(TOKEN_MODELS.length)
  })
})

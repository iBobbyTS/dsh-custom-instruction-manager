/**
 * Token 统计表：两列（模型 / Tokens）+ 末尾「管理模型」行，没数出来时 Tokens
 * 是 `-`；行数与标签来自宿主的选中集合，不是协议全集。
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TOKEN_MODELS, type TokenModelState } from '../../protocol.ts'
import type { TokenCountState } from './hooks/useTokenCount.ts'
import { TokenModelPicker } from './TokenModelPicker.tsx'
import { TokenTable } from './TokenTable.tsx'

function model(id: string, overrides: Partial<TokenModelState> = {}): TokenModelState {
  const spec = TOKEN_MODELS.find((entry) => entry.id === id)
  if (spec === undefined) throw new Error('unknown model in test: ' + id)
  return { id: spec.id, label: spec.label, vocabMb: spec.vocabMb, selected: true, installed: true, ...overrides }
}

function render(state: TokenCountState, models: TokenModelState[] | null = null): string {
  return renderToStaticMarkup(createElement(TokenTable, {
    state,
    models,
    busyModel: null,
    onSelectModel: () => {},
  }))
}

/** 表格里的所有单元格文本（表头 + 数据），用来数 `-`。 */
function cells(html: string): string[] {
  return [...html.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((match) => match[1])
}

describe('token table', () => {
  it('renders the preset rows and a manage row before any count has run', () => {
    const html = render({ status: 'idle' })
    const presets = TOKEN_MODELS.filter((entry) => entry.preset)
    for (const preset of presets) expect(html).toContain(preset.label)
    expect(html).toContain('管理模型')
    // 展开/收起指示：收起时 aria-expanded=false，chevron 在按钮里（展开时转 180°）
    expect(html).toContain('aria-expanded=\"false\"')
    expect(html).toContain('<svg')
    expect(html).toContain('模型')
    expect(html).toContain('Tokens')
    expect(html).not.toContain('Kimi K3')
    expect(html).not.toContain('状态')
  })

  it('shows a dash in the tokens column until the count is in', () => {
    for (const state of [{ status: 'idle' } as const, { status: 'loading' } as const]) {
      const html = render(state)
      expect(cells(html).filter((cell) => cell === '-')).toHaveLength(TOKEN_MODELS.filter((entry) => entry.preset).length)
    }
    expect(render({ status: 'loading' })).toContain('aria-busy="true"')
  })

  it('shows thousands-separated numbers per model when counts arrive', () => {
    const html = render({
      status: 'ready',
      entries: [
        { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', tokens: 1234567 },
        { id: 'glm-5.3', label: 'GLM-5.3', tokens: 1180 },
      ],
    })
    expect(html).toContain('1,234,567')
    expect(html).toContain('1,180')
    expect(cells(html).filter((cell) => cell === '-')).toHaveLength(0)
    expect(html).toContain('aria-busy="false"')
  })

  it('renders exactly the selected models the host reports', () => {
    const models = [model('deepseek-v4.1-flash'), model('glm-5.3', { selected: false }), model('kimi-k3')]
    const html = render({ status: 'ready', entries: [{ id: 'kimi-k3', label: 'Kimi K3', tokens: 42 }] }, models)
    expect(html).toContain('DeepSeek V4.1 Flash')
    expect(html).toContain('Kimi K3')
    expect(html).not.toContain('GLM-5.3')
    expect(html).toContain('42')
  })

  it('says so when no model is selected', () => {
    const models = TOKEN_MODELS.map((entry) => model(entry.id, { selected: false, installed: false }))
    const html = render({ status: 'ready', entries: [] }, models)
    expect(html).toContain('未选择模型')
    expect(html).toContain('管理模型')
  })

  it('marks the failing model only, keeping the other number', () => {
    const html = render({
      status: 'ready',
      entries: [
        { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', tokens: 42 },
        { id: 'glm-5.3', label: 'GLM-5.3', error: '词表下载失败：HTTP 503' },
      ],
    })
    expect(html).toContain('42')
    expect(html).toContain('title="词表下载失败：HTTP 503"')
    expect(cells(html).filter((cell) => cell === '-')).toHaveLength(1)
  })

  it('dashes both rows with the reason when the whole request failed', () => {
    const html = render({ status: 'failed', error: 'unauthorized: browser session required' })
    expect(cells(html).filter((cell) => cell === '-')).toHaveLength(TOKEN_MODELS.filter((entry) => entry.preset).length)
    expect(html.match(/title="unauthorized: browser session required"/g)).toHaveLength(TOKEN_MODELS.filter((entry) => entry.preset).length)
  })
})

describe('model picker', () => {
  function renderPicker(props: Partial<Parameters<typeof TokenModelPicker>[0]> = {}): string {
    return renderToStaticMarkup(createElement(TokenModelPicker, {
      models: [model('deepseek-v4.1-flash'), model('glm-5.3'), model('kimi-k3', { selected: false, installed: false })],
      busyModel: null,
      onSelect: () => {},
      ...props,
    }))
  }

  it('lists every available model with its downloaded state and size', () => {
    const html = renderPicker()
    expect(html).toContain('DeepSeek V4.1 Flash')
    expect(html).toContain('GLM-5.3')
    expect(html).toContain('Kimi K3')
    expect(html.match(/已下载/g)).toHaveLength(2)
    expect(html).toContain('19 MB · 未下载')
  })

  it('reflects the selection on the checkboxes', () => {
    const html = renderPicker()
    const checked = [...html.matchAll(/<input[^>]*checked=""[^>]*>/g)]
    expect(checked).toHaveLength(2)
  })

  it('shows the in-flight action for the busy model and disables the rest', () => {
    const downloading = renderPicker({ busyModel: 'kimi-k3' })
    expect(downloading).toContain('下载中')
    expect(downloading.match(/disabled=""/g)).toHaveLength(3)
    const removing = renderPicker({ busyModel: 'glm-5.3' })
    expect(removing).toContain('删除中')
  })

  it('surfaces a failed selection', () => {
    expect(renderPicker({ error: '词表下载失败：HTTP 503' })).toContain('词表下载失败：HTTP 503')
  })
})

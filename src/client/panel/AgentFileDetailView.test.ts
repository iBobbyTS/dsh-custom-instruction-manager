/**
 * 指令文件详情页：与技能详情同构——返回列表、文件名大标题、项目相对路径、
 * 元数据（所属/路径/大小/修改时间），正文原样呈现。只读，没有保存动作。
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentFileDetailView, type AgentFileDetailViewProps } from './AgentFileDetailView.tsx'

/** 详情页只关心 token 表被传进来了，模型列表的具体形状由 TokenTable 的测试覆盖。 */
function tokenTable(extra: Partial<AgentFileDetailViewProps['tokenTable']> = {}): AgentFileDetailViewProps['tokenTable'] {
  return { state: { status: 'idle' }, models: null, busyModel: null, onSelectModel: () => {}, ...extra }
}

const file = {
  name: 'AGENTS.md',
  path: 'lmdo-website/docs',
  absolute: '/Users/me/Projects/lmdo-website/docs/AGENTS.md',
}

function render(extra: Partial<AgentFileDetailViewProps> = {}): string {
  const props: AgentFileDetailViewProps = {
    file,
    scope: 'lmdo-website',
    loading: false,
    tokenTable: tokenTable(),
    edit: { editable: false, draft: '', busy: false, dirty: false, onDraft: () => {}, onSave: () => {}, onDiscard: () => {} },
    onBack: () => {},
    ...extra,
  }
  return renderToStaticMarkup(createElement(AgentFileDetailView, props))
}

describe('instruction file detail', () => {
  it('renders the file name, the folder-relative path, and the scope', () => {
    const html = render({ detail: { ...file, size: 2048, modifiedAt: 1792900000000, content: '# docs\n' } })
    expect(html).toContain('AGENTS.md')
    expect(html).toContain('lmdo-website/docs')
    expect(html).toContain('lmdo-website')
    expect(html).toContain('/Users/me/Projects/lmdo-website/docs/AGENTS.md')
    expect(html).toContain('2.0 KB')
  })

  it('carries the token table with the counts it was given', () => {
    const html = render({
      detail: { ...file, size: 7, modifiedAt: 1792900000000, content: '# docs\n' },
      tokenTable: tokenTable({ state: { status: 'ready', entries: [{ id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', tokens: 1234 }] } }),
    })
    expect(html).toContain('DeepSeek V4.1 Flash')
    expect(html).toContain('1,234')
    expect(html).toContain('Token 统计')
  })

  it('renders the raw body and a way back to the list', () => {
    const html = render({ detail: { ...file, size: 7, modifiedAt: 1792900000000, content: '# docs\n' } })
    expect(html).toContain('返回列表')
    expect(html).toContain('复制路径')
    expect(html).toContain('# docs')
  })

  it('shows a reading placeholder until the body arrives', () => {
    const html = render({ loading: true })
    expect(html).toContain('读取文件正文')
    // 正文还没到，但路径已经是已知的：复制按钮从头就在，元数据先显示所属与路径。
    expect(html).toContain('复制路径')
    expect(html).not.toContain('大小')
  })

  it('shows the read error instead of a body when the file cannot be read', () => {
    const html = render({ error: 'not an instruction file on this page' })
    expect(html).toContain('读取失败')
    expect(html).toContain('not an instruction file on this page')
  })

  it('makes the body editable in place once it has arrived, with no edit button', () => {
    const loaded = render({
      detail: { ...file, size: 7, modifiedAt: 1792900000000, content: '# docs\n' },
      edit: { editable: true, draft: '# docs\n', busy: false, dirty: false, onDraft: () => {}, onSave: () => {}, onDiscard: () => {} },
    })
    expect(loaded).toContain('<textarea')
    expect(loaded).not.toContain('>编辑<')
    expect(loaded).toContain('放弃所有编辑')
    expect(render({ loading: true })).not.toContain('<textarea')
    expect(render({ error: 'gone' })).not.toContain('<textarea')
  })

  it('edits the whole file verbatim (instruction files have no frontmatter)', () => {
    const html = render({
      detail: { ...file, size: 7, modifiedAt: 1792900000000, content: '# docs\n' },
      edit: { editable: true, draft: '# docs\n\n- new rule\n', busy: false, dirty: true, onDraft: () => {}, onSave: () => {}, onDiscard: () => {} },
    })
    expect(html).toContain('<textarea')
    expect(html).toContain('- new rule')
    expect(html).toContain('保存')
    expect(html).toContain('放弃所有编辑')
  })

  it('shows the post-save notice', () => {
    const html = render({
      detail: { ...file, size: 7, modifiedAt: 1792900000000, content: '# docs\n' },
      notice: '已保存到磁盘',
    })
    expect(html).toContain('已保存到磁盘')
  })
})

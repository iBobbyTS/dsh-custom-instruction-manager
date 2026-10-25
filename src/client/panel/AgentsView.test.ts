/**
 * AGENTS.md 页的渲染契约：小标题是「用户级」+ 每个工作区（没有「项目级」这
 * 一层），组内大标题是文件名、副标题是从项目文件夹父目录算起的路径，空
 * 分组保留标题并显示灰字。
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentsView, type AgentsViewProps } from './AgentsView.tsx'
import type { AgentsResponse } from '../../protocol.ts'

function render(data: AgentsResponse | null, extra: Partial<AgentsViewProps> = {}): string {
  const props: AgentsViewProps = {
    data,
    loading: false,
    error: null,
    saving: false,
    onRefresh: () => {},
    onSaveExcludeDirs: () => {},
    ...extra,
  }
  return renderToStaticMarkup(createElement(AgentsView, props))
}

const data: AgentsResponse = {
  ok: true,
  excludeDirs: ['.agent-work'],
  groups: [
    { kind: 'user', files: [{ name: 'AGENTS.md', path: '~/.dsh' }] },
    { kind: 'project', title: 'lmdo-website', files: [
      { name: 'AGENTS.md', path: 'lmdo-website' },
      { name: 'AGENTS.local.md', path: 'lmdo-website' },
      { name: 'AGENTS.md', path: 'lmdo-website/docs' },
    ] },
    { kind: 'project', title: 'DeskBrief', files: [] },
  ],
}

describe('AGENTS.md page', () => {
  it('renders the user level and each project as section titles, without a project-level section', () => {
    const html = render(data)
    expect(html).toContain('用户级')
    expect(html).toContain('lmdo-website')
    expect(html).toContain('DeskBrief')
    expect(html).not.toContain('项目级')
  })

  it('renders the file name as the row title and the folder-relative path as its subtitle', () => {
    const html = render(data)
    expect(html).toContain('AGENTS.md')
    expect(html).toContain('lmdo-website/docs')
    expect(html).toContain('~/.dsh')
  })

  it('keeps an empty project visible with a grey “no AGENTS.md” line', () => {
    const html = render(data)
    expect(html).toContain('DeskBrief')
    expect(html).toContain('无 AGENTS.md')
  })

  it('offers the exclude-directory editor with the current count on this page', () => {
    const html = render(data)
    expect(html).toContain('排除目录 (1)')
    expect(html).toContain('重新扫描')
  })

  it('shows a scan error banner instead of an empty list when the scan fails', () => {
    const html = render(null, { error: 'boom' })
    expect(html).toContain('扫描失败')
    expect(html).not.toContain('用户级')
  })
})

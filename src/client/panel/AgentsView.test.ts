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
    scan: null,
    error: null,
    saving: false,
    onRefresh: () => {},
    onSaveExcludeDirs: () => {},
    onOpenFile: () => {},
    ...extra,
  }
  return renderToStaticMarkup(createElement(AgentsView, props))
}

const data: AgentsResponse = {
  ok: true,
  excludeDirs: ['.agent-work'],
  groups: [
    { kind: 'user', files: [{ name: 'AGENTS.md', path: '~/.dsh', absolute: '/Users/me/.dsh/AGENTS.md' }] },
    { kind: 'project', title: 'lmdo-website', files: [
      { name: 'AGENTS.md', path: 'lmdo-website', absolute: '/Users/me/Projects/lmdo-website/AGENTS.md' },
      { name: 'AGENTS.local.md', path: 'lmdo-website', absolute: '/Users/me/Projects/lmdo-website/AGENTS.local.md' },
      { name: 'AGENTS.md', path: 'lmdo-website/docs', absolute: '/Users/me/Projects/lmdo-website/docs/AGENTS.md' },
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

  it('makes every file row keyboard-clickable so it can open the detail view', () => {
    const html = render(data)
    expect(html).toContain('role="button"')
    expect(html).toContain('AGENTS.local.md')
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

  it('turns the rescan button into a disabled “scanning (x%)” label while a scan runs', () => {
    const html = render(data, { scan: { done: 1, total: 4 } })
    expect(html).toContain('扫描中（25%）')
    expect(html).toContain('disabled')
    expect(html).not.toContain('重新扫描')
  })

  it('rounds the percentage and clamps it, and starts at 0% before the first step', () => {
    expect(render(data, { scan: { done: 2, total: 3 } })).toContain('扫描中（67%）')
    expect(render(data, { scan: { done: 0, total: 0 } })).toContain('扫描中（0%）')
    expect(render(data, { scan: { done: 9, total: 4 } })).toContain('扫描中（100%）')
  })

  it('keeps the cached list visible while scanning, so the page never flashes empty', () => {
    const html = render(data, { scan: { done: 1, total: 3 } })
    expect(html).toContain('用户级')
    expect(html).toContain('lmdo-website')
    expect(html).toContain('扫描中（33%）')
  })

  it('shows the scanning placeholder only when there is neither cache nor result yet', () => {
    expect(render(null, { scan: { done: 0, total: 0 } })).toContain('正在扫描指令文件…')
    expect(render(null, { scan: null })).not.toContain('正在扫描指令文件…')
  })
})

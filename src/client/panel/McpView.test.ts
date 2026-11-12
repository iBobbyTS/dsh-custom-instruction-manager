/**
 * MCP 页的渲染契约：服务器行（名称/传输/状态/工具数）、只读行的开关禁用、
 * 展开后的工具清单、密钥默认遮掩、告警与空态。
 *
 * 用 SSR 渲染（与 AGENTS.md 页同一套做法）：这页没有交互状态，静态标记就
 * 足够锁住"看到什么"。
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { McpView, type McpViewProps } from './McpView.tsx'
import type { McpResponse, McpServerInfo } from '../../protocol.ts'

function server(overrides: Partial<McpServerInfo> = {}): McpServerInfo {
  return {
    entryId: 'mcp-codegraph',
    serverName: 'codegraph',
    transport: 'stdio',
    enabled: true,
    phase: 'active',
    status: 'running',
    patchId: 'mcp-codegraph',
    managed: false,
    editable: true,
    removable: false,
    toolCallTimeoutMs: 300_000,
    failOnStartupError: true,
    stdio: { command: '/Users/me/.local/bin/codegraph', args: ['serve', '--mcp'], cwd: '/Users/me', env: { PATH: '/opt/homebrew/bin' } },
    tools: [{ name: 'mcp__codegraph__explore', rawName: 'explore', description: 'Explore the graph', paramNames: ['projectPath'] }],
    ...overrides,
  }
}

const data: McpResponse = {
  ok: true,
  servers: [
    server(),
    server({ entryId: 'mcp-pw', serverName: 'playwright', patchId: 'mcp-playwright', managed: true, removable: true, enabled: false, status: 'disabled', stdio: { command: 'npx', args: ['-y', '@playwright/mcp@latest'], cwd: '', env: {} }, tools: [] }),
    server({ entryId: 'mcp-sub', serverName: 'external_subagent', patchId: undefined, readOnlyReason: 'unaddressable', editable: false, editBlockedReason: 'unaddressable', tools: [] }),
    server({
      entryId: 'mcp-remote',
      serverName: 'remote',
      transport: 'streamable-http',
      stdio: undefined,
      http: { url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer secret-token' } },
      tools: [],
    }),
  ],
  orphanTools: ['mcp__ghost__x'],
  configPath: '/Users/me/.dsh/profiles/desktop/cordis.patch.yml',
  canManage: true,
  warnings: [],
}

function render(overrides: Partial<McpViewProps> = {}): string {
  const props: McpViewProps = {
    data,
    loading: false,
    error: null,
    busyEntry: null,
    notice: null,
    expanded: new Set<string>(),
    editor: null,
    editorBusy: false,
    editorErrors: [],
    editorError: null,
    onRefresh: () => {},
    onToggle: () => {},
    onToggleExpanded: () => {},
    onOpenEditor: () => {},
    onCloseEditor: () => {},
    onSaveServer: () => {},
    onRemoveServer: () => {},
    onDismissNotice: () => {},
    ...overrides,
  }
  return renderToStaticMarkup(createElement(McpView, props))
}

describe('MCP page', () => {
  it('lists every server with its transport, status and tool count', () => {
    const html = render()
    expect(html).toContain('codegraph')
    expect(html).toContain('playwright')
    expect(html).toContain('external_subagent')
    expect(html).toContain('remote')
    // 汇总：4 台服务器 / 1 个工具
    expect(html).toContain('4 台服务器 · 1 个工具')
    expect(html).toContain('stdio')
    expect(html).toContain('HTTP')
    expect(html).toContain('已加载')
    expect(html).toContain('已禁用')
    expect(html).toContain('1 个工具')
    expect(html).toContain('0 个工具')
  })

  it('shows the command line for stdio rows and the URL for HTTP rows', () => {
    const html = render()
    expect(html).toContain('/Users/me/.local/bin/codegraph serve --mcp')
    expect(html).toContain('https://mcp.example.com/mcp')
  })

  it('reflects enablement on the switch and disables it for read-only rows', () => {
    const html = render()
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-checked="false"')
    // external_subagent 行不可寻址：开关禁用并说明原因
    expect(html).toContain('面板无法定位')
    expect(html).toContain('只读')
  })

  it('states the read-only reason on the row and distinguishes a missing manager', () => {
    const html = render({
      data: { ...data, canManage: false, servers: [server({ entryId: 'mcp-x', serverName: 'x', readOnlyReason: 'no-manager' })] },
    })
    // 原因是可见文案（不是只挂在 title 上），且不谎称「补丁里没有 id」。
    expect(html).toContain('当前部署没有插件管理服务，这一页只能读')
    expect(html).not.toContain('补丁里没有 id')
  })

  it('locks every switch while one toggle is in flight', () => {
    const html = render({ busyEntry: 'mcp-codegraph' })
    // 4 台服务器 → 4 个开关 + 「新增服务器」+ 3 个「编辑」+ 1 个「删除」；
    // 飞行中这些按钮全部禁用，避免并发响应互相覆盖。
    expect(html.match(/disabled=""/g)).toHaveLength(9)
  })

  it('expands a server into its tool list', () => {
    const collapsed = render()
    expect(collapsed).not.toContain('mcp__codegraph__explore')

    const expanded = render({ expanded: new Set(['mcp-codegraph']) })
    expect(expanded).toContain('mcp__codegraph__explore')
    expect(expanded).toContain('Explore the graph')
    expect(expanded).toContain('参数：projectPath')
    expect(expanded).toContain('调用超时')
    expect(expanded).toContain('300000 ms')
  })

  it('masks env and header values until the user asks for them', () => {
    const html = render({ expanded: new Set(['mcp-codegraph', 'mcp-remote']) })
    expect(html).toContain('PATH=••••••')
    expect(html).toContain('Authorization=••••••')
    expect(html).not.toContain('/opt/homebrew/bin')
    expect(html).not.toContain('secret-token')
    expect(html).toContain('显示值')
  })

  it('explains an empty server with no tools instead of rendering a blank block', () => {
    const html = render({ expanded: new Set(['mcp-pw']) })
    expect(html).toContain('这个服务器当前没有注册工具')
  })

  it('surfaces read warnings, errors and toggle outcomes', () => {
    expect(render()).toContain('未归属的工具（1）')

    const failed = render({ data: { ...data, warnings: ['pluginManager service is absent: MCP servers are listed from the Loader only and cannot be toggled'], canManage: false }, notice: { kind: 'warn', key: 'mcp.toggleRestart', values: { reason: 'no-hmr' } } })
    expect(failed).toContain('pluginManager service is absent')
    expect(failed).toContain('需要重启 dsh 才生效（no-hmr）')
    expect(failed).toContain('只能查看，不能开关')

    const error = render({ error: 'boom' })
    expect(error).toContain('读取 MCP 服务器失败：boom')

    const toggleFailed = render({ notice: { kind: 'error', key: 'mcp.toggleFailed', values: { error: 'row has no id' } } })
    expect(toggleFailed).toContain('开关失败：row has no id')
  })

  it('offers edit on the row itself, without expanding the row first', () => {
    const collapsed = render()
    // 3 台可编辑的行（codegraph / playwright / remote）直接有「编辑」，
    // 只有本页建的行才有「删除」。
    expect(collapsed.match(/>编辑</g)).toHaveLength(3)
    expect(collapsed.match(/>删除</g)).toHaveLength(1)
    // 不可寻址的行不给编辑按钮，只在行上说明原因。
    expect(collapsed).toContain('这一行在补丁里没有 id')
    // 展开只是看配置与工具清单，不再额外长出动作按钮。
    const expanded = render({ expanded: new Set(['mcp-codegraph', 'mcp-pw', 'mcp-sub']) })
    expect(expanded.match(/>编辑</g)).toHaveLength(3)
  })

  it('states why a row cannot be edited when the toggle itself is fine', () => {
    const noEditor = render({
      data: { ...data, servers: [server({ entryId: 'mcp-x', serverName: 'x', editable: false, editBlockedReason: 'no-editor' })] },
    })
    expect(noEditor).not.toContain('>编辑<')
    expect(noEditor).toContain('当前部署没有提供 dsh 的配置编辑服务')

    const invalid = render({
      data: { ...data, servers: [server({ entryId: 'mcp-y', serverName: 'y', editable: false, editBlockedReason: 'invalid-config' })] },
    })
    expect(invalid).toContain('面板无法安全重写的形状')
  })

  it('marks managed rows with a badge', () => {
    const html = render({ expanded: new Set(['mcp-pw']) })
    expect(html).toContain('本页管理')
  })

  it('renders the add-server form and its field errors', () => {
    const html = render({ editor: { mode: 'create' }, editorErrors: [{ field: 'command', code: 'required' }] })
    expect(html).toContain('新增 MCP 服务器')
    expect(html).toContain('名称（serverName）')
    expect(html).toContain('命令')
    expect(html).toContain('必填')
    expect(html).toContain('保存')
  })

  it('shows a non-field save error inside the dialog', () => {
    const html = render({ editor: { mode: 'create' }, editorError: 'config editor refused the change: boom' })
    expect(html).toContain('保存失败：config editor refused the change: boom')
  })

  it('prefills the edit form from the row and explains the name prefix', () => {
    const html = render({ editor: { mode: 'edit', server: server() } })
    expect(html).toContain('编辑 codegraph')
    expect(html).toContain('value="/Users/me/.local/bin/codegraph"')
    expect(html).toContain('mcp__codegraph__')
  })

  it('renders the empty state with the patch path', () => {
    const html = render({ data: { ...data, servers: [], orphanTools: [] } })
    expect(html).toContain('还没有配置 MCP 服务器')
    expect(html).toContain('cordis.patch.yml')
  })

  it('shows a loading line before the first read arrives', () => {
    const html = render({ data: null, loading: true })
    expect(html).toContain('正在读取 MCP 服务器')
  })
})

it('renders manager source and retained cleanup state without invented configuration or write controls', () => {
  const native = server({
    entryId: 'mcp-manager:native', serverName: 'native', source: 'mcp-manager',
    managerEntryPresent: false, transport: undefined, stdio: undefined, patchId: undefined,
    status: 'failed', enabled: false, readOnlyReason: 'native-manager', editable: false,
    removable: false, managed: false, toolCallTimeoutMs: undefined, failOnStartupError: undefined,
  })
  const html = render({ data: { ...data, servers: [native] }, expanded: new Set([native.entryId]) })
  expect(html).toContain('DSH MCP 管理器')
  expect(html).toContain('清理记录')
  expect(html).toContain('本页仅显示状态和工具')
  expect(html).not.toContain('undefined ms')
  expect(html).not.toContain('调用超时')
  expect(html).not.toContain('>编辑<')
  expect(html).not.toContain('>删除<')
})

/**
 * MCP 运行时接缝的测试：结构接口对着 dsh 服务的真实形状，缺服务时降级。
 *
 * 这里用假服务而不是真 dsh——外部插件只靠 ctx.get() 拿对象，假对象能覆盖
 * 真实的失败形态（服务缺席、调用抛错、未知 application）。
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createMcpAccess } from './mcp-runtime.ts'
import { MCP_CLIENT_MODULE } from './mcp.ts'
import { MANAGED_START, writeManagedBlock } from './mcp-patch.ts'

/** 一行 listPlugins 结果。 */
function row(overrides: Record<string, unknown> = {}) {
  return {
    entryId: 'mcp-codegraph',
    moduleName: MCP_CLIENT_MODULE,
    enabled: true,
    fiberPhase: 'active' as const,
    patchId: 'mcp-codegraph',
    ...overrides,
  }
}

/** 一个只有 entries() 的 Loader 假对象。 */
function loaderOf(entries: Array<{ id: string; name?: string; config?: unknown; disabled?: boolean; state?: number }>) {
  return {
    *entries() {
      for (const entry of entries) {
        yield {
          id: entry.id,
          disabled: entry.disabled,
          fiber: entry.state === undefined ? undefined : { state: entry.state },
          options: { name: entry.name ?? MCP_CLIENT_MODULE, config: entry.config },
        }
      }
    },
  }
}

/** 按名字取服务的 ctx 替身。 */
function ctxOf(services: Record<string, unknown>): (name: string) => unknown {
  return (name) => services[name]
}

describe('createMcpAccess.list', () => {
  it('reads only mcp-client rows and aligns each row with its Loader config', async () => {
    const listPlugins = vi.fn(async () => [
      row(),
      row({ entryId: 'other-plugin', moduleName: 'dsh-other' }),
      row({ entryId: 'mcp-bare', patchId: undefined, readOnlyReason: 'unaddressable' }),
    ])
    const access = createMcpAccess(ctxOf({
      pluginManager: { listPlugins, setPluginEnabled: vi.fn() },
      loader: loaderOf([
        { id: 'mcp-codegraph', config: { serverName: 'codegraph', command: 'x' } },
        { id: 'mcp-bare', config: { serverName: 'bare', command: 'y' } },
        { id: 'other-plugin', config: {} },
      ]),
      tools: { schemas: () => [{ name: 'mcp__codegraph__explore', description: 'explore', parameters: { type: 'object', properties: { q: {} } } }] },
      profileContext: { patchPath: '/tmp/cordis.patch.yml' },
    }))
    const facts = await access.list()
    expect(facts.facts.map((entry) => entry.entryId)).toEqual(['mcp-codegraph', 'mcp-bare'])
    expect(facts.facts[0]?.config).toEqual({ serverName: 'codegraph', command: 'x' })
    expect(facts.facts[1]?.readOnlyReason).toBe('unaddressable')
    expect(facts.configPath).toBe('/tmp/cordis.patch.yml')
    expect(facts.canManage).toBe(true)
    expect(facts.warnings).toEqual([])
  })

  it('falls back to the Loader when pluginManager is absent, and reports it', async () => {
    const access = createMcpAccess(ctxOf({
      loader: loaderOf([{ id: 'mcp-pw', config: { serverName: 'playwright', command: 'npx' }, state: 2 }]),
      tools: { schemas: () => [] },
    }))
    const facts = await access.list()
    expect(facts.canManage).toBe(false)
    expect(facts.warnings[0]).toContain('pluginManager service is absent')
    expect(facts.facts).toEqual([{ entryId: 'mcp-pw', config: { serverName: 'playwright', command: 'npx' }, enabled: true, phase: 'active', readOnlyReason: 'no-manager' }])
  })

  it('survives a failing listPlugins call by degrading to the Loader rows', async () => {
    const access = createMcpAccess(ctxOf({
      pluginManager: { listPlugins: async () => { throw new Error('profile unreadable') }, setPluginEnabled: vi.fn() },
      loader: loaderOf([{ id: 'mcp-x', config: { serverName: 'x', command: 'x' }, state: 3 }]),
      tools: { schemas: () => [] },
    }))
    const facts = await access.list()
    expect(facts.warnings.some((line) => line.includes('pluginManager.listPlugins() failed: profile unreadable'))).toBe(true)
    expect(facts.facts[0]?.phase).toBe('failed')
    expect(facts.facts[0]?.readOnlyReason).toBe('no-manager')
  })

  it('reports missing tools and loader services instead of throwing', async () => {
    const access = createMcpAccess(ctxOf({
      pluginManager: { listPlugins: async () => [row()], setPluginEnabled: vi.fn() },
    }))
    const facts = await access.list()
    expect(facts.canManage).toBe(true)
    expect(facts.facts[0]?.config).toBeUndefined()
    expect(facts.warnings.join('\n')).toContain('loader service is absent: MCP row configs are unavailable')
    expect(facts.warnings.join('\n')).toContain('tools service is absent: tool lists are unavailable')
  })

  it('marks managed rows and config-editor rows as editable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-mcp-runtime-'))
    try {
      const path = join(dir, 'cordis.patch.yml')
      await writeFile(path, writeManagedBlock('', [{ id: 'mcp-hub-a', config: { serverName: 'a', transport: 'stdio', command: 'x' } }]), 'utf8')
      const access = createMcpAccess(ctxOf({
        pluginManager: {
          listPlugins: async () => [
            row({ entryId: 'mcp-hub-a', patchId: 'mcp-hub-a' }),
            row({ entryId: 'mcp-foreign', patchId: 'mcp-foreign' }),
          ],
          setPluginEnabled: vi.fn(),
        },
        loader: loaderOf([
          { id: 'mcp-hub-a', config: { serverName: 'a', transport: 'stdio', command: 'x' } },
          { id: 'mcp-foreign', config: { serverName: 'f', transport: 'stdio', command: 'y' } },
        ]),
        profileContext: { patchPath: path },
        configEditor: { entries: () => [{ id: 'mcp-foreign', options: { id: 'mcp-foreign', name: MCP_CLIENT_MODULE } }] },
        tools: { schemas: () => [] },
      }))
      const facts = await access.list()
      expect(facts.managedIds).toEqual(['mcp-hub-a'])
      expect([...(facts.editableIds ?? [])].sort()).toEqual(['mcp-foreign', 'mcp-hub-a'])
      expect(facts.editBlocked).toEqual({})
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports a broken managed block instead of failing the page', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-mcp-runtime-'))
    try {
      const path = join(dir, 'cordis.patch.yml')
      await writeFile(path, MANAGED_START + '\n- insert: [\n', 'utf8')
      const access = createMcpAccess(ctxOf({
        pluginManager: { listPlugins: async () => [row()], setPluginEnabled: vi.fn() },
        loader: loaderOf([{ id: 'mcp-codegraph', config: { serverName: 'codegraph', command: 'x' } }]),
        tools: { schemas: () => [] },
        profileContext: { patchPath: path },
      }))
      const facts = await access.list()
      expect(facts.managedIds).toEqual([])
      expect(facts.warnings.some((line) => line.includes('MCP managed block'))).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps listing when the tool registry throws', async () => {
    const access = createMcpAccess(ctxOf({
      pluginManager: { listPlugins: async () => [row()], setPluginEnabled: vi.fn() },
      loader: loaderOf([{ id: 'mcp-codegraph', config: { serverName: 'codegraph', command: 'x' } }]),
      tools: { schemas: () => { throw new Error('registry busy') } },
    }))
    const facts = await access.list()
    expect(facts.tools).toEqual([])
    expect(facts.warnings.join('\n')).toContain('tools.schemas() failed: registry busy')
  })
})

describe('createMcpAccess.setEnabled', () => {
  /** A manager whose list holds one MCP row (the only toggle target that is legal). */
  function managerOf(setPluginEnabled: (id: string, enabled: boolean) => Promise<unknown>) {
    return { listPlugins: async () => [row(), row({ entryId: 'other-plugin', moduleName: 'dsh-other' })], setPluginEnabled }
  }

  it('forwards the entry id and enablement and maps the change result', async () => {
    const setPluginEnabled = vi.fn(async () => ({ application: 'restart-required', restartReason: 'no-hmr' }))
    const access = createMcpAccess(ctxOf({ pluginManager: managerOf(setPluginEnabled) }))
    expect(await access.setEnabled('mcp-codegraph', false)).toEqual({ application: 'restart-required', restartReason: 'no-hmr' })
    expect(setPluginEnabled).toHaveBeenCalledWith('mcp-codegraph', false)
  })

  it('reports a management diagnostic for a failed change', async () => {
    const setPluginEnabled = vi.fn(async () => ({ application: 'failed', error: { code: 'unaddressable', diagnostic: 'row has no id' } }))
    const access = createMcpAccess(ctxOf({ pluginManager: managerOf(setPluginEnabled) }))
    expect(await access.setEnabled('mcp-codegraph', true)).toEqual({ application: 'failed', error: 'row has no id', errorCode: 'unaddressable' })
  })

  it('keeps the code-only failure shape dsh actually returns for refused rows', async () => {
    // ManagementFailure 只带 code（没有 diagnostic）：界面要能据 code 说出原因。
    const setPluginEnabled = vi.fn(async () => ({ application: 'failed', error: { code: 'management-required' } }))
    const access = createMcpAccess(ctxOf({ pluginManager: managerOf(setPluginEnabled) }))
    expect(await access.setEnabled('mcp-codegraph', true)).toEqual({ application: 'failed', errorCode: 'management-required' })
  })

  it('maps an unknown application string to failed rather than leaking it', async () => {
    const setPluginEnabled = vi.fn(async () => ({ application: 'something-new' }))
    const access = createMcpAccess(ctxOf({ pluginManager: managerOf(setPluginEnabled) }))
    expect((await access.setEnabled('mcp-codegraph', true)).application).toBe('failed')
  })

  it('refuses an id that is not an MCP row instead of writing another plugin', async () => {
    const setPluginEnabled = vi.fn()
    const access = createMcpAccess(ctxOf({ pluginManager: managerOf(setPluginEnabled) }))
    await expect(access.setEnabled('other-plugin', false)).rejects.toMatchObject({ status: 404 })
    await expect(access.setEnabled('does-not-exist', false)).rejects.toMatchObject({ status: 404 })
    expect(setPluginEnabled).not.toHaveBeenCalled()
  })

  it('throws a clear error when no plugin manager is mounted', async () => {
    const access = createMcpAccess(ctxOf({}))
    await expect(access.setEnabled('mcp-x', true)).rejects.toThrow(/pluginManager service is absent/)
  })
})

describe('native rc.2 MCP manager views', () => {
  it('lists native servers without exposing configuration or diagnostics', async () => {
    const access = createMcpAccess(ctxOf({
      mcpManager: { list: () => [{ name: 'native', configured: true, status: { state: 'connected', toolCount: 1, connectedAt: 0, lastError: 'private detail' } }] },
      pluginManager: { listPlugins: async () => [] }, loader: loaderOf([]),
      tools: { schemas: () => [{ name: 'mcp__native__search' }] },
    }))
    const facts = await access.list()
    expect(facts.managerServers).toEqual([{ name: 'native', configured: true, status: { state: 'connected' } }])
    expect(JSON.stringify(facts)).not.toContain('private detail')
    const { buildMcpResponse } = await import('./mcp.ts')
    const response = buildMcpResponse(facts)
    expect(response.orphanTools).toEqual([])
    expect(response.servers[0]).toMatchObject({ source: 'mcp-manager', status: 'connected', editable: false, removable: false, readOnlyReason: 'native-manager', tools: [{ name: 'mcp__native__search' }] })
    expect(response.servers[0]).not.toHaveProperty('transport')
    expect(response.servers[0]).not.toHaveProperty('toolCallTimeoutMs')
    await expect(access.setEnabled('mcp-manager:native', false)).rejects.toThrow('unknown MCP server entry')
  })
  it('preserves disabled and removed cleanup states without reporting them connected', async () => {
    const access = createMcpAccess(ctxOf({
      mcpManager: { list: () => [
        { name: 'off', configured: true, status: { state: 'disabled' } },
        { name: 'cleanup', configured: false, status: { state: 'failed', reason: 'cleanup', result: {} } },
      ] },
      pluginManager: { listPlugins: async () => [] }, loader: loaderOf([]),
    }))
    const { buildMcpResponse } = await import('./mcp.ts')
    const response = buildMcpResponse(await access.list())
    expect(response.servers.map(({ status, enabled, managerEntryPresent }) => ({ status, enabled, managerEntryPresent }))).toEqual([
      { status: 'disabled', enabled: false, managerEntryPresent: true },
      { status: 'failed', enabled: false, managerEntryPresent: false },
    ])
  })
  it('keeps legacy rows when the manager status read fails', async () => {
    const access = createMcpAccess(ctxOf({
      mcpManager: { list: () => { throw new Error('unavailable') } },
      pluginManager: { listPlugins: async () => [row()] },
      loader: loaderOf([{ id: 'mcp-codegraph', config: { serverName: 'codegraph', command: 'x' } }]),
    }))
    const facts = await access.list()
    expect(facts.facts).toHaveLength(1)
    expect(facts.warnings).toContain('mcpManager.list() failed: unavailable')
  })
})

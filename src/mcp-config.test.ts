/**
 * MCP 写入口的端到端测试（假服务 + 临时补丁文件）：
 *
 *   - 新建/编辑/删除受管行时只重写本插件的块，块外内容不动；
 *   - 非受管行交给 config-editor，不碰文件；
 *   - 同名服务器、非受管删除、未知行、坏块、`!!js` 都按预期拒绝；
 *   - Loader 不应用时如实回 restart-required。
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMcpConfig } from './mcp-config.ts'
import { MCP_CLIENT_MODULE } from './mcp.ts'
import { MANAGED_START, McpPatchError, readManagedBlock } from './mcp-patch.ts'
import type { McpServerInput } from './protocol.ts'

/** 假 Loader 条目。 */
interface FakeEntry {
  id: string
  options: { id: string; name: string; config: unknown }
}

/** 一行 MCP 服务器。 */
function entry(id: string, config: Record<string, unknown>): FakeEntry {
  return { id, options: { id, name: MCP_CLIENT_MODULE, config } }
}

/** stdio 提交值。 */
function stdio(overrides: Partial<McpServerInput> = {}): McpServerInput {
  return { serverName: 'demo', transport: 'stdio', command: 'node', args: ['server.js'], env: {}, ...overrides }
}

/**
 * 假服务集合：Loader 的行从补丁文件里现读（模拟 HMR 立即应用），
 * config-editor 直接改自己持有的行。
 */
function harness(dir: string, options: { staticLoader?: boolean; noEditor?: boolean } = {}) {
  const patchPath = join(dir, 'cordis.patch.yml')
  const foreign: FakeEntry[] = []
  const edits: Record<string, unknown>[] = []
  let loaderCalls = 0
  const services: Record<string, unknown> = {
    profileContext: { patchPath },
    hmr: { runExclusive: <T>(run: () => Promise<T>): Promise<T> => run() },
    loader: {
      entries: () => {
        loaderCalls += 1
        if (options.staticLoader === true) return foreign
        const text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
        return [...foreign, ...readManagedBlock(text).map((row) => entry(row.id, row.config))]
      },
    },
    configEditor: {
      entries: () => foreign.filter((item) => item.options.name === MCP_CLIENT_MODULE),
      configuration: () => foreign.map((item) => ({
        entry: item,
        inherited: item.options.config as Record<string, unknown>,
        override: {},
      })),
      edit: async (item: FakeEntry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>) => {
        const current = structuredClone(item.options.config) as Record<string, unknown>
        const next = change(current, current)
        item.options.config = next
        edits.push(next)
      },
    },
  }
  if (options.noEditor === true) delete services.configEditor
  const config = createMcpConfig((name) => services[name], { applyTimeoutMs: 200, pollMs: 10 })
  return { config, patchPath, foreign, edits, loaderCalls: () => loaderCalls }
}

const BASE_PATCH = '# 手工维护的补丁\n- id: plugin-manager\n  name: "@deepseek-ai/dsh-plugin-manager"\n  disabled: false\n'

describe('mcp configurator', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-mcp-config-'))
    await writeFile(join(dir, 'cordis.patch.yml'), BASE_PATCH, 'utf8')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates a server in the managed block and keeps the rest of the patch', async () => {
    const { config, patchPath } = harness(dir)
    const outcome = await config.save(stdio())
    expect(outcome).toEqual({ application: 'applied', entryId: 'mcp-hub-demo' })
    const text = await readFile(patchPath, 'utf8')
    expect(text.startsWith(BASE_PATCH)).toBe(true)
    expect(text).toContain(MANAGED_START)
    expect(readManagedBlock(text)).toEqual([{
      id: 'mcp-hub-demo',
      config: { serverName: 'demo', transport: 'stdio', command: 'node', args: ['server.js'] },
    }])
  })

  it('refuses a duplicate server name and points at the field', async () => {
    const { config, foreign } = harness(dir)
    foreign.push(entry('mcp-old', { serverName: 'demo', transport: 'stdio', command: 'old' }))
    await expect(config.save(stdio())).rejects.toMatchObject({ status: 409, field: 'serverName' })
  })

  it('edits a managed row in place', async () => {
    const { config, patchPath, edits } = harness(dir)
    await config.save(stdio())
    const outcome = await config.save(stdio({ command: 'bun', args: ['run', 'server.ts'], toolCallTimeoutMs: 120000 }), 'mcp-hub-demo')
    expect(outcome).toEqual({ application: 'applied', entryId: 'mcp-hub-demo' })
    expect(edits).toEqual([])
    const rows = readManagedBlock(await readFile(patchPath, 'utf8'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.config).toMatchObject({ command: 'bun', args: ['run', 'server.ts'], toolCallTimeoutMs: 120000 })
  })

  it('delegates a foreign row to the config editor without touching the file', async () => {
    const { config, patchPath, foreign, edits } = harness(dir)
    const before = await readFile(patchPath, 'utf8')
    foreign.push(entry('mcp-remote', { serverName: 'remote', transport: 'streamable-http', url: 'https://old.example.com/mcp', headers: { 'X-A': '1' } }))
    const outcome = await config.save({
      serverName: 'remote',
      transport: 'streamable-http',
      url: 'https://new.example.com/mcp',
      headers: { 'X-A': '1' },
    }, 'mcp-remote')
    expect(outcome).toEqual({ application: 'applied', entryId: 'mcp-remote' })
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ url: 'https://new.example.com/mcp' })
    expect(await readFile(patchPath, 'utf8')).toBe(before)
  })

  it('refuses to rewrite a row that carries a !!js expression', async () => {
    const { config, foreign } = harness(dir)
    foreign.push(entry('mcp-env', {
      serverName: 'envdom',
      transport: 'stdio',
      command: 'npx',
      env: { TOKEN: { __jsExpr: 'process.env.TOKEN' } },
    }))
    await expect(config.save(stdio({ serverName: 'envdom', command: 'npx' }), 'mcp-env'))
      .rejects.toMatchObject({ status: 409 })
  })

  it('removes a managed row and leaves the markers', async () => {
    const { config, patchPath } = harness(dir)
    await config.save(stdio())
    const outcome = await config.remove('mcp-hub-demo')
    expect(outcome).toEqual({ application: 'applied', entryId: 'mcp-hub-demo' })
    const text = await readFile(patchPath, 'utf8')
    expect(readManagedBlock(text)).toEqual([])
    expect(text).toContain(MANAGED_START)
    expect(text.startsWith(BASE_PATCH)).toBe(true)
  })

  it('refuses to delete a row it does not manage', async () => {
    const { config, foreign } = harness(dir)
    foreign.push(entry('mcp-old', { serverName: 'old', transport: 'stdio', command: 'x' }))
    await expect(config.remove('mcp-old')).rejects.toMatchObject({ status: 409 })
    await expect(config.remove('mcp-missing')).rejects.toMatchObject({ status: 404 })
  })

  it('reports a broken managed block instead of overwriting it', async () => {
    const { config, patchPath } = harness(dir)
    const broken = MANAGED_START + '\n- insert: [\n'
    await writeFile(patchPath, broken, 'utf8')
    await expect(config.save(stdio())).rejects.toBeInstanceOf(McpPatchError)
    expect(await readFile(patchPath, 'utf8')).toBe(broken)
  })

  it('reports restart-required when the Loader does not apply the change', async () => {
    const { config } = harness(dir, { staticLoader: true })
    const outcome = await config.save(stdio())
    expect(outcome).toEqual({ application: 'restart-required', entryId: 'mcp-hub-demo', restartReason: 'load-pending' })
  })

  it('refuses an edit when no config editor is mounted', async () => {
    const { config, foreign } = harness(dir, { noEditor: true })
    foreign.push(entry('mcp-old', { serverName: 'old', transport: 'stdio', command: 'x' }))
    await expect(config.save(stdio({ serverName: 'old' }), 'mcp-old')).rejects.toMatchObject({ status: 409 })
  })
})

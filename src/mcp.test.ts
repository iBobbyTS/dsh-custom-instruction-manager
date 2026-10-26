/**
 * MCP 投影的单元测试：把「Loader 行事实 + 工具表」折成面板数据的规则。
 *
 * 这些规则全部来自本机 dsh 0.2.1-rc.3 的真实形状（见 .agent-work/PLAN.md）：
 * 行配置是补丁原文、工具名带 `mcp__<serverName>__` 前缀、不可寻址的行只有
 * readOnlyReason。
 */

import { describe, expect, it } from 'vitest'
import { buildMcpResponse, JS_EXPR_PLACEHOLDER, projectMcpServers, type McpServerFacts, type McpToolFact } from './mcp.ts'

/** 一行事实，默认是一个健康的 stdio 服务器。 */
function fact(overrides: Partial<McpServerFacts> = {}): McpServerFacts {
  return {
    entryId: 'mcp-codegraph',
    config: { transport: 'stdio', serverName: 'codegraph', command: '/Users/me/.local/bin/codegraph', args: ['serve', '--mcp'] },
    enabled: true,
    phase: 'active',
    patchId: 'mcp-codegraph',
    ...overrides,
  }
}

/** 一个工具事实。 */
function tool(name: string, description = '', parameters?: unknown): McpToolFact {
  return { name, ...(description !== '' ? { description } : {}), ...(parameters !== undefined ? { parameters } : {}) }
}

describe('projectMcpServers', () => {
  it('projects stdio rows with their defaults and read-only facts', () => {
    const { servers, warnings } = projectMcpServers([
      fact({
        config: {
          transport: 'stdio',
          serverName: 'codegraph',
          command: '/Users/me/.local/bin/codegraph',
          args: ['serve', '--mcp'],
          cwd: '/Users/me',
          env: { PATH: '/opt/homebrew/bin', IGNORED: 42 },
          toolCallTimeoutMs: 300_000,
          failOnStartupError: true,
        },
      }),
      fact({
        entryId: 'mcp-bare',
        patchId: undefined,
        readOnlyReason: 'unaddressable',
        config: { serverName: 'bare', command: 'npx' },
      }),
    ])
    expect(warnings).toEqual([])
    const [codegraph, bare] = servers
    expect(codegraph).toEqual({
      entryId: 'mcp-codegraph',
      serverName: 'codegraph',
      transport: 'stdio',
      enabled: true,
      phase: 'active',
      status: 'running',
      patchId: 'mcp-codegraph',
      toolCallTimeoutMs: 300_000,
      failOnStartupError: true,
      stdio: { command: '/Users/me/.local/bin/codegraph', args: ['serve', '--mcp'], cwd: '/Users/me', env: { PATH: '/opt/homebrew/bin' } },
      tools: [],
    })
    // 缺 transport 的旧行按形状推断为 stdio；默认值补齐。
    expect(bare.transport).toBe('stdio')
    expect(bare.readOnlyReason).toBe('unaddressable')
    expect(bare.patchId).toBeUndefined()
    expect(bare.stdio).toEqual({ command: 'npx', args: [], cwd: '', env: {} })
    expect(bare.toolCallTimeoutMs).toBe(60_000)
    expect(bare.failOnStartupError).toBe(false)
  })

  it('projects streamable-http rows', () => {
    const { servers } = projectMcpServers([
      fact({ config: { transport: 'streamable-http', serverName: 'remote', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer t' } } }),
    ])
    expect(servers[0]?.http).toEqual({ url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer t' } })
    expect(servers[0]?.stdio).toBeUndefined()
  })

  it('derives status from enablement and fiber phase only', () => {
    const cases: Array<[boolean, McpServerFacts['phase'], string]> = [
      [false, 'active', 'disabled'],
      [false, 'failed', 'disabled'],
      [true, 'failed', 'failed'],
      [true, 'active', 'running'],
      [true, 'pending', 'starting'],
      [true, 'loading', 'starting'],
      [true, 'unloading', 'starting'],
      [true, null, 'starting'],
    ]
    for (const [enabled, phase, status] of cases) {
      const { servers } = projectMcpServers([fact({ enabled, phase })])
      expect(servers[0]?.status).toBe(status)
    }
  })

  it('attributes tools to the longest matching namespace and collects orphans', () => {
    const { servers, orphanTools } = projectMcpServers(
      [
        fact({ entryId: 'm-outer', config: { serverName: 'a', command: 'x' } }),
        fact({ entryId: 'm-inner', config: { serverName: 'a__b', command: 'y' } }),
      ],
      [
        tool('mcp__a__one', 'first', { type: 'object', properties: { path: { type: 'string' }, depth: { type: 'number' } } }),
        tool('mcp__a__b__two', 'second'),
        tool('mcp__ghost__x', 'unknown server'),
        tool('read', 'not an MCP tool'),
      ],
    )
    expect(servers[0]?.tools).toEqual([{ name: 'mcp__a__one', rawName: 'one', description: 'first', paramNames: ['path', 'depth'] }])
    expect(servers[1]?.tools).toEqual([{ name: 'mcp__a__b__two', rawName: 'two', description: 'second', paramNames: [] }])
    expect(orphanTools).toEqual(['mcp__ghost__x'])
  })

  it('renders !!js config values as an inert placeholder instead of dropping them', () => {
    // 补丁里的 !!js 表达式在 Loader 条目配置里是 { __jsExpr }：面板不执行它，
    // 但也必须让这一行照常出现（否则等于谎报服务器缺少配置）。
    const { servers, warnings } = projectMcpServers([
      fact({
        config: {
          serverName: 'expr',
          transport: 'stdio',
          command: { __jsExpr: 'process.env.CODEGRAPH_BIN' },
          args: [{ __jsExpr: "['serve', '--mcp']" }, '--verbose'],
          cwd: { __jsExpr: 'process.env.HOME' },
          env: { TOKEN: { __jsExpr: 'process.env.TOKEN' }, PATH: '/bin' },
        },
      }),
    ])
    expect(warnings).toEqual([])
    expect(servers[0]?.stdio).toEqual({
      command: JS_EXPR_PLACEHOLDER,
      args: [JS_EXPR_PLACEHOLDER, '--verbose'],
      cwd: JS_EXPR_PLACEHOLDER,
      env: { TOKEN: JS_EXPR_PLACEHOLDER, PATH: '/bin' },
    })
  })

  it('infers the transport from the config shape when transport itself is an expression', () => {
    const { servers, warnings } = projectMcpServers([
      fact({ config: { serverName: 'expr', transport: { __jsExpr: "'stdio'" }, command: 'x' } }),
    ])
    expect(servers[0]?.transport).toBe('stdio')
    expect(warnings.join('\n')).toContain('inferred from the config shape')
  })

  it('skips a row whose serverName is an expression, because tools cannot be attributed', () => {
    const { servers, warnings } = projectMcpServers([
      fact({ config: { serverName: { __jsExpr: "'dynamic'" }, transport: 'stdio', command: 'x' } }),
    ])
    expect(servers).toEqual([])
    expect(warnings[0]).toContain('serverName is a !!js expression')
  })

  it('skips unreadable rows with an actionable warning instead of failing the page', () => {
    const { servers, warnings } = projectMcpServers([
      fact({ entryId: 'm-ok', config: { serverName: 'codegraph', command: 'x' } }),
      fact({ entryId: 'm-null', config: undefined }),
      fact({ entryId: 'm-scalar', config: 'stdio' }),
      fact({ entryId: 'm-name', config: { serverName: 'has space', command: 'x' } }),
      fact({ entryId: 'm-dup', config: { serverName: 'codegraph', command: 'dup' } }),
      fact({ entryId: 'm-weird', config: { serverName: 'weird', transport: 'sse', url: 'https://x' } }),
    ])
    expect(servers.map((server) => server.serverName)).toEqual(['codegraph'])
    expect(warnings).toHaveLength(5)
    expect(warnings[0]).toContain('"m-null"')
    expect(warnings[1]).toContain('"m-scalar"')
    expect(warnings[2]).toContain('"m-name"')
    expect(warnings[3]).toContain('more than once')
    expect(warnings[3]).toContain('"m-dup"')
    expect(warnings[4]).toContain('"m-weird"')
  })

  it('keeps an unknown-transport row out of the list even when a command is present', () => {
    const { servers, warnings } = projectMcpServers([fact({ config: { serverName: 'x', transport: 'sse', command: 'x' } })])
    expect(servers).toEqual([])
    expect(warnings[0]).toContain('unknown transport')
  })
})

describe('buildMcpResponse', () => {
  it('merges read warnings ahead of projection warnings and keeps the environment facts', () => {
    const response = buildMcpResponse({
      facts: [fact(), fact({ entryId: 'm-bad', config: undefined })],
      tools: [],
      configPath: '/Users/me/.dsh/profiles/desktop/cordis.patch.yml',
      canManage: false,
      warnings: ['pluginManager service is absent'],
    })
    expect(response.ok).toBe(true)
    expect(response.servers).toHaveLength(1)
    expect(response.configPath).toContain('cordis.patch.yml')
    expect(response.canManage).toBe(false)
    expect(response.warnings).toHaveLength(2)
    expect(response.warnings[0]).toBe('pluginManager service is absent')
    expect(response.warnings[1]).toContain('"m-bad"')
  })
})

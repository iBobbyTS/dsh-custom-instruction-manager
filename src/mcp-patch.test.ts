/**
 * 受管块与表单校验的纯函数测试：标记定位、原样保留块外内容、解析/重写的
 * 边界，以及面板提交值的归一化。
 */

import { describe, expect, it } from 'vitest'
import {
  applyServerToConfig,
  configFromServer,
  entryIdFor,
  HUB_ENTRY_PREFIX,
  MANAGED_END,
  MANAGED_START,
  McpPatchError,
  normalizeServerInput,
  readManagedBlock,
  uniqueEntryId,
  writeManagedBlock,
} from './mcp-patch.ts'

/** 一行受管服务器的补丁形状。 */
function row(id: string, config: Record<string, unknown>): { id: string; name: string; config: Record<string, unknown> } {
  return { id, name: '@deepseek-ai/dsh-mcp-client', config }
}

const demo = row('mcp-hub-demo', { serverName: 'demo', transport: 'stdio', command: 'node', args: ['server.js'] })

describe('managed block', () => {
  it('reports no rows when the patch has no markers', () => {
    expect(readManagedBlock('- id: ui-chat\n  name: x\n')).toEqual([])
    expect(readManagedBlock('')).toEqual([])
  })

  it('appends a block and round-trips the rows', () => {
    const text = '# 手工维护的补丁\n- id: ui-chat\n  name: chat\n  config:\n    view: standard\n'
    const next = writeManagedBlock(text, [demo])
    expect(next.startsWith(text)).toBe(true)
    expect(next).toContain(MANAGED_START)
    expect(next.endsWith(MANAGED_END + '\n')).toBe(true)
    expect(readManagedBlock(next)).toEqual([{ id: 'mcp-hub-demo', config: demo.config }])
  })

  it('rewrites only the block and leaves the rest byte-identical', () => {
    const before = '# top\n- id: a\n  name: a\n\n' + writeManagedBlock('', [demo]) + '\n# bottom\n- id: b\n  name: b\n'
    const updated = row('mcp-hub-demo', { serverName: 'demo', transport: 'streamable-http', url: 'https://example.com/mcp' })
    const after = writeManagedBlock(before, [updated])
    const body = (text: string): string => {
      const start = text.indexOf(MANAGED_START)
      const end = text.indexOf(MANAGED_END)
      return text.slice(0, start) + text.slice(end + MANAGED_END.length)
    }
    expect(body(after)).toBe(body(before))
    expect(readManagedBlock(after)).toEqual([{ id: 'mcp-hub-demo', config: updated.config }])
  })

  it('keeps other rows, comments and !!js outside the block', () => {
    const text = [
      '- id: mcp-old',
      '  name: "@deepseek-ai/dsh-mcp-client"',
      '  config:',
      '    serverName: old',
      '    env:',
      "      TOKEN: !!js process.env.TOKEN",
      '',
    ].join('\n')
    const next = writeManagedBlock(text, [demo])
    // 原有行与表达式原样保留（只追加了块）。
    expect(next).toContain("TOKEN: !!js process.env.TOKEN")
    expect(next.startsWith(text)).toBe(true)
  })

  it('tolerates a missing end marker but refuses an orphan or duplicate one', () => {
    expect(readManagedBlock(MANAGED_START + '\n- insert:\n    - id: a\n      name: "@deepseek-ai/dsh-mcp-client"\n      config: {serverName: a, transport: stdio, command: x}\n')).toEqual([
      { id: 'a', config: { serverName: 'a', transport: 'stdio', command: 'x' } },
    ])
    expect(() => readManagedBlock('- insert: []\n' + MANAGED_END + '\n')).toThrow(/end marker but no start/)
    expect(() => readManagedBlock(MANAGED_START + '\n' + MANAGED_START + '\n')).toThrow(/declared twice/)
  })

  it('ignores and preserves rows another writer appends inside the markers', () => {
    // dsh 的 config-editor 把覆盖行 append 到 YAML 序列末尾，于是它落在
    // 结束标记之前：这段不属于受管块，读写都必须原样保留。
    const managed = writeManagedBlock('', [demo])
    const withForeign = managed.replace(MANAGED_END, '- id: mcp-codegraph\n  name: "@deepseek-ai/dsh-mcp-client"\n  config:\n    toolCallTimeoutMs: 180000\n\n' + MANAGED_END)
    expect(readManagedBlock(withForeign)).toEqual([{ id: 'mcp-hub-demo', config: demo.config }])

    const updated = row('mcp-hub-demo', { serverName: 'demo', transport: 'stdio', command: 'bun' })
    const after = writeManagedBlock(withForeign, [updated])
    expect(after).toContain('- id: mcp-codegraph\n  name: "@deepseek-ai/dsh-mcp-client"')
    expect(after).toContain('toolCallTimeoutMs: 180000')
    expect(readManagedBlock(after)).toEqual([{ id: 'mcp-hub-demo', config: updated.config }])
  })

  it('refuses a block that holds another plugin or no id', () => {
    const foreign = writeManagedBlock('', []) // 只有标记的空块不合法？空块是合法的（清空后保留标记）
    expect(readManagedBlock(foreign)).toEqual([])
    const bad = MANAGED_START + '\n- insert:\n    - id: x\n      name: "@acme/other"\n      config: {}\n' + MANAGED_END + '\n'
    expect(() => readManagedBlock(bad)).toThrow(/only @deepseek-ai\/dsh-mcp-client/)
    const noId = MANAGED_START + '\n- insert:\n    - name: "@deepseek-ai/dsh-mcp-client"\n      config: {}\n' + MANAGED_END + '\n'
    expect(() => readManagedBlock(noId)).toThrow(/no string id/)
  })

  it('refuses duplicate ids and !!js inside the block', () => {
    const dup = MANAGED_START + '\n- insert:\n    - id: a\n      name: "@deepseek-ai/dsh-mcp-client"\n      config: {serverName: a, transport: stdio, command: x}\n    - id: a\n      name: "@deepseek-ai/dsh-mcp-client"\n      config: {serverName: b, transport: stdio, command: x}\n' + MANAGED_END + '\n'
    expect(() => readManagedBlock(dup)).toThrow(/repeats the id/)
    const expression = MANAGED_START + '\n- insert:\n    - id: a\n      name: "@deepseek-ai/dsh-mcp-client"\n      config:\n        env:\n          T: !!js process.env.T\n' + MANAGED_END + '\n'
    expect(() => readManagedBlock(expression)).toThrow(/!!js/)
  })

  it('throws a typed error with the 409 default', () => {
    try {
      readManagedBlock(MANAGED_START + '\n- insert: [\n' + MANAGED_END + '\n')
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toBeInstanceOf(McpPatchError)
      expect((error as McpPatchError).status).toBe(409)
    }
  })
})

describe('entry ids', () => {
  it('derives a readable id and avoids collisions', () => {
    expect(entryIdFor('my-server_1')).toBe(HUB_ENTRY_PREFIX + 'my-server-1')
    expect(uniqueEntryId('demo', [])).toBe('mcp-hub-demo')
    expect(uniqueEntryId('demo', ['mcp-hub-demo'])).toBe('mcp-hub-demo-2')
    expect(uniqueEntryId('demo', ['mcp-hub-demo', 'mcp-hub-demo-2'])).toBe('mcp-hub-demo-3')
  })
})

describe('server input normalization', () => {
  it('accepts a stdio server and drops HTTP-only fields', () => {
    const result = normalizeServerInput({
      serverName: 'demo',
      transport: 'stdio',
      command: ' node ',
      args: ['a', 'b'],
      env: { TOKEN: 'x' },
      url: 'https://ignored',
      toolCallTimeoutMs: 120000,
      failOnStartupError: true,
    })
    expect(result.errors).toEqual([])
    expect(result.server).toEqual({
      serverName: 'demo',
      transport: 'stdio',
      command: 'node',
      args: ['a', 'b'],
      env: { TOKEN: 'x' },
      toolCallTimeoutMs: 120000,
      failOnStartupError: true,
    })
  })

  it('accepts an HTTP server and drops stdio-only fields', () => {
    const result = normalizeServerInput({
      serverName: 'remote',
      transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer x' },
      command: 'ignored',
    })
    expect(result.errors).toEqual([])
    expect(result.server).toEqual({
      serverName: 'remote',
      transport: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer x' },
      toolCallTimeoutMs: undefined,
      maxInstructionBytes: undefined,
    })
  })

  it('reports every invalid field at once', () => {
    const result = normalizeServerInput({
      serverName: 'bad name!',
      transport: 'stdio',
      command: '   ',
      args: ['ok', 3],
      env: { 'BAD=KEY': 'x' },
      toolCallTimeoutMs: 0,
      maxInstructionBytes: 1.5,
      failOnStartupError: 'yes',
    })
    const fields = result.errors.map((error) => error.field).sort()
    expect(fields).toEqual(['args', 'command', 'env.BAD=KEY', 'failOnStartupError', 'maxInstructionBytes', 'serverName', 'toolCallTimeoutMs'])
    expect(result.server).toBeUndefined()
    expect(normalizeServerInput({ serverName: 'a', transport: 'carrier-pigeon' }).errors).toEqual([{ field: 'transport', code: 'invalid' }])
  })

  it('requires a command for stdio and an http(s) URL for HTTP', () => {
    expect(normalizeServerInput({ serverName: 'a', transport: 'stdio' }).errors).toEqual([{ field: 'command', code: 'required' }])
    expect(normalizeServerInput({ serverName: 'a', transport: 'streamable-http' }).errors).toEqual([{ field: 'url', code: 'required' }])
    expect(normalizeServerInput({ serverName: 'a', transport: 'streamable-http', url: 'ftp://x' }).errors).toEqual([{ field: 'url', code: 'invalid' }])
  })

  it('treats null timeouts as "use the default" and rejects non-integer values', () => {
    const cleared = normalizeServerInput({ serverName: 'a', transport: 'stdio', command: 'x', toolCallTimeoutMs: null, maxInstructionBytes: null })
    expect(cleared.errors).toEqual([])
    expect(cleared.server?.toolCallTimeoutMs).toBeNull()
    expect(normalizeServerInput({ serverName: 'a', transport: 'stdio', command: 'x', toolCallTimeoutMs: -1 }).errors).toEqual([{ field: 'toolCallTimeoutMs', code: 'range' }])
  })
})

describe('config round-trip', () => {
  it('writes only the fields the transport uses', () => {
    const stdio = configFromServer({ serverName: 'a', transport: 'stdio', command: 'node', args: [], env: {} })
    expect(stdio).toEqual({ serverName: 'a', transport: 'stdio', command: 'node', args: [] })
    const http = configFromServer({ serverName: 'a', transport: 'streamable-http', url: 'https://x/mcp', headers: {} })
    expect(http).toEqual({ serverName: 'a', transport: 'streamable-http', url: 'https://x/mcp' })
  })

  it('clears the other transport and keeps unknown fields when editing', () => {
    const base = {
      serverName: 'a',
      transport: 'stdio',
      command: 'node',
      args: ['x'],
      env: { TOKEN: 't' },
      reconnect: { enabled: false },
      maxInstructionBytes: 512,
    }
    const next = applyServerToConfig(base, { serverName: 'a', transport: 'streamable-http', url: 'https://x/mcp', headers: {}, toolCallTimeoutMs: null, maxInstructionBytes: null })
    expect(next).toEqual({ serverName: 'a', transport: 'streamable-http', url: 'https://x/mcp', reconnect: { enabled: false } })
    expect(base.command).toBe('node')
  })
})

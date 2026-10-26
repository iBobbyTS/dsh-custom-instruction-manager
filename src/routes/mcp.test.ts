/**
 * MCP 路由测试：围栏/方法/参数校验，以及开关结果的透传。
 *
 * 访问面用假实现（真实现见 mcp-runtime.test.ts），这一层只验证 HTTP 契约：
 * GET 列表、POST 开关、缺服务 503、参数非法 400、方法不符 405。
 */

import type { IncomingMessage } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { McpAccessError, type McpAccess, type McpListFacts } from '../mcp.ts'
import { makeRoutes } from '../routes.ts'
import { SKILL_HUB_API, type HubConfig } from '../protocol.ts'
import { SkillHubStore, statePath } from '../store.ts'
import type { SkillHubRouteDeps } from '../routes.ts'

/** 最小响应替身（记录状态码与 JSON 体）。 */
class FakeResponse {
  status = 0
  headers: Record<string, string> = {}
  body = ''
  writeHead(status: number, headers?: Record<string, string>): void {
    this.status = status
    if (headers !== undefined) this.headers = headers
  }
  end(chunk?: string): void {
    this.body = chunk ?? ''
  }
  json(): unknown {
    try { return JSON.parse(this.body) } catch { return undefined }
  }
}

/** 最小请求替身（默认回环地址；POST 带 JSON 体）。 */
function fakeReq(method: string, url = '/', body?: unknown, remoteAddress = '127.0.0.1'): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  } as unknown as IncomingMessage
}

/** 一份最小的列表事实集。 */
function facts(): McpListFacts {
  return {
    facts: [
      { entryId: 'mcp-codegraph', config: { serverName: 'codegraph', command: 'codegraph' }, enabled: true, phase: 'active', patchId: 'mcp-codegraph' },
    ],
    tools: [{ name: 'mcp__codegraph__explore', description: 'explore' }],
    configPath: '/tmp/cordis.patch.yml',
    canManage: true,
    warnings: [],
  }
}

describe('mcp routes', () => {
  let dir: string
  let deps: SkillHubRouteDeps
  let access: { list: ReturnType<typeof vi.fn>; setEnabled: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-mcp-routes-'))
    const store = new SkillHubStore(statePath(dir))
    access = {
      list: vi.fn(async () => facts()),
      setEnabled: vi.fn(async () => ({ application: 'applied' as const })),
    }
    deps = {
      skills: { snapshot: async () => ({ skills: [], complete: true }), get: async () => undefined },
      store,
      home: dir,
      agentsHome: join(dir, 'agents-home'),
      mcp: access as unknown as McpAccess,
    }
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  /** 按路径取路由（避免数组解构的位置脆弱性）。 */
  function routeFor(path: string) {
    const route = makeRoutes(deps).find((item) => item.path === path)
    if (route === undefined) throw new Error('route not found: ' + path)
    return route
  }

  it('lists the projected servers', async () => {
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcp).handler(fakeReq('GET', SKILL_HUB_API.mcp), res as never)
    expect(res.status).toBe(200)
    const body = res.json() as { ok: boolean; servers: Array<{ serverName: string; status: string; tools: unknown[] }>; configPath: string }
    expect(body.ok).toBe(true)
    expect(body.servers[0]?.serverName).toBe('codegraph')
    expect(body.servers[0]?.status).toBe('running')
    expect(body.servers[0]?.tools).toHaveLength(1)
    expect(body.configPath).toBe('/tmp/cordis.patch.yml')
  })

  it('answers 503 when the deployment has no MCP access', async () => {
    deps.mcp = undefined
    for (const [method, path] of [['GET', SKILL_HUB_API.mcp], ['POST', SKILL_HUB_API.mcpToggle]] as const) {
      const res = new FakeResponse()
      await routeFor(path).handler(fakeReq(method, path, method === 'POST' ? { entryId: 'x', enabled: false } : undefined), res as never)
      expect(res.status).toBe(503)
    }
  })

  it('toggles through the access surface and returns the refreshed list', async () => {
    // 开关后的那次读返回关掉之后的状态：回传的必须来自这一次读，而不是开关前的快照。
    const before = facts().facts[0]!
    access.list.mockResolvedValueOnce({ ...facts(), facts: [{ ...before, enabled: false }] })
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcpToggle).handler(fakeReq('POST', SKILL_HUB_API.mcpToggle, { entryId: 'mcp-codegraph', enabled: false }), res as never)
    expect(res.status).toBe(200)
    expect(access.setEnabled).toHaveBeenCalledWith('mcp-codegraph', false)
    const body = res.json() as { ok: boolean; application: string; mcp: { servers: Array<{ enabled: boolean; status: string }> } }
    expect(body.application).toBe('applied')
    expect(body.mcp.servers[0]?.enabled).toBe(false)
    expect(body.mcp.servers[0]?.status).toBe('disabled')
  })

  it('answers 404 when the access surface refuses a non-MCP entry', async () => {
    access.setEnabled.mockRejectedValueOnce(new McpAccessError('unknown MCP server entry: other-plugin', 404))
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcpToggle).handler(fakeReq('POST', SKILL_HUB_API.mcpToggle, { entryId: 'other-plugin', enabled: false }), res as never)
    expect(res.status).toBe(404)
    expect(res.json()).toEqual({ error: 'unknown MCP server entry: other-plugin' })
  })

  it('passes a restart requirement and diagnostics straight through', async () => {
    access.setEnabled.mockResolvedValueOnce({ application: 'restart-required', restartReason: 'no-hmr' })
    const first = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcpToggle).handler(fakeReq('POST', SKILL_HUB_API.mcpToggle, { entryId: 'mcp-codegraph', enabled: false }), first as never)
    expect(first.json()).toMatchObject({ application: 'restart-required', restartReason: 'no-hmr' })

    access.setEnabled.mockResolvedValueOnce({ application: 'failed', error: 'row has no id' })
    const second = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcpToggle).handler(fakeReq('POST', SKILL_HUB_API.mcpToggle, { entryId: 'mcp-bare', enabled: true }), second as never)
    expect(second.json()).toMatchObject({ application: 'failed', error: 'row has no id' })
  })

  it('rejects a missing entryId or a non-boolean enabled', async () => {
    const cases: Array<[unknown, number, string]> = [
      [{ enabled: true }, 400, 'entryId is required'],
      [{ entryId: '   ', enabled: true }, 400, 'entryId is required'],
      [{ entryId: 'mcp-x' }, 400, 'enabled must be a boolean'],
      [{ entryId: 'mcp-x', enabled: 'false' }, 400, 'enabled must be a boolean'],
    ]
    for (const [body, status, error] of cases) {
      const res = new FakeResponse()
      await routeFor(SKILL_HUB_API.mcpToggle).handler(fakeReq('POST', SKILL_HUB_API.mcpToggle, body), res as never)
      expect(res.status).toBe(status)
      expect(res.json()).toEqual({ error })
    }
    expect(access.setEnabled).not.toHaveBeenCalled()
  })

  it('maps an unexpected failure of the access surface to 500', async () => {
    access.setEnabled.mockRejectedValueOnce(new Error('pluginManager service is absent'))
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcpToggle).handler(fakeReq('POST', SKILL_HUB_API.mcpToggle, { entryId: 'mcp-x', enabled: true }), res as never)
    expect(res.status).toBe(500)
    expect(res.json()).toEqual({ error: 'pluginManager service is absent' })
  })

  it('rejects other methods and non-loopback requests', async () => {
    const wrongMethod = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcp).handler(fakeReq('POST', SKILL_HUB_API.mcp), wrongMethod as never)
    expect(wrongMethod.status).toBe(405)

    const remote = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcp).handler(fakeReq('GET', SKILL_HUB_API.mcp, undefined, '10.0.0.5'), remote as never)
    expect(remote.status).toBe(403)
  })

  it('refuses business routes while the master switch is off', async () => {
    deps.config = () => ({ enabled: false } as unknown as HubConfig)
    const res = new FakeResponse()
    await routeFor(SKILL_HUB_API.mcp).handler(fakeReq('GET', SKILL_HUB_API.mcp), res as never)
    expect(res.status).toBe(503)
  })
})

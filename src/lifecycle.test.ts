/**
 * Plugin lifecycle: asynchronous work started from `apply()` must not touch the
 * context after the fiber unloaded. Issue #19 was a cold-start abort
 * (`cannot get required service ... in inactive context`) when the stats
 * wiring settled after a config-driven reload had torn the plugin down.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply } from './index.ts'
import { MCP_CLIENT_MODULE } from './mcp.ts'

/** Minimal context double: records what the plugin registers, exposes a controllable fiber. */
function fakeHost(services: Record<string, unknown> = {}) {
  const routes: Array<{ path: string; handler: (req: unknown, res: unknown) => Promise<void> }> = []
  const injected: Array<(context: unknown) => void> = []
  let effects = 0
  const fiber: { uid: number | null } = { uid: 1 }
  const context = {
    fiber,
    logger: { info: () => {}, warn: () => {} },
    /** Only the services a test supplies: every other optional path degrades. */
    get: (name: string) => services[name],
    skills: {
      registerProvider: () => () => {},
      snapshot: async () => ({ skills: [], complete: true }),
      get: async () => undefined,
    },
    webServer: {
      register: (route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
        routes.push(route)
        return () => {}
      },
    },
    effect: (body: () => unknown) => {
      effects += 1
      const produced = body()
      return () => {
        if (typeof produced === 'function') (produced as () => void)()
      }
    },
    inject: (_names: unknown, run: (child: unknown) => void) => { injected.push(run) },
  }
  return { context, routes, fiber, injected, get effects() { return effects } }
}

/** The session-query seam the stats wiring accepts. */
const queryStub = {
  listSessions: async () => [],
  readSession: async () => ({ events: [] }),
}

let home: string
const originalHome = process.env.DSH_HOME

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-lifecycle-'))
  process.env.DSH_HOME = home
})

afterEach(async () => {
  if (originalHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalHome
  await rm(home, { recursive: true, force: true })
})

describe('plugin lifecycle (issue #19)', () => {
  it('mounts the provider and route family once for an active fiber', () => {
    const host = fakeHost()
    apply(host.context as never, undefined)
    expect(host.effects).toBe(2)
    expect(host.routes.map((route) => route.path)).toContain('/api/skill-hub/catalog')
  })

  it('drops a late stats continuation instead of syncing on an inactive context', async () => {
    const host = fakeHost()
    apply(host.context as never, undefined)
    const beforeUnload = host.effects

    // The session-query service arrives: wireStats() starts an async build that
    // first awaits the persisted scan checkpoint. The nested persistence probe
    // is left unmounted (the child `inject` never calls back).
    expect(host.injected).toHaveLength(1)
    host.injected[0]!({ sessionQuery: queryStub, inject: () => {} })

    // A config rewrite (or disable) unloads the fiber while that await is in
    // flight — the exact window issue #19 aborted on.
    host.fiber.uid = null
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Without the guard the continuation called sync(), which re-registered the
    // provider/routes on the dead context (and threw on a real host).
    expect(host.effects).toBe(beforeUnload)
  })
})

/** Minimal response double for one registered route call. */
class FakeResponse {
  status = 0
  body = ''
  writeHead(status: number): void { this.status = status }
  end(chunk?: string): void { this.body = chunk ?? '' }
}

/** Minimal request double (GET, loopback). */
function fakeRequest(): unknown {
  return {
    method: 'GET',
    url: '/api/skill-hub/mcp',
    headers: { host: '127.0.0.1:60510' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {},
  }
}

describe('MCP wiring (apply → route → dsh services)', () => {
  it('serves the projection from the loader/pluginManager/tools services it was given', async () => {
    const host = fakeHost({
      pluginManager: {
        listPlugins: async () => [
          { entryId: 'mcp-codegraph', moduleName: MCP_CLIENT_MODULE, enabled: true, fiberPhase: 'active', patchId: 'mcp-codegraph' },
          { entryId: 'other', moduleName: 'dsh-other', enabled: true, fiberPhase: 'active' },
        ],
        setPluginEnabled: async () => ({ application: 'applied' }),
      },
      loader: {
        *entries() {
          yield { id: 'mcp-codegraph', fiber: { state: 2 }, options: { name: MCP_CLIENT_MODULE, config: { transport: 'stdio', serverName: 'codegraph', command: 'codegraph' } } }
        },
      },
      tools: { schemas: () => [{ name: 'mcp__codegraph__explore', description: 'explore', parameters: { type: 'object', properties: { q: {} } } }] },
      profileContext: { patchPath: '/tmp/cordis.patch.yml' },
    })
    apply(host.context as never, undefined)
    const route = host.routes.find((entry) => entry.path === '/api/skill-hub/mcp')
    expect(route).toBeDefined()
    const res = new FakeResponse()
    await route!.handler(fakeRequest(), res)
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body) as { servers: Array<{ serverName: string; tools: Array<{ name: string }> }>; canManage: boolean; configPath: string }
    expect(body.canManage).toBe(true)
    expect(body.configPath).toBe('/tmp/cordis.patch.yml')
    expect(body.servers.map((server) => server.serverName)).toEqual(['codegraph'])
    expect(body.servers[0]?.tools.map((tool) => tool.name)).toEqual(['mcp__codegraph__explore'])
  })
})

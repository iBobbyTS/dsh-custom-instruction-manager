/**
 * AGENTS.md 索引的落盘缓存：写在哪、长什么样、重新加载时什么情况下认它。
 *
 * 这一层只是缓存：读不到 / 格式坏 / 键不符都必须安静地退回「没有缓存」，
 * 所以每个失败分支都要有用例。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agentsIndexPath, cachedAgentsRoster, hydrateAgentsRoster, resetAgentsRosterCache, saveAgentsRoster } from './agents-index.ts'
import type { InstructionRoster } from './protocol.ts'
import type { SkillHubRouteDeps } from './routes.ts'

describe('AGENTS.md index cache on disk', () => {
  let dir: string
  let home: string
  let deps: SkillHubRouteDeps
  const roster: InstructionRoster = {
    excludeDirs: ['.agent-work'],
    groups: [
      { kind: 'user', files: [{ name: 'AGENTS.md', path: '~/.dsh', absolute: '/home/me/.dsh/AGENTS.md' }] },
      { kind: 'project', title: 'proj', files: [{ name: 'AGENTS.md', path: 'proj', absolute: '/home/me/proj/AGENTS.md' }] },
    ],
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-agents-index-'))
    home = join(dir, 'dsh-home')
    deps = { home, agentsHome: join(dir, 'agents-home'), config: () => ({ excludeDirs: ['.agent-work'] }) } as unknown as SkillHubRouteDeps
    resetAgentsRosterCache()
  })

  afterEach(async () => {
    resetAgentsRosterCache()
    await rm(dir, { recursive: true, force: true })
  })

  it('writes under the plugin data directory and reads the same roster back after a restart', async () => {
    await saveAgentsRoster(deps, roster, 1_700_000_000_000)

    expect(agentsIndexPath(home)).toBe(join(home, 'plugin', 'data', 'custom-instruction-manager', 'agents-index.json'))
    const file = JSON.parse(await readFile(agentsIndexPath(home), 'utf8')) as { version: number; scannedAt: number; key: { home: string }; groups: unknown[] }
    expect(file.version).toBe(1)
    expect(file.scannedAt).toBe(1_700_000_000_000)
    expect(file.key.home).toBe(home)
    expect(file.groups).toHaveLength(2)

    // 模拟宿主重启：内存清空，加载时从磁盘读回。
    resetAgentsRosterCache()
    expect(cachedAgentsRoster(deps)).toBeUndefined()
    await hydrateAgentsRoster(deps)
    const restored = cachedAgentsRoster(deps)
    expect(restored?.at).toBe(1_700_000_000_000)
    expect(restored?.roster).toEqual(roster)
  })

  it('keeps the in-memory result when hydration runs again (a rescan is newer than the file)', async () => {
    await saveAgentsRoster(deps, roster, 10)
    const newer: InstructionRoster = { excludeDirs: roster.excludeDirs, groups: [{ kind: 'user', files: [] }] }
    await saveAgentsRoster(deps, newer, 20)
    await hydrateAgentsRoster(deps)
    expect(cachedAgentsRoster(deps)?.at).toBe(20)
    expect(cachedAgentsRoster(deps)?.roster.groups).toHaveLength(1)
  })

  it('ignores a cache written for a different exclude list', async () => {
    await saveAgentsRoster(deps, roster, 10)
    resetAgentsRosterCache()

    const changed = { ...deps, config: () => ({ excludeDirs: ['.agent-work', 'reference'] }) } as unknown as SkillHubRouteDeps
    await hydrateAgentsRoster(changed)
    expect(cachedAgentsRoster(changed)).toBeUndefined()
  })

  it('ignores a cache written for a different agents root', async () => {
    await saveAgentsRoster(deps, roster, 10)
    resetAgentsRosterCache()

    const moved = { ...deps, agentsHome: join(dir, 'other-agents') } as unknown as SkillHubRouteDeps
    await hydrateAgentsRoster(moved)
    expect(cachedAgentsRoster(moved)).toBeUndefined()
  })

  it('ignores a corrupt file, an unknown version and a malformed group without failing', async () => {
    const path = agentsIndexPath(home)
    await mkdir(join(home, 'plugin', 'data', 'custom-instruction-manager'), { recursive: true })

    const cases: string[] = [
      '{not json',
      JSON.stringify({ version: 99, scannedAt: 1, key: null, groups: [] }),
      JSON.stringify({ version: 1, scannedAt: 1, key: { home, agentsHome: deps.agentsHome, excludeDirs: ['.agent-work'] }, groups: [{ kind: 'nope', files: [] }] }),
      JSON.stringify({ version: 1, scannedAt: 'yesterday', key: {}, groups: [] }),
    ]
    for (const text of cases) {
      await writeFile(path, text, 'utf8')
      await hydrateAgentsRoster(deps)
      expect(cachedAgentsRoster(deps)).toBeUndefined()
    }
  })

  it('does nothing when there is no cache file yet', async () => {
    await hydrateAgentsRoster(deps)
    expect(cachedAgentsRoster(deps)).toBeUndefined()
  })
})

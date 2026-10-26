import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SkillHubStore, statePath } from './store.ts'

describe('SkillHubStore', () => {
  let dir: string
  let file: string
  let store: SkillHubStore

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-store-'))
    file = statePath(dir)
    // 记录文件现在在插件数据目录下（statePath 是嵌套路径），直接 writeFile 前先建目录。
    await mkdir(dirname(file), { recursive: true })
    store = new SkillHubStore(file)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('starts empty when no state file exists', async () => {
    expect(await store.listDisabled()).toEqual([])
    expect(await store.listTrash()).toEqual([])
    expect(await store.listSources()).toEqual([])
  })

  it('persists disabled entries and reloads them', async () => {
    await store.addDisabled({ name: 'demo-skill', description: 'demo', path: '/tmp/demo/SKILL.md.disabled', root: 'user-dsh', disabledAt: 1234 })
    const reloaded = new SkillHubStore(file)
    const entries = await reloaded.listDisabled()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ name: 'demo-skill', path: '/tmp/demo/SKILL.md.disabled', root: 'user-dsh', disabledAt: 1234 })
  })

  it('removes entries on removeDisabled', async () => {
    await store.addDisabled({ name: 'a', description: '', path: '/tmp/a.md.disabled', root: 'user-dsh', disabledAt: 1 })
    await store.removeDisabled('a')
    expect(await store.listDisabled()).toEqual([])
    expect(await new SkillHubStore(file).listDisabled()).toEqual([])
  })

  it('survives a corrupt state file', async () => {
    await writeFile(file, 'not json at all', 'utf8')
    expect(await store.listDisabled()).toEqual([])
    await store.addDisabled({ name: 'x', description: '', path: '/tmp/x.md.disabled', root: 'user-agents', disabledAt: 2 })
    const raw = JSON.parse(await readFile(file, 'utf8')) as { disabled: unknown[] }
    expect(raw.disabled).toHaveLength(1)
  })

  // ------------------------------------------------------- 来源记录
  it('upserts source skills, merges manifests, and persists them', async () => {
    await store.addSourceSkill('anthropics/skills', 'skills', 'sha-1', undefined, 'docx')
    await store.addSourceSkill('anthropics/skills', 'skills', 'sha-1', undefined, 'pdf')
    await store.mergeSourceManifest('anthropics/skills', { 'skills/docx/SKILL.md': 120 })
    const sources = await store.listSources()
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ repo: 'anthropics/skills', root: 'skills', commitSha: 'sha-1', skills: ['docx', 'pdf'] })
    expect(sources[0].manifest).toEqual({ 'skills/docx/SKILL.md': 120 })
    // 持久化后完整读回
    const reloaded = new SkillHubStore(file)
    const again = await reloaded.listSources()
    expect(again).toHaveLength(1)
    expect(again[0].skills).toEqual(['docx', 'pdf'])
    expect(again[0].manifest).toEqual({ 'skills/docx/SKILL.md': 120 })
  })

  // issue #15 follow-up: one repo owns one source row, hence one pinned ref, so
  // a later import must re-pin it. Keeping the first import's ref/sha made
  // `check` compare a stale sha and `sync` re-download the old ref over
  // tag-pinned content — the same "pinning a tag means nothing" failure.
  it('re-pins the source to the ref and sha of the latest import', async () => {
    await store.addSourceSkill('a/b', 'skills', 'sha-main', 'main', 'one')
    expect(await store.getSource('a/b')).toMatchObject({ ref: 'main', commitSha: 'sha-main' })

    await store.addSourceSkill('a/b', 'skills', 'sha-tag', 'v1.2.0', 'two')
    expect(await store.getSource('a/b')).toMatchObject({ ref: 'v1.2.0', commitSha: 'sha-tag', skills: ['one', 'two'] })

    // An import from the default branch clears the pin instead of keeping it.
    await store.addSourceSkill('a/b', 'skills', 'sha-default', undefined, 'three')
    const unpinned = await store.getSource('a/b')
    expect(unpinned?.ref).toBeUndefined()
    expect(unpinned?.commitSha).toBe('sha-default')
    expect(unpinned?.skills).toEqual(['one', 'three', 'two'])

    // The cleared pin survives the sidecar round trip.
    const reloaded = new SkillHubStore(file)
    const persisted = await reloaded.getSource('a/b')
    expect(persisted?.ref).toBeUndefined()
    expect(persisted?.commitSha).toBe('sha-default')
  })

  it('drops only the given skill directory from the baseline', async () => {
    await store.addSourceSkill('a/b', 'skills', 'sha-1', undefined, 'docx')
    await store.addSourceSkill('a/b', 'skills', 'sha-1', undefined, 'pdf')
    await store.mergeSourceManifest('a/b', { 'skills/docx/SKILL.md': 1, 'skills/docx/gone.md': 2, 'skills/pdf/SKILL.md': 3 })
    // Re-merging docx must drop its stale baseline without touching pdf.
    await store.mergeSourceManifest('a/b', { 'skills/docx/SKILL.md': 1 }, 'skills/docx')
    const sources = await store.listSources()
    expect(sources[0].manifest).toEqual({ 'skills/pdf/SKILL.md': 3, 'skills/docx/SKILL.md': 1 })
  })

  it('replaces the whole baseline for a skill at the repo root', async () => {
    await store.addSourceSkill('blader/humanizer', '', 'sha-1', undefined, 'humanizer')
    await store.mergeSourceManifest('blader/humanizer', { 'SKILL.md': 1, 'old.md': 2 }, '')
    await store.mergeSourceManifest('blader/humanizer', { 'SKILL.md': 900, 'README.md': 30 }, '')
    const sources = await store.listSources()
    // The empty prefix covers the whole tree, so the upstream-dropped old.md
    // must not linger — otherwise the diff would report "changed" forever.
    expect(sources[0].manifest).toEqual({ 'SKILL.md': 900, 'README.md': 30 })
  })

  it('derives origins from sources and drops empty sources', async () => {
    await store.addSourceSkill('repo/a', 'skills', '', undefined, 'one')
    await store.addSourceSkill('repo/a', 'skills', '', undefined, 'two')
    expect(await store.listOrigins()).toEqual({ one: 'repo/a', two: 'repo/a' })
    await store.setSourceSkills('repo/a', ['two'])
    expect(await store.listOrigins()).toEqual({ two: 'repo/a' })
    await store.setSourceSkills('repo/a', [])
    expect(await store.listSources()).toEqual([])
    expect(await store.listOrigins()).toEqual({})
  })

  it('removes one skill from every source and drops emptied sources', async () => {
    await store.addSourceSkill('repo/a', 'skills', '', undefined, 'one')
    await store.addSourceSkill('repo/a', 'skills', '', undefined, 'two')
    await store.addSourceSkill('repo/b', 'skills', '', undefined, 'one')
    await store.removeSkillFromSources('one')
    expect((await store.getSource('repo/a'))?.skills).toEqual(['two'])
    expect(await store.getSource('repo/b')).toBeUndefined()
    expect(await store.listOrigins()).toEqual({ two: 'repo/a' })
    const reloaded = new SkillHubStore(file)
    expect((await reloaded.listSources()).map((source) => source.repo)).toEqual(['repo/a'])
  })

  it('updates the commit snapshot', async () => {
    await store.addSourceSkill('repo/a', 'skills', 'old', undefined, 'one')
    await store.setSourceCommit('repo/a', 'new')
    expect((await store.getSource('repo/a'))?.commitSha).toBe('new')
  })

  // ------------------------------------------------------ 市场源
  it('adds, deduplicates, removes, and persists market sources', async () => {
    await store.addMarketSource('anthropics/skills')
    await store.addMarketSource('anthropics/skills')
    await store.addMarketSource('other/repo', 'v1.0.0')
    expect(await store.listMarketSources()).toEqual([
      { repo: 'anthropics/skills' },
      { repo: 'other/repo', ref: 'v1.0.0' },
    ])
    await store.removeMarketSource('anthropics/skills')
    expect(await store.listMarketSources()).toEqual([{ repo: 'other/repo', ref: 'v1.0.0' }])
    const reloaded = new SkillHubStore(file)
    expect(await reloaded.listMarketSources()).toEqual([{ repo: 'other/repo', ref: 'v1.0.0' }])
  })

  it('pins, re-pins, and records market source commits', async () => {
    await store.addMarketSource('a/b')
    await store.setMarketSourceRef('a/b', 'main')
    expect(await store.getMarketSource('a/b')).toEqual({ repo: 'a/b', ref: 'main' })
    await store.setMarketSourceCommit('a/b', 'sha1')
    expect(await store.getMarketSource('a/b')).toEqual({ repo: 'a/b', ref: 'main', commitSha: 'sha1' })
    await store.setMarketSourceRef('a/b', 'v2.0.0')
    // 改 ref 会清掉旧的 commit 基线。
    expect(await store.getMarketSource('a/b')).toEqual({ repo: 'a/b', ref: 'v2.0.0' })
  })

  // ------------------------------------------------------- 回收站
  it('records, lists, and clears trash entries', async () => {
    await store.addTrash({ name: 'gone-skill', path: '/tmp/.trash/gone-skill-123', movedAt: 42, sourcePath: '/tmp/skills/gone-skill' })
    await store.addTrash({ name: 'older', path: '/tmp/.trash/older-1', movedAt: 10 })
    const trash = await store.listTrash()
    expect(trash.map((entry) => entry.name)).toEqual(['gone-skill', 'older']) // newest first
    await store.removeTrash('/tmp/.trash/gone-skill-123')
    const reloaded = new SkillHubStore(file)
    expect(await reloaded.listTrash()).toHaveLength(1)
    expect(await reloaded.getTrash('older')).toMatchObject({ name: 'older' })
  })

  it('keeps several trash entries sharing one skill name (no silent overwrite)', async () => {
    // 同一个名字先后入站两次（重复删除，或磁盘上两种发现形态各进一次）：
    // 按名字索引会让后一条覆盖前一条，前一份目录就成了谁都指不到的孤儿。
    await store.addTrash({ name: 'dup', path: '/tmp/.trash/dup-1', movedAt: 1, sourcePath: '/tmp/skills/dup' })
    await store.addTrash({ name: 'dup', path: '/tmp/.trash/dup.md.disabled-2', movedAt: 2, sourcePath: '/tmp/skills/dup.md.disabled' })
    const reloaded = new SkillHubStore(file)
    expect((await reloaded.listTrash()).map((entry) => entry.path).sort()).toEqual([
      '/tmp/.trash/dup-1',
      '/tmp/.trash/dup.md.disabled-2',
    ])
    // getTrash 按名字取最新的一条（恢复入口用）。
    expect(await reloaded.getTrash('dup')).toMatchObject({ path: '/tmp/.trash/dup.md.disabled-2' })
    await reloaded.removeTrash('/tmp/.trash/dup.md.disabled-2')
    expect(await reloaded.getTrash('dup')).toMatchObject({ path: '/tmp/.trash/dup-1' })
  })

  it('persists the trash source path', async () => {
    await store.addTrash({ name: 'flat-gone', path: '/tmp/.trash/flat-gone.md-1', movedAt: 7, sourcePath: '/tmp/skills/flat-gone.md' })
    const reloaded = new SkillHubStore(file)
    expect(await reloaded.getTrash('flat-gone')).toMatchObject({ name: 'flat-gone', sourcePath: '/tmp/skills/flat-gone.md' })
  })

  it('persists the trash origin snapshot (restore keeps the source)', async () => {
    await store.addTrash({
      name: 'tracked-gone',
      path: '/tmp/.trash/tracked-gone-1',
      movedAt: 5,
      origin: { repo: 'repo/x', root: 'skills', ref: 'v1.0.0', commitSha: 'abc123' },
    })
    const reloaded = new SkillHubStore(file)
    expect(await reloaded.getTrash('tracked-gone')).toMatchObject({
      name: 'tracked-gone',
      origin: { repo: 'repo/x', root: 'skills', ref: 'v1.0.0', commitSha: 'abc123' },
    })
  })

  it('migrates a v4 file to v5 on load, dropping scenes and trash tagIds', async () => {
    await writeFile(file, JSON.stringify({
      version: 4,
      disabled: [{ name: 'kept', description: 'x', path: '/tmp/kept/SKILL.md.disabled', root: 'user-dsh', disabledAt: 1 }],
      tags: [
        { id: 't1', name: '通用', skillNames: ['kept'], default: true },
        { id: 't2', name: 'web', skillNames: ['kept'] },
      ],
      trash: [{ name: 'gone', path: '/tmp/trash/gone-1', movedAt: 3, tagIds: ['t1', 't2'], origin: { repo: 'repo/x', root: 'skills', commitSha: 'sha' } }],
    }), 'utf8')
    // 装载即迁移：读取任一状态都会把旧文件按 v5 重写到磁盘。
    expect(await store.listDisabled()).toHaveLength(1)
    const raw = JSON.parse(await readFile(file, 'utf8')) as { version: number; tags?: unknown; trash?: Array<Record<string, unknown>> }
    expect(raw.version).toBe(5)
    expect(raw.tags).toBeUndefined()
    expect(raw.trash?.[0]).not.toHaveProperty('tagIds')
    // 丢弃的只有场景数据：禁用记录与回收站来源快照都保留。
    expect(await store.listDisabled()).toMatchObject([{ name: 'kept' }])
    expect((await store.getTrash('gone'))?.origin).toMatchObject({ repo: 'repo/x', commitSha: 'sha' })
  })

  // ------------------------------------------------------- 显示配置
  it('persists display toggles in config', async () => {
    await store.setConfig({ showUseCount: false, showGroupSummary: false })
    const reloaded = new SkillHubStore(file)
    const cfg = await reloaded.getConfig()
    expect(cfg.showUseCount).toBe(false)
    expect(cfg.showGroupSummary).toBe(false)
    expect(cfg.showUseTime).toBeUndefined()
  })

  // ---------------------------------------------------- schema 迁移
  it('migrates a legacy v1 file: origins become sources, scenes are dropped', async () => {
    await writeFile(file, JSON.stringify({
      version: 1,
      disabled: [{ name: 'a', path: '/tmp/a.md.disabled', root: 'user-dsh', disabledAt: 1 }],
      origins: { docx: 'anthropics/skills', pdf: 'anthropics/skills' },
      scenes: [{ id: 's1', name: '场景', skillNames: ['docx'] }],
    }), 'utf8')
    expect(await store.listDisabled()).toHaveLength(1)
    const sources = await store.listSources()
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ repo: 'anthropics/skills', commitSha: '', skills: ['docx', 'pdf'] })
    expect(await store.listOrigins()).toEqual({ docx: 'anthropics/skills', pdf: 'anthropics/skills' })
    // scenes 被丢弃：迁移后首次写入持久化时不再保留
    await store.addMarketSource('new/repo')
    const raw = JSON.parse(await readFile(file, 'utf8')) as { scenes?: unknown[]; marketSources?: unknown[] }
    expect(raw.scenes).toBeUndefined()
    expect(raw.marketSources).toEqual([{ repo: 'new/repo' }])
  })

  it('rejects a newer schema by starting empty', async () => {
    await writeFile(file, JSON.stringify({ version: 99, disabled: [{ name: 'a', path: '/tmp/a.md.disabled', root: 'user-dsh', disabledAt: 1 }] }), 'utf8')
    const fresh = new SkillHubStore(file)
    expect(await fresh.listDisabled()).toEqual([])
  })

  it('keeps an empty root through a reload (repo-root skill), still coercing a corrupt one', async () => {
    // 空 root 是「技能在仓库根」的合法取值：装载时把它改写成 skills 会让来源
    // 对不上任何 blob，下一次「检查更新」就会把技能当成被上游删除 → 进回收站。
    await writeFile(file, JSON.stringify({
      version: 4,
      sources: [
        { repo: 'blader/humanizer', root: '', commitSha: 'sha-1', skills: ['humanizer'], manifest: { 'SKILL.md': 900 } },
        { repo: 'a/b', root: '.hidden', commitSha: 'sha-2', skills: ['x'] },
      ],
    }), 'utf8')
    const sources = await store.listSources()
    expect(sources.find((s) => s.repo === 'blader/humanizer')?.root).toBe('')
    // 损坏的 root 仍然回落到默认根。
    expect(sources.find((s) => s.repo === 'a/b')?.root).toBe('skills')
    // 写盘-再读一次仍然保持空 root。
    await store.addMarketSource('new/repo')
    const reloaded = new SkillHubStore(file)
    expect((await reloaded.listSources()).find((s) => s.repo === 'blader/humanizer')?.root).toBe('')
  })

  it('keeps the origin of a trashed repo-root skill', async () => {
    await writeFile(file, JSON.stringify({
      version: 4,
      trash: [{ name: 'humanizer', path: '/tmp/trash/humanizer', movedAt: 1, origin: { repo: 'blader/humanizer', root: '', commitSha: 'sha-1' } }],
    }), 'utf8')
    const entry = (await store.listTrash()).find((e) => e.name === 'humanizer')
    // 空 root 曾被 sanitizer 丢掉整个 origin → 恢复后技能会变成「个人技能」。
    expect(entry?.origin).toMatchObject({ repo: 'blader/humanizer', root: '' })
  })

  it('migrates a v3 file (no skillStats) and persists a checkpoint round-trip at the current version', async () => {
    // v3 旧文件：无 skillStats 字段 → 装载后检查点为空，写盘时版本升到当前。
    await writeFile(file, JSON.stringify({
      version: 3,
      disabled: [],
    }), 'utf8')
    expect(await store.getSkillStatsState()).toBeUndefined()
    const checkpoint = {
      windowDays: 0,
      frozenBefore: 1000,
      frozenSessions: { 'session-a': { createdAt: 900, counts: { tdd: { count: 7, lastUsed: 900 }, 'code-review': { count: 2, lastUsed: 800 } } } },
      lastFullReconcile: 1234,
    }
    await store.saveSkillStatsState(checkpoint)
    // 新实例读回一致（含深拷贝的 frozenTotals）。
    const reloaded = new SkillHubStore(file)
    expect(await reloaded.getSkillStatsState()).toEqual(checkpoint)
    const raw = JSON.parse(await readFile(file, 'utf8')) as { version: number; skillStats?: unknown }
    expect(raw.version).toBe(5)
    expect(raw.skillStats).toEqual(checkpoint)
  })

  it('drops a corrupt skillStats bucket instead of trusting bad counts', async () => {
    await writeFile(file, JSON.stringify({
      version: 4,
      disabled: [],
      skillStats: { windowDays: 'x', frozenBefore: true, lastFullReconcile: false, frozenSessions: { bad: { createdAt: 'y', counts: [] } } },
    }), 'utf8')
    expect(await store.getSkillStatsState()).toBeUndefined()
  })

  it('persists coldRevisions round-trip and drops corrupt revision entries', async () => {
    await writeFile(file, JSON.stringify({
      version: 4,
      disabled: [],
      skillStats: {
        windowDays: 14,
        frozenBefore: 1000,
        frozenSessions: {},
        lastFullReconcile: 1234,
        coldRevisions: {
          good: { rev: 'r1', createdAt: 900, counts: { tdd: { count: 3, lastUsed: 900 } } },
          'bad-rev': { rev: 42, createdAt: 900, counts: {} },
          'bad-counts': { rev: 'r1', createdAt: 900, counts: { tdd: { count: 'many', lastUsed: 1 } } },
        },
      },
    }), 'utf8')
    // 好条目保留并写盘回读一致；坏条目被清洗（重读一次即可恢复）。
    expect(await store.getSkillStatsState()).toEqual({
      windowDays: 14,
      frozenBefore: 1000,
      frozenSessions: {},
      lastFullReconcile: 1234,
      coldRevisions: {
        good: { rev: 'r1', createdAt: 900, counts: { tdd: { count: 3, lastUsed: 900 } } },
        'bad-counts': { rev: 'r1', createdAt: 900, counts: {} },
      },
    })
  })

  it('persists a marketStats snapshot round-trip and drops corrupt buckets', async () => {
    expect(await store.getMarketStatsState()).toBeUndefined()
    const snapshot = { fetchedAt: 9999, stats: { 'a/b': { stars: 1500, downloads: 50 } } }
    await store.saveMarketStatsState(snapshot)
    const reloaded = new SkillHubStore(file)
    expect(await reloaded.getMarketStatsState()).toEqual(snapshot)
    const raw = JSON.parse(await readFile(file, 'utf8')) as { marketStats?: unknown }
    expect(raw.marketStats).toEqual(snapshot)
    // 坏桶只丢 marketStats，不影响其它字段。
    await writeFile(file, JSON.stringify({
      version: 4,
      disabled: [],
      marketStats: { fetchedAt: 'x', stats: { 'a/b': { stars: 'many', downloads: null } } },
    }), 'utf8')
    const fresh = new SkillHubStore(file)
    expect(await fresh.getMarketStatsState()).toBeUndefined()
  })

})

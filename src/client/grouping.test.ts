import { describe, expect, it } from 'vitest'
import type { CatalogSkill, CollectionGroup } from '../protocol.ts'
import { filterBySource, formatRelativeTime, managedByOf, personalManagedBuckets, PRIVATE_SOURCE, skillRowKey, sortSkills, visibleCollections, workspaceRank } from './grouping.ts'

function skill(name: string, writable = true): CatalogSkill {
  return {
    name,
    description: '',
    invocation: { modelInvocable: true, userInvocable: true },
    provider: 'filesystem',
    source: 'user-dsh',
    writable,
  }
}

describe('filterBySource', () => {
  it('filters by origin repo, buckets untracked skills as private, and returns all for "all"', () => {
    const origins = { a: 'repo/x', b: 'repo/y' }
    const skills = [skill('a'), skill('b'), skill('c')]
    expect(filterBySource(skills, 'repo/x', origins).map((s) => s.name)).toEqual(['a'])
    expect(filterBySource(skills, PRIVATE_SOURCE, origins).map((s) => s.name)).toEqual(['c'])
    expect(filterBySource(skills, 'all', origins)).toHaveLength(3)
  })

  it('never buckets project skills as private (they belong to the project tree)', () => {
    const origins = {}
    const proj = skill('proj')
    proj.source = 'project-dsh'
    const projAgents = skill('proj-agents')
    projAgents.source = 'project-agents'
    const skills = [skill('personal'), proj, projAgents]
    expect(filterBySource(skills, PRIVATE_SOURCE, origins).map((s) => s.name)).toEqual(['personal'])
    expect(filterBySource(skills, 'all', origins)).toHaveLength(3)
  })
})

describe('visibleCollections', () => {
  const collections: CollectionGroup[] = [
    { name: 'repo/x', skillNames: ['one', 'two'] },
    { name: 'repo/ghost', skillNames: ['gone'] },
  ]

  it('keeps collections with visible members and drops empty shells', () => {
    const visible = visibleCollections(collections, [skill('one')])
    expect(visible.map((entry) => entry.collection.name)).toEqual(['repo/x'])
    expect(visible[0].skills.map((s) => s.name)).toEqual(['one'])
  })

  it('returns nothing when no collection has a visible member', () => {
    expect(visibleCollections(collections, [])).toEqual([])
  })
})

describe('managedByOf', () => {
  const user = (source = 'user-dsh'): CatalogSkill => ({ ...skill('a'), provider: 'skill-hub', source })
  const bundled = (): CatalogSkill => ({ ...skill('office', false), provider: 'dsh-office', source: 'bundled' })

  it('prefers an upstream repo over the provider id', () => {
    expect(managedByOf(user(), 'anthropics/skills')).toEqual({ kind: 'repo', repo: 'anthropics/skills' })
  })

  it('maps user roots to User Managed', () => {
    expect(managedByOf(user('user-dsh'))).toEqual({ kind: 'user' })
    expect(managedByOf(user('user-agents'))).toEqual({ kind: 'user' })
  })

  it('maps project roots to Project Managed', () => {
    expect(managedByOf({ ...user(), source: 'project-dsh' })).toEqual({ kind: 'project' })
  })

  it('keeps the provider id for bundled and third-party skills', () => {
    expect(managedByOf(bundled())).toEqual({ kind: 'provider', provider: 'dsh-office' })
  })
})

describe('personalManagedBuckets', () => {
  const office = (name: string): CatalogSkill => ({ ...skill(name, false), provider: 'dsh-office', source: 'bundled' })
  const user = (name: string, source = 'user-dsh'): CatalogSkill => ({ ...skill(name), provider: 'skill-hub', source })

  it('groups personal skills by 管理方 in first-appearance order', () => {
    const buckets = personalManagedBuckets([office('office'), user('mine'), office('office-docx'), user('other')])
    expect(buckets.map((b) => b.key)).toEqual(['managed:provider:dsh-office', 'managed:user'])
    expect(buckets[0].managed).toEqual({ kind: 'provider', provider: 'dsh-office' })
    expect(buckets[0].skills.map((s) => s.name)).toEqual(['office', 'office-docx'])
    expect(buckets[1].managed).toEqual({ kind: 'user' })
    expect(buckets[1].skills.map((s) => s.name)).toEqual(['mine', 'other'])
  })

  it('returns a single bucket when every skill shares one 管理方', () => {
    expect(personalManagedBuckets([user('a'), user('b')]).length).toBe(1)
    expect(personalManagedBuckets([]).length).toBe(0)
  })

  it('keeps user roots together under User Managed', () => {
    const buckets = personalManagedBuckets([user('a', 'user-dsh'), user('b', 'user-agents')])
    expect(buckets.length).toBe(1)
    expect(buckets[0].managed).toEqual({ kind: 'user' })
    expect(buckets[0].skills.map((s) => s.name)).toEqual(['a', 'b'])
  })
})

describe('sortSkills', () => {
  it('sorts by name ascending', () => {
    const skills = [skill('zeta'), skill('alpha'), skill('beta')]
    expect(sortSkills(skills, 'name').map((s) => s.name)).toEqual(['alpha', 'beta', 'zeta'])
  })

  it('sorts by added time descending, unknown times last', () => {
    const skills = [
      { ...skill('old'), addedAt: 100 },
      { ...skill('new'), addedAt: 300 },
      { ...skill('unknown') },
    ]
    expect(sortSkills(skills, 'added').map((s) => s.name)).toEqual(['new', 'old', 'unknown'])
  })

  it('sorts by invocation count descending, unknown counts as zero', () => {
    const skills = [skill('few'), skill('many'), skill('none')]
    const uses: Record<string, number | undefined> = { few: 2, many: 9 }
    expect(sortSkills(skills, 'uses', (name) => uses[name]).map((s) => s.name)).toEqual(['many', 'few', 'none'])
  })

  it('does not mutate the input list', () => {
    const skills = [skill('b'), skill('a')]
    const sorted = sortSkills(skills, 'name')
    expect(sorted.map((s) => s.name)).toEqual(['a', 'b'])
    expect(skills.map((s) => s.name)).toEqual(['b', 'a'])
  })
})

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000
  it('buckets relative times correctly', () => {
    expect(formatRelativeTime(now, now)).toEqual({ key: 'time.justNow' })
    expect(formatRelativeTime(now - 30_000, now)).toEqual({ key: 'time.justNow' })
    expect(formatRelativeTime(now - 5 * 60_000, now)).toEqual({ key: 'time.minutesAgo', value: 5 })
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toEqual({ key: 'time.hoursAgo', value: 3 })
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toEqual({ key: 'time.daysAgo', value: 2 })
    expect(formatRelativeTime(now - 14 * 86_400_000, now)).toEqual({ key: 'time.weeksAgo', value: 2 })
  })

  it('clamps future timestamps to just now', () => {
    expect(formatRelativeTime(now + 5_000, now)).toEqual({ key: 'time.justNow' })
  })
})

describe('row identity keys', () => {
  // 目录里的技能名不唯一：宿主按 name+workspace+source 给项目技能建逻辑键，
  // 同名项目技能可以合法地出现在两行。行 key 若只用名字，React 会把两份当同一
  // 个子节点，切换平铺/分组后旧行留在 DOM 里并且每次切换再叠一份。
  it('distinguishes same-named rows from different workspaces and sources', () => {
    const a = { ...skill('shared'), source: 'project-dsh', workspace: '/ws/a' }
    const b = { ...skill('shared'), source: 'project-dsh', workspace: '/ws/b' }
    const user = { ...skill('shared'), source: 'user-dsh' }
    const keys = new Set([skillRowKey(a), skillRowKey(b), skillRowKey(user)])
    expect(keys.size).toBe(3)
  })

  it('is stable for the same row', () => {
    const row = { ...skill('shared'), source: 'user-dsh' }
    expect(skillRowKey(row)).toBe(skillRowKey({ ...row }))
  })
})

describe('workspaceRank', () => {
  // 项目级分组的顺序来自 dsh 侧面栏（workspace.json 的 global.workspaceIds）。
  it('ranks known paths by the sidebar order and trails unknown ones', () => {
    const order = ['/ws/b', '/ws/a']
    expect(workspaceRank('/ws/b', order)).toBe(0)
    expect(workspaceRank('/ws/a', order)).toBe(1)
    expect(workspaceRank('/ws/unknown', order)).toBe(order.length)
    expect(workspaceRank(undefined, order)).toBe(order.length)
  })

  it('keeps the incoming order when no workspace is known', () => {
    expect(['/x', '/y'].map((path) => workspaceRank(path, [])).every((rank) => rank === 0)).toBe(true)
  })
})

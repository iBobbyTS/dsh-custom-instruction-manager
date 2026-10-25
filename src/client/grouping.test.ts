import { describe, expect, it } from 'vitest'
import type { CatalogSkill, CollectionGroup, DisabledSkill } from '../protocol.ts'
import { conflictsOnClose, disabledRowKey, filterBySource, formatRelativeTime, groupNamesOf, groupSwitchView, managedByOf, personalManagedBuckets, PRIVATE_SOURCE, skillRowKey, sortSkills, visibleCollections, workspaceRank } from './grouping.ts'

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

describe('groupSwitchView', () => {
  it('is on when every member is enabled, off when none, mixed otherwise', () => {
    const enabled = new Set(['a', 'b', 'c'])
    expect(groupSwitchView(['a', 'b', 'c'], enabled).state).toBe('on')
    expect(groupSwitchView(['a'], new Set()).state).toBe('off')
    expect(groupSwitchView(['a', 'b'], new Set(['a'])).state).toBe('mixed')
  })

  it('lists the enabled and disabled sides', () => {
    const view = groupSwitchView(['a', 'b', 'c'], new Set(['a', 'c']))
    expect(view.enabled).toEqual(['a', 'c'])
    expect(view.disabled).toEqual(['b'])
  })
})

describe('conflictsOnClose', () => {
  it('flags enabled members that live in another group', () => {
    const members = ['a', 'b', 'c']
    const enabled = new Set(['a', 'b'])
    const others = [{ members: ['c', 'a'] }, { members: ['x'] }]
    expect(conflictsOnClose(members, enabled, others)).toEqual(['a'])
  })

  it('ignores disabled members and groups without the member', () => {
    const members = ['a', 'b']
    const enabled = new Set(['b'])
    const others = [{ members: ['a'] }]
    expect(conflictsOnClose(members, enabled, others)).toEqual([])
  })
})

describe('groupNamesOf', () => {
  it('collects collection names for a skill', () => {
    const collections = [{ name: 'repo/x', skillNames: ['a', 'b'] }, { name: 'repo/y', skillNames: ['b'] }]
    expect(groupNamesOf('a', collections)).toEqual(['repo/x'])
    expect(groupNamesOf('b', collections)).toEqual(['repo/x', 'repo/y'])
    expect(groupNamesOf('c', [])).toEqual([])
  })
})

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
    { name: 'repo/x', skillNames: ['enabled-one', 'disabled-one'] },
    { name: 'repo/ghost', skillNames: ['gone'] },
  ]
  const disabledOne: DisabledSkill = { name: 'disabled-one', description: 'Paused skill', path: '/x/disabled-one/SKILL.md.disabled', root: 'user-dsh', disabledAt: 1 }
  const origins = { 'enabled-one': 'repo/x', 'disabled-one': 'repo/x' }

  it('keeps collections with visible members and drops empty shells', () => {
    const visible = visibleCollections(collections, [skill('enabled-one')], [disabledOne], '', 'all', origins)
    expect(visible.map((entry) => entry.collection.name)).toEqual(['repo/x'])
    expect(visible[0].skills.map((s) => s.name)).toEqual(['enabled-one'])
    expect(visible[0].disabledMembers.map((d) => d.name)).toEqual(['disabled-one'])
  })

  it('drops a collection when neither side passes the search filter', () => {
    expect(visibleCollections(collections, [], [disabledOne], 'no-match', 'all', origins)).toEqual([])
    expect(visibleCollections(collections, [], [disabledOne], 'paused', 'all', origins).map((e) => e.collection.name)).toEqual(['repo/x'])
  })

  it('applies the source filter to disabled-only collections', () => {
    expect(visibleCollections(collections, [], [disabledOne], '', 'repo/other', origins)).toEqual([])
    expect(visibleCollections(collections, [], [disabledOne], '', 'private', origins)).toEqual([])
    expect(visibleCollections(collections, [], [disabledOne], '', 'repo/x', origins).map((e) => e.collection.name)).toEqual(['repo/x'])
  })

  it('treats a disabled record with no origin as private', () => {
    const privateRecord = { ...disabledOne, name: 'private-one' }
    const privateCollection: CollectionGroup = { name: 'repo/y', skillNames: ['private-one'] }
    expect(visibleCollections([privateCollection], [], [privateRecord], '', PRIVATE_SOURCE, {}).map((e) => e.collection.name)).toEqual(['repo/y'])
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
  const disabledRecord = (name: string, root: DisabledSkill['root'] = 'user-dsh'): DisabledSkill =>
    ({ name, description: '', path: '/tmp/' + name + '.disabled', root, disabledAt: 1 })

  it('groups personal skills by 管理方 in first-appearance order', () => {
    const buckets = personalManagedBuckets([office('office'), user('mine'), office('office-docx'), user('other')], [])
    expect(buckets.map((b) => b.key)).toEqual(['managed:provider:dsh-office', 'managed:user'])
    expect(buckets[0].managed).toEqual({ kind: 'provider', provider: 'dsh-office' })
    expect(buckets[0].skills.map((s) => s.name)).toEqual(['office', 'office-docx'])
    expect(buckets[1].managed).toEqual({ kind: 'user' })
    expect(buckets[1].skills.map((s) => s.name)).toEqual(['mine', 'other'])
  })

  it('returns a single bucket when every skill shares one 管理方', () => {
    expect(personalManagedBuckets([user('a'), user('b')], []).length).toBe(1)
    expect(personalManagedBuckets([], []).length).toBe(0)
  })

  it('keeps user roots together under User Managed', () => {
    const buckets = personalManagedBuckets([user('a', 'user-dsh'), user('b', 'user-agents')], [])
    expect(buckets.length).toBe(1)
    expect(buckets[0].managed).toEqual({ kind: 'user' })
    expect(buckets[0].skills.map((s) => s.name)).toEqual(['a', 'b'])
  })

  it('attaches a disabled record to the User Managed bucket', () => {
    const buckets = personalManagedBuckets([user('a', 'user-dsh'), user('b', 'user-agents')], [disabledRecord('gone', 'user-agents')])
    expect(buckets.length).toBe(1)
    expect(buckets[0].skills.map((s) => s.name)).toEqual(['a', 'b'])
    expect(buckets[0].disabled.map((r) => r.name)).toEqual(['gone'])
  })

  it('still creates User Managed when only disabled user skills remain', () => {
    const buckets = personalManagedBuckets([office('office')], [disabledRecord('gone', 'user-dsh')])
    expect(buckets.map((b) => b.key)).toEqual(['managed:provider:dsh-office', 'managed:user'])
    expect(buckets[1].managed).toEqual({ kind: 'user' })
    expect(buckets[1].skills).toEqual([])
    expect(buckets[1].disabled.map((r) => r.name)).toEqual(['gone'])
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

  it('is stable for the same row and never collides with a disabled row', () => {
    const row = { ...skill('shared'), source: 'user-dsh' }
    expect(skillRowKey(row)).toBe(skillRowKey({ ...row }))
    const record = { name: 'shared', description: '', path: '/x', root: 'user-dsh', disabledAt: 1 } as DisabledSkill
    expect(disabledRowKey(record)).not.toBe(skillRowKey(row))
    expect(disabledRowKey(record)).toBe(disabledRowKey({ ...record }))
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

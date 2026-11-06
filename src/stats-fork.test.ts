import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { asPersistenceSeam, readSkillStats, scanCold, type SessionQueryLike } from './stats.ts'
import type { SkillStatsCheckpoint } from './protocol.ts'
import { scan } from './stats/scan.ts'

const NOW = Date.UTC(2026, 10, 5)
const DAY = 86_400_000
const call = (seq: number, name: string): SessionEvent => ({ seq, time: NOW + seq, type: 'user/message',
  data: { id: `message-${seq}`, source: { kind: 'skill-invocation', name }, content: [{ type: 'text', text: 'private prompt marker' }] },
} as unknown as SessionEvent)
const marker = (seq: number): SessionEvent => ({ seq, time: NOW, type: 'session/end-seed', data: { inherited: true } } as SessionEvent)
const emptyCheckpoint = (): SkillStatsCheckpoint => ({ windowDays: 0, frozenBefore: 0, frozenSessions: {}, lastFullReconcile: 0 })
const inherited = call(0, 'code-review')
const childCall = { seq: 2, time: NOW + 2, type: 'tool/call',
  data: { callId: 'skill-tool-2', name: 'skill', arguments: JSON.stringify({ name: 'tdd' }) },
} as unknown as SessionEvent
const nestedCall = call(4, 'debug')
const logs = () => new Map([
  ['source', { events: [inherited], inheritedEventCount: 0 }],
  ['child', { events: [inherited, marker(1), childCall], inheritedEventCount: 1 }],
  ['nested', { events: [inherited, marker(1), childCall, marker(3), nestedCall], inheritedEventCount: 3 }],
])
const namesAndCounts = (stats: Awaited<ReturnType<typeof readSkillStats>>) => stats.map(({ name, count }) => [name, count])

describe('fork invocation identity', () => {
  it('counts copied calls once across nested forks and preserves surviving copies', async () => {
    const corpus = logs()
    const query: SessionQueryLike = {
      listSessions: async () => [...corpus.keys()].map(id => ({ header: { id: id as never, createdAt: NOW } })),
      readSession: async id => corpus.get(String(id))!,
    }
    const expected = [['code-review', 1], ['debug', 1], ['tdd', 1]]
    expect(namesAndCounts(await readSkillStats(query))).toEqual(expected)
    corpus.delete('source')
    expect(namesAndCounts(await readSkillStats(query))).toEqual(expected)
    corpus.delete('child')
    expect(namesAndCounts(await readSkillStats(query))).toEqual(expected)
    // Coincidentally equal event identities in independent own histories are
    // two invocations, never deduplicated merely because their hashes match.
    corpus.set('independent', { events: [inherited], inheritedEventCount: 0 })
    corpus.set('another', { events: [inherited], inheritedEventCount: 0 })
    expect(namesAndCounts(await readSkillStats(query))).toEqual([['code-review', 2], ['debug', 1], ['tdd', 1]])
  })

  it('deduplicates frozen and recent query logs without retaining deleted source totals', async () => {
    const corpus = logs()
    const reads: string[] = []
    const query: SessionQueryLike = {
      listSessions: async () => [...corpus.keys()].map(id => ({ header: { id: id as never, createdAt: id === 'source' ? NOW - 30 * DAY : NOW } })),
      readSession: async id => { reads.push(String(id)); return corpus.get(String(id))! },
    }
    const checkpoint = emptyCheckpoint()
    expect(namesAndCounts((await scan(query, checkpoint, NOW, 0)).stats)).toEqual([['code-review', 1], ['debug', 1], ['tdd', 1]])
    reads.length = 0
    await scan(query, checkpoint, NOW + 1000, 0)
    expect(reads).toEqual(['child', 'nested'])
    corpus.delete('source')
    expect(namesAndCounts((await scan(query, checkpoint, NOW + 2000, 0)).stats)).toEqual([['code-review', 1], ['debug', 1], ['tdd', 1]])
    expect(checkpoint.frozenSessions.source).toBeUndefined()
    expect(JSON.stringify(checkpoint)).not.toContain('private prompt marker')
  })

  it('uses exact handle metadata on cold reads, reuses identities and merges live copies', async () => {
    const corpus = logs()
    const opens: string[] = []
    const persistence = asPersistenceSeam({
      list: async () => [...corpus.keys()].map(id => ({ header: { id, createdAt: NOW }, revision: 'r1' })),
      open: async (id: string) => {
        opens.push(id)
        const log = corpus.get(id)!
        return { inheritedEventCount: log.inheritedEventCount, read: async () => ({ events: log.events }), close() {} }
      },
    })!
    const checkpoint = emptyCheckpoint()
    const expected = [['code-review', 1], ['debug', 1], ['tdd', 1]]
    expect(namesAndCounts(await scanCold(persistence, checkpoint, NOW, 0))).toEqual(expected)
    expect(opens).toEqual(['source', 'child', 'nested'])
    opens.length = 0
    // Serialization is the same boundary the persisted sidecar uses.
    const restored = JSON.parse(JSON.stringify(checkpoint)) as SkillStatsCheckpoint
    expect(namesAndCounts(await scanCold(persistence, restored, NOW, 0))).toEqual(expected)
    expect(opens).toEqual([])
    corpus.delete('source')
    const live = corpus.get('child')!
    expect(namesAndCounts(await scanCold(persistence, restored, NOW, 0, new Set(['child']), async () => live))).toEqual(expected)
    expect(restored.coldRevisions?.source).toBeUndefined()
    expect(opens).toEqual([])
    expect(JSON.stringify(restored)).not.toContain('private prompt marker')
  })
})

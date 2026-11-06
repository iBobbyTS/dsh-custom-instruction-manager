import { createHash } from 'node:crypto'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls the 'skill-invocation' MessageSourceMap augmentation.
import type {} from '@deepseek-ai/dsh-skill'
import { mapConcurrent } from '../concurrency.ts'
import type { SkillStat, SkillStatsCheckpoint } from '../protocol.ts'
import type { SkillInvocation } from '../protocol/stats.ts'
import type { SessionPersistenceLike, SessionQueryLike, SkillStatsLog } from './persistence.ts'

/** Fallback freeze horizon when no rolling window is configured (14 days). */
export const STATS_FREEZE_AFTER_MS = 14 * 24 * 60 * 60 * 1000
/** Cadence of the full reconciliation that rebuilds the checkpoint (24 h). */
export const STATS_FULL_RECONCILE_MS = 24 * 60 * 60 * 1000
/** Adaptive TTL factor: effective TTL ≥ this multiple of the last scan duration. */
export const STATS_TTL_SCAN_FACTOR = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** Per-skill invocation stats in one session's event log. */
export interface InvocationStat {
  count: number
  /** Unix epoch ms of the most recent invocation in this batch. */
  lastUsed: number
}

/** Extract only invocation identity, skill name and time; never cache message bodies. */
export function skillInvocations(log: SkillStatsLog): SkillInvocation[] {
  const invocations: SkillInvocation[] = []
  for (const event of log.events) {
    let name: string | undefined
    let identity: unknown
    if (event.type === 'user/message' && event.data.source.kind === 'skill-invocation') {
      name = event.data.source.name
      identity = event.data.id
    } else if (event.type === 'tool/call' && event.data.name === 'skill') {
      try {
        const parsed: unknown = JSON.parse(event.data.arguments)
        if (parsed !== null && typeof parsed === 'object' && typeof (parsed as { name?: unknown }).name === 'string') {
          name = (parsed as { name: string }).name
          identity = event.data.callId
        }
      } catch { /* malformed tool arguments contain no usable invocation */ }
    }
    if (!name) continue
    invocations.push({
      key: createHash('sha256').update(JSON.stringify([event.type, identity, event.seq, event.time, name])).digest('hex'),
      name, time: event.time, inherited: event.seq < (log.inheritedEventCount ?? 0),
    })
  }
  return invocations
}

/** Collect per-skill invocation counts and last-used times from one session. */
export function countSkillInvocations(events: readonly SessionEvent[]): Map<string, InvocationStat> {
  return new Map(aggregateInvocations([{ id: '', invocations: skillInvocations({ events }) }])
    .map(({ name, count, lastUsed }) => [name, { count, lastUsed: lastUsed ?? 0 }]))
}

/** Copies share an event identity, but independent own calls remain separate. */
function aggregateInvocations(sessions: readonly { id: string; invocations: readonly SkillInvocation[] }[]): SkillStat[] {
  const groups = new Map<string, { name: string; time: number; own: Set<string> }>()
  for (const { id, invocations } of sessions) {
    for (const call of invocations) {
      let group = groups.get(call.key)
      if (group === undefined) {
        group = { name: call.name, time: call.time, own: new Set() }
        groups.set(call.key, group)
      }
      if (!call.inherited) group.own.add(id)
    }
  }
  const totals: Totals = {}
  for (const group of groups.values()) {
    const stat = totals[group.name] ??= { count: 0, lastUsed: group.time }
    stat.count += Math.max(1, group.own.size)
    stat.lastUsed = Math.max(stat.lastUsed, group.time)
  }
  return toSorted(totals)
}

/** Aggregated totals bucket keyed by skill name. */
type Totals = Record<string, InvocationStat>

function isFrozen(record: { header: { createdAt?: number } }, watermark: number): boolean {
  const created = record.header.createdAt
  // Missing or non-positive timestamps never freeze by time (full scans cache
  // such sessions explicitly instead — see below). The re-read path is merely
  // slower, never wrong.
  return typeof created === 'number' && created > 0 && created < watermark
}

/** Max parallel session-log reads per scan. Reads on the query path restore +
 * replay-validate a full Session each (structuredClone × 2 + deepFreeze), so
 * this stays 1: at most one restored log is resident and a heavy corpus costs
 * wall time, never a memory spike. The cold path reads sequentially anyway. */
const SCAN_READ_CONCURRENCY = 1

function toSorted(totals: Totals): SkillStat[] {
  return Object.entries(totals)
    .map(([name, stat]) => ({ name, count: stat.count, lastUsed: stat.lastUsed }))
    .sort((x, y) => x.name.localeCompare(y.name))
}

/** Effective freeze watermark for the configured rolling window (0 = all history → freeze horizon). */
function watermarkFor(windowDays: number, nowMs: number): number {
  return windowDays > 0 ? nowMs - windowDays * DAY_MS : nowMs - STATS_FREEZE_AFTER_MS
}

/**
 * Whether a session's usage counts toward the configured window. With no
 * window (0) everything counts — full history; with a window, only sessions
 * created inside it do. Distinct from the freeze watermark, which is purely a
 * re-read optimization.
 */
function inWindow(createdAt: number | undefined, windowDays: number, nowMs: number): boolean {
  if (windowDays <= 0) return true
  return typeof createdAt === 'number' && createdAt > 0 && createdAt >= nowMs - windowDays * DAY_MS
}

/**
 * One pass over the corpus. Runs either a full reconciliation (rebuilds the
 * per-session cache and advances the watermark — mutates the checkpoint) or a
 * cheap incremental scan (re-reads everything at or after the watermark and
 * merges over the cached sessions — leaves the checkpoint untouched). Totals
 * always apply the CURRENT window filter over the cached sessions, so a
 * window shrink takes effect immediately even before the next reconciliation.
 */
export async function scan(query: SessionQueryLike, checkpoint: SkillStatsCheckpoint, nowMs: number, windowDays: number): Promise<{ stats: SkillStat[]; mutated: boolean }> {
  const sessions = await query.listSessions()
  const cutoff = watermarkFor(windowDays, nowMs)
  const dueFullScan = nowMs - checkpoint.lastFullReconcile >= STATS_FULL_RECONCILE_MS
    || checkpoint.windowDays !== windowDays
  if (dueFullScan) checkpoint.frozenSessions = {}
  const included: Array<{ id: string; invocations: SkillInvocation[] }> = []
  const seen = new Set(sessions.map(record => String(record.header.id)))
  for (const id of Object.keys(checkpoint.frozenSessions)) {
    if (!seen.has(id)) delete checkpoint.frozenSessions[id]
  }
  await mapConcurrent(sessions, SCAN_READ_CONCURRENCY, async (record) => {
    const id = String(record.header.id)
    const created = record.header.createdAt
    if (!inWindow(created, windowDays, nowMs)) {
      delete checkpoint.frozenSessions[id]
      return
    }
    const cached = checkpoint.frozenSessions[id]
    if (!dueFullScan && cached !== undefined) {
      included.push({ id, invocations: cached.invocations })
      return
    }
    if (!dueFullScan && isFrozen(record, checkpoint.frozenBefore)) return
    try {
      const invocations = skillInvocations(await query.readSession(record.header.id))
      if (dueFullScan && invocations.length > 0 && (isFrozen(record, cutoff) || !(typeof created === 'number' && created > 0))) {
        checkpoint.frozenSessions[id] = { createdAt: created ?? 0, invocations }
      }
      included.push({ id, invocations })
    } catch { /* unreadable sessions are skipped, never fatal */ }
  })
  if (dueFullScan) {
    checkpoint.frozenBefore = cutoff
    checkpoint.windowDays = windowDays
    checkpoint.lastFullReconcile = nowMs
  }
  return { stats: aggregateInvocations(included), mutated: dueFullScan }
}

/**
 * One pass over the corpus through the persistence seam. Reads are strictly
 * sequential and each handle is closed before the next opens, so at most one
 * raw log is resident. A session is re-read only when its revision token
 * changed since the checkpoint; the rolling window is applied from the
 * listing headers, so out-of-window logs are never even opened. Live sessions
 * (in-memory, possibly newer than their persisted revision) are read through
 * `readLive` and never enter the revision cache.
 *
 * A `list()` failure rejects — the reader keeps the previous totals, and the
 * next poll retries. Per-session failures are skipped, never fatal.
 */
export async function scanCold(
  persistence: SessionPersistenceLike,
  checkpoint: SkillStatsCheckpoint,
  nowMs: number,
  windowDays: number,
  liveIds: ReadonlySet<string> = new Set(),
  readLive: (id: SessionId) => Promise<SkillStatsLog | undefined> = async () => undefined,
): Promise<SkillStat[]> {
  const revisions = checkpoint.coldRevisions ?? (checkpoint.coldRevisions = {})
  const included: Array<{ id: string; invocations: SkillInvocation[] }> = []
  const snapshots = await persistence.list()
  const seen = new Set<string>()
  for (const snapshot of snapshots) {
    const id = snapshot.header.id as unknown as string
    seen.add(id)
    if (liveIds.has(id)) continue // covered by the live read below, never double-counted
    const created = snapshot.header.createdAt
    if (!inWindow(created, windowDays, nowMs)) {
      delete revisions[id]
      continue
    }
    const rev = snapshot.revision
    const cached = revisions[id]
    if (cached !== undefined && cached.rev === rev) {
      included.push({ id, invocations: cached.invocations })
      continue
    }
    let invocations: SkillInvocation[]
    try {
      const handle = await persistence.open(snapshot.header.id, 'read')
      try {
        invocations = skillInvocations(await handle.read())
      } finally {
        await handle.close()
      }
    } catch {
      continue // unreadable sessions are skipped (and not cached), never fatal
    }
    revisions[id] = {
      rev,
      createdAt: typeof created === 'number' ? created : 0,
      invocations,
    }
    included.push({ id, invocations })
  }
  for (const id of Object.keys(revisions)) {
    if (!seen.has(id)) delete revisions[id] // sessions gone from the listing leave the cache
  }
  for (const id of liveIds) {
    let log: SkillStatsLog | undefined
    try {
      log = await readLive(id as unknown as SessionId)
    } catch {
      continue
    }
    if (log === undefined) continue
    included.push({ id, invocations: skillInvocations(log) })
  }
  return aggregateInvocations(included)
}

/**
 * Full-corpus totals in one shot (no checkpoint reuse). Kept as the
 * reference implementation for tests and one-off callers.
 */
export async function readSkillStats(query: SessionQueryLike, windowDays = 0): Promise<SkillStat[]> {
  const checkpoint: SkillStatsCheckpoint = { windowDays, frozenBefore: 0, frozenSessions: {}, lastFullReconcile: 0 }
  return (await scan(query, checkpoint, Date.now(), windowDays)).stats
}

/**
 * Full-corpus totals in one shot through the persistence seam (no checkpoint
 * reuse). Reference implementation for tests and one-off callers.
 */
export async function readColdSkillStats(persistence: SessionPersistenceLike, windowDays = 0): Promise<SkillStat[]> {
  const checkpoint: SkillStatsCheckpoint = { windowDays, frozenBefore: 0, frozenSessions: {}, lastFullReconcile: 0 }
  return scanCold(persistence, checkpoint, Date.now(), windowDays)
}

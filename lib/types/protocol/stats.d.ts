/** One skill's invocation stats across the local session logs. */
export interface SkillStat {
    /** Kebab-case skill name. */
    name: string;
    /** How many distinct invocations remain in the available session logs. */
    count: number;
    /** Unix epoch ms of the most recent invocation (absent when never called). */
    lastUsed?: number;
}
/** GET /api/skill-hub/stats */
export interface StatsResponse {
    ok: true;
    /** Whether a session-log source was available (false means counts are empty). */
    available: boolean;
    /** Sorted per-skill invocation counts. */
    stats: SkillStat[];
    /** Which read path produced the counts (debug aid for memory-issue follow-ups). */
    source?: 'cold' | 'query';
}
/** Minimal invocation identity retained for cross-session fork deduplication. */
export interface SkillInvocation {
    /** Hash of the event identity, without prompt or tool-argument contents. */
    key: string;
    name: string;
    time: number;
    /** The event lies before this session's exact inherited boundary. */
    inherited: boolean;
}
/**
 * Persisted incremental-scan checkpoint for the usage statistics (sidecar
 * `skillStats` field). Two buckets cover the two read paths:
 *
 * - `coldRevisions` (preferred): per-session invocation identities keyed by the persistence
 *   seam's opaque revision token. A session is re-read only when its revision
 *   changes, so resumed old sessions are picked up exactly and the daily full
 *   reconciliation is unnecessary on this path.
 * - `frozenSessions` + `frozenBefore` + `lastFullReconcile` (fallback): the
 *   legacy time-watermark scheme used when only the heavier `sessionQuery`
 *   seam is available. Sessions older than the effective watermark are treated
 *   as finalized: their per-session invocation identities live in `frozenSessions` (only
 *   sessions with at least one invocation are kept) and they are not re-read
 *   on incremental scans. A daily full reconciliation rebuilds the cache and
 *   advances the watermark, so a resumed old session is eventually re-counted.
 */
export interface SkillStatsCheckpoint {
    /** Persisted invocation-identity format; absent caches are rebuilt from logs. */
    identityVersion?: 1;
    /** The rolling-window configuration this checkpoint was built for (0 = all history). */
    windowDays: number;
    /** Watermark: every session with header.createdAt < this value is frozen. */
    frozenBefore: number;
    /** Per-session invocation identities of finalized sessions, keyed by session id. */
    frozenSessions: Record<string, {
        createdAt: number;
        invocations: SkillInvocation[];
    }>;
    /** Epoch ms of the last full reconciliation (drives the daily cadence). */
    lastFullReconcile: number;
    /**
     * Totals from the last completed scan (any kind). Served instantly on cold
     * start so a restart still shows numbers while the background rescan runs.
     */
    lastTotals?: SkillStat[];
    /**
     * Per-session invocation identities read through the persistence seam, keyed by session id
     * and stamped with the revision they were read at. Absent until the first
     * cold-path scan completes; the query fallback path ignores it.
     */
    coldRevisions?: Record<string, ColdRevisionEntry>;
}
/** One cold-path cache entry: what a session's log contained at a revision. */
export interface ColdRevisionEntry {
    /** The persistence seam's opaque revision token, stringified. */
    rev: string;
    /** header.createdAt at read time (0 when the header carried none). */
    createdAt: number;
    /** Invocation identities (empty when the session invoked no skill). */
    invocations: SkillInvocation[];
}
//# sourceMappingURL=stats.d.ts.map
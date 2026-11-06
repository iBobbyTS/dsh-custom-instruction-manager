import type { HubConfig, MarketSourceRecord, MarketStatsSnapshot, SkillStatsCheckpoint, SourceRecord, TrashEntry } from '../protocol.ts';
/** Sidecar state owner. */
export declare class SkillHubStore {
    private readonly file;
    private config;
    private sourcesByRepo;
    private marketSources;
    private trashByPath;
    private skillStats;
    private marketStats;
    /** 选中的 token 计数模型；undefined = 从未保存（协议层默认集合）。 */
    private tokenModels;
    private loaded;
    /** Serializes persist runs: concurrent mutators must not let an earlier
     *  snapshot overwrite a later one (rename is atomic, ordering is not). */
    private writeChain;
    constructor(file?: string);
    private ensureLoaded;
    /** The hub's saved runtime configuration (fields absent here mean "not overridden"). */
    getConfig(): Promise<Partial<HubConfig>>;
    /**
     * Persist a runtime-config patch, merged over the saved values. A field
     * whose patch value is undefined is removed from the saved layer, so the
     * setting re-inherits its default (the web card's "reset" path).
     */
    setConfig(config: Partial<HubConfig>): Promise<void>;
    /** All source records, sorted by repo. */
    listSources(): Promise<SourceRecord[]>;
    /** One source record by repo (undefined when absent). */
    getSource(repo: string): Promise<SourceRecord | undefined>;
    /** The source record that tracks a skill name (undefined when untracked). */
    getSourceForSkill(name: string): Promise<SourceRecord | undefined>;
    /** Remove a source record entirely (no-op when absent). */
    deleteSource(repo: string): Promise<void>;
    /**
     * Upsert one skill into a source record. When the repo has no record yet a
     * new one is created (root + commit snapshot from the caller).
     */
    /**
     * Record one imported skill in its repo-level source row.
     *
     * A repo owns exactly one source row, hence one pinned ref, so a later import
     * must re-pin it: keeping the first import's `ref` / `commitSha` makes
     * `sources/check` compare against a stale sha and `sources/sync` re-download
     * the old ref over content that was imported from a tag — the "pinning a tag
     * means nothing" failure of issue #15, reached through the bookkeeping
     * instead of the download. An absent `ref` means the import ran on the
     * default branch, which clears the pin rather than silently keeping it.
     */
    addSourceSkill(repo: string, root: string, commitSha: string, ref: string | undefined, skillName: string): Promise<void>;
    /** Replace a source's skill list (used after sync/confirm-delete). */
    setSourceSkills(repo: string, skills: readonly string[]): Promise<SourceRecord | undefined>;
    /** Remove one skill from every source record (used when the skill is deleted). */
    removeSkillFromSources(name: string): Promise<void>;
    /** Update a source's commit snapshot. */
    setSourceCommit(repo: string, commitSha: string): Promise<void>;
    /** Update a source's pinned ref (release tag / branch) when the market syncs. */
    setSourceRef(repo: string, ref: string): Promise<void>;
    /**
     * Merge per-path manifest entries into a source (incremental imports).
     * When `dir` is given, every baseline path under that skill directory is
     * dropped first, so files the upstream removed never linger in the
     * baseline and skew later update diffs.
     *
     * `dir` may be '' — a skill whose SKILL.md sits at the repo root. Its prefix
     * is empty, so the whole baseline is replaced: that skill owns the tree, and
     * keeping stale paths would make every later diff report "changed" forever.
     */
    mergeSourceManifest(repo: string, manifest: Record<string, number>, dir?: string): Promise<void>;
    /** skillName → collection name for every recorded origin (derived from sources). */
    listOrigins(): Promise<Record<string, string>>;
    /** The user's market sources, in addition order. */
    listMarketSources(): Promise<MarketSourceRecord[]>;
    /** One market source by repo (undefined when absent). */
    getMarketSource(repo: string): Promise<MarketSourceRecord | undefined>;
    /** Add a repo (deduplicated), optionally with a pinned ref. Returns the fresh list. */
    addMarketSource(repo: string, ref?: string): Promise<MarketSourceRecord[]>;
    /** Remove a repo (no-op when absent). Returns the fresh list. */
    removeMarketSource(repo: string): Promise<MarketSourceRecord[]>;
    /** Pin a market source to an explicit ref (branch/tag). Returns the record. */
    setMarketSourceRef(repo: string, ref: string): Promise<MarketSourceRecord | undefined>;
    /** Record the commit a market source's pinned ref resolved to (update baseline). */
    setMarketSourceCommit(repo: string, commitSha: string): Promise<void>;
    /** 选中的 token 计数模型（`undefined` = 从未保存，调用方回落到默认集合）。 */
    getTokenModels(): Promise<string[] | undefined>;
    /** 保存选中集合（空数组合法：用户一个模型都不选）。 */
    setTokenModels(ids: string[]): Promise<void>;
    /** All trashed skills, newest first. */
    listTrash(): Promise<TrashEntry[]>;
    /** One trash entry by skill name — the newest when a name has several. */
    getTrash(name: string): Promise<TrashEntry | undefined>;
    /**
     * Record a trashed skill, keyed by its trashed path. Keying by name used to
     * silently drop the previous record when the same name landed in the trash
     * twice (a re-delete, or the two on-disk discovery forms), orphaning its
     * directory with nothing left pointing at it.
     */
    addTrash(entry: TrashEntry): Promise<void>;
    /** Remove a trash record by its trashed path (after restore or permanent clear). */
    removeTrash(path: string): Promise<void>;
    /** The persisted usage-statistics checkpoint (undefined until first saved). */
    getSkillStatsState(): Promise<SkillStatsCheckpoint | undefined>;
    /** Persist a usage-statistics checkpoint (after every completed scan; cadence follows the scan TTL). */
    saveSkillStatsState(state: SkillStatsCheckpoint): Promise<void>;
    /** The persisted market-stats snapshot (undefined until first saved). */
    getMarketStatsState(): Promise<MarketStatsSnapshot | undefined>;
    /** Persist a market-stats snapshot (written when a refresh fetched anything new). */
    saveMarketStatsState(state: MarketStatsSnapshot): Promise<void>;
    private persist;
}
//# sourceMappingURL=store.d.ts.map
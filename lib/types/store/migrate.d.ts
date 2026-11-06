import type { HubConfig, MarketSourceRecord, MarketStatsSnapshot, SkillStatsCheckpoint, SourceRecord, TrashEntry } from '../protocol.ts';
/** Normalized raw sidecar document after schema migration (fields still unvalidated). */
export interface MigratedStore {
    version: number;
    config?: unknown;
    sources?: unknown;
    marketSources?: unknown;
    trash?: unknown;
    skillStats?: unknown;
    marketStats?: unknown;
    tokenModels?: unknown;
}
/**
 * Normalize an arbitrary parsed sidecar document to the current schema.
 * v1 to v2: scenes are dropped (the one-click role merged into group
 * switches), and origins are migrated into source records (repo = origin
 * value, commit snapshot empty — the first update check backfills it).
 * v2 to v3: market sources become records ({ repo, ref?, commitSha? })
 * instead of bare repo slugs, so a source can pin a release/branch version.
 * v4 to v5: the scene system is gone — `tags` and trash `tagIds` are simply
 * not read any more, so a loaded v4 file is rewritten without them.
 * v5 to v6: the skill enable/disable toggle is gone — the `disabled` bucket and
 * the saved `announceToAgent` config field are no longer read, so a loaded
 * older file is rewritten without them.
 * Returns null when the file claims a newer schema than this plugin
 * understands, so the caller starts empty instead of risking data loss.
 */
export declare function migrateStore(parsed: unknown): MigratedStore | null;
/** Validated in-memory state hydrated from a migrated document. */
export interface HydratedState {
    config: Partial<HubConfig>;
    sourcesByRepo: Map<string, SourceRecord>;
    marketSources: MarketSourceRecord[];
    trashByPath: Map<string, TrashEntry>;
    skillStats: SkillStatsCheckpoint | undefined;
    marketStats: MarketStatsSnapshot | undefined;
    /** 选中模型 id；`undefined` = 从未保存（用默认集合）。 */
    tokenModels: string[] | undefined;
}
/**
 * 把迁移后的原始文档校验为内存状态：坏条目丢弃、坏桶降级为空，
 * 绝不因一条脏数据丢掉整个 sidecar（与原 ensureLoaded 内联逻辑一致）。
 */
export declare function hydrateMigratedState(migrated: MigratedStore): HydratedState;
//# sourceMappingURL=migrate.d.ts.map
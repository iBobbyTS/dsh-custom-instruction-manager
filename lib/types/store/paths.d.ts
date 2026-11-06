import type { HubConfig, MarketSourceRecord, MarketStatsSnapshot, SkillStatsCheckpoint, SourceRecord, TrashEntry } from '../protocol.ts';
/** Wire shape persisted on disk. */
export interface StoreFile {
    version: number;
    /** Runtime configuration edited from the web settings card (hub-owned, not settings-service). */
    config?: Partial<HubConfig>;
    /** Upstream source tracking records (repo + commit snapshot). */
    sources?: SourceRecord[];
    /** User-added market sources (owner/repo slugs + optional pinned ref). */
    marketSources?: MarketSourceRecord[];
    /** Trashed skills (removed after upstream deletion, restorable). */
    trash?: TrashEntry[];
    /** Usage-statistics incremental-scan checkpoint (frozen watermark + totals). */
    skillStats?: SkillStatsCheckpoint;
    /** Market-stats snapshot (stars/downloads per repo, hourly TTL). */
    marketStats?: MarketStatsSnapshot;
    /** 选中的 token 计数模型 id（缺省 = 用协议层的默认集合；空数组 = 一个都不选）。 */
    tokenModels?: string[];
}
/** Resolve the DSH home directory (the filesystem provider's user-dsh root base). */
export declare function dshHome(): string;
/** Resolve the shared agents root (`DSH_AGENTS_HOME`, else `~/.agents`). */
export declare function agentsHome(): string;
/**
 * 插件自有数据的目录名（`$DSH_HOME/plugin/data/<slug>`）。
 *
 * 用仓库新名字而不是包名：这台机器上这个目录是用户按仓库名建的，卸载插件
 * 后 dsh 不会清它——数据和插件包解耦，重装（哪怕换包名）能接着读。
 */
export declare const PLUGIN_DATA_SLUG = "custom-instruction-manager";
/** 插件数据根目录：记录文件与词表缓存都在这下面。 */
export declare function pluginDataDir(home?: string): string;
/** 记录文件路径（来源、市场源、回收站、统计快照）。 */
export declare function statePath(home?: string): string;
/** 旧记录文件位置（0.3.x）：`$DSH_HOME/dsh-skill-hub.json`。启动时迁走。 */
export declare function legacyStatePath(home?: string): string;
/** 词表缓存目录（每个模型一份 tokenizer.json）。 */
export declare function tokenizerCacheDir(home?: string): string;
/** 旧词表缓存位置（0.3.26）：`$DSH_HOME/skill-hub/tokenizers`。启动时迁走。 */
export declare function legacyTokenizerDir(home?: string): string;
/** Current sidecar schema version. Bump on breaking shape changes and add a migration below. */
export declare const STORE_VERSION = 6;
//# sourceMappingURL=paths.d.ts.map
/**
 * routes 共享状态：各类节流表、市场统计内存缓存、异步导入任务表。
 * 从 routes.ts 原样搬出，行为不变；各域 handler 从这里 import。
 */
import type { SkillHubRouteDeps } from './helpers.ts';
/** Minimum interval between network update checks per source (GitHub rate limits). */
export declare const MIN_CHECK_INTERVAL_MS: number;
/** Last successful check time per repo (in-memory throttle for GitHub rate limits). */
export declare const lastSourceCheck: Map<string, number>;
/** Last successful market update check per repo (same throttle). */
export declare const lastMarketCheck: Map<string, number>;
/** Market stats (stars/downloads) throttle: hourly, plus a fallback cache. */
export declare const lastMarketStats: Map<string, number>;
export declare const marketStatsCache: Map<string, {
    stars: number;
    downloads: number;
}>;
export declare const MARKET_STATS_TTL_MS: number;
export declare function seedMarketStats(deps: SkillHubRouteDeps): Promise<void>;
/** Async import job (B方案：jobId + 轮询，选项2后台继续) */
export interface ImportJob {
    jobId: string;
    total: number;
    done: number;
    current?: string;
    currentFile?: string;
    totalBytes: number;
    downloadedBytes: number;
    startTime: number;
    imported: Array<{
        name: string;
        origin: string;
        path: string;
    }>;
    skipped: Array<{
        name: string;
        reason: 'exists';
    }>;
    failed: Array<{
        name: string;
        error: string;
    }>;
    /**
     * 导入时被移入回收站让位的「已禁用同名占位」名字（issue #16）。占位已挪走
     * 即计入，即使随后的下载失败也在列 —— 否则用户不知道自己的占位不见了。
     */
    replaced: string[];
    status: 'running' | 'done' | 'cancelled' | 'error';
    error?: string;
    controller: AbortController;
    createdAt: number;
}
export declare const importJobs: Map<string, ImportJob>;
export declare const IMPORT_JOB_TTL_MS: number;
export declare const IMPORT_JOB_MAX = 100;
export declare function gcImportJobs(): void;
/**
 * Replace whatever currently occupies a skill slot with a fresh download;
 * restores the previous state on failure.
 *
 * `target` is the entry to move aside — a bundle **directory** or a flat
 * `<name>.md` file, whichever the download is replacing (the rename/rm below
 * are form-neutral). The backup is dot-prefixed (discovery skips dot entries),
 * so even a failed cleanup can never register as a duplicate skill.
 */
export declare function replaceInPlace(target: string, download: () => Promise<unknown>): Promise<void>;
/**
 * 让位：把一个名字下的「非启用态占位」移入回收站。
 * 只动这两类，**启用的技能一律不碰**：
 * - 旧版遗留的禁用发现文件（`<name>/SKILL.md.disabled` 或 `<name>.md.disabled`，两种形态都认）；
 * - 同名目录存在但既无 `SKILL.md` 也无 `SKILL.md.disabled`（导入中断/手工删除的空壳）。
 *
 * 回收站按名字索引，所以多形态只会记下最后一条的恢复指针；其余的那份会在
 * 「清空回收站」时被孤儿回收扫掉（见 sourceTrashClear）。
 *
 * @returns 被移入回收站的路径列表，没有可让位的东西时 undefined。
 */
export declare function retireNamePlaceholders(deps: SkillHubRouteDeps, base: string, name: string): Promise<string[] | undefined>;
//# sourceMappingURL=route-state.d.ts.map
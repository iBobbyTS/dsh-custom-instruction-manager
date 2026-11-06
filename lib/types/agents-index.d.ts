/**
 * AGENTS.md 页索引的落盘缓存。
 *
 * 位置：`$DSH_HOME/plugin/data/custom-instruction-manager/agents-index.json` ——
 * 和 state.json、词表缓存在同一个插件数据目录下。
 *
 * 生命周期：
 *   - 插件加载时（包括每次打开 dsh）读一次进内存，面板打开页面立刻有内容；
 *   - 每一轮分步扫描完成后原子覆盖写一次，下一次启动读到的就是那一份；
 *   - 读不到、JSON 坏了、版本或键对不上，都当作**没有缓存**：页面退化成
 *     「无缓存 → 直接从第一轮扫描开始」，功能不受影响（缓存从来不参与写操作）。
 *
 * 键 = 家目录 + 共享 agents 根 + 排除目录。少了这道校验，用户改了排除目录
 * （哪怕是在 dsh 关着的时候改的）之后还会拿旧索引来铺——那正是索引缓存要
 * 避免的「拿旧结果当现状」。
 */
import { type InstructionRoster } from './protocol.ts';
import { type SkillHubRouteDeps } from './routes/deps.ts';
/** 索引缓存文件的名字（在插件数据目录下）。 */
export declare const AGENTS_INDEX_FILE = "agents-index.json";
/** 缓存文件的绝对路径。 */
export declare function agentsIndexPath(home?: string): string;
/** 一份索引缓存的键：这三样任一变化，旧索引就不再适用。 */
export interface AgentsIndexKey {
    home: string;
    agentsHome: string;
    excludeDirs: string[];
}
/** 当前依赖下的键。 */
export declare function agentsIndexKey(deps: SkillHubRouteDeps): AgentsIndexKey;
/** 当前依赖下的缓存键（字符串形态）；进行中的分步扫描也用它分键。 */
export declare function agentsKeyString(deps: SkillHubRouteDeps): string;
/** 一份可用的索引缓存：完成时间 + 清单。 */
export interface CachedAgentsRoster {
    /** 这一轮扫描完成的时间（epoch ms）。 */
    at: number;
    roster: InstructionRoster;
}
/**
 * 读内存里的索引缓存。
 * @param deps - route dependencies (homes + exclude list).
 * @returns 命中时是 `{at, roster}`，否则 undefined。
 */
export declare function cachedAgentsRoster(deps: SkillHubRouteDeps): CachedAgentsRoster | undefined;
/**
 * 一轮扫描完成：覆盖内存里的那份，并原子写回磁盘。
 *
 * 写盘是尽力而为：失败只是下次启动首屏少一份缓存，不影响本次结果。
 * @param deps - route dependencies (homes + exclude list).
 * @param roster - 这一轮的完整结果。
 * @param at - 完成时间（默认现在）。
 */
export declare function saveAgentsRoster(deps: SkillHubRouteDeps, roster: InstructionRoster, at?: number): Promise<void>;
/**
 * 插件加载时把磁盘上那份索引读进内存。
 *
 * 同一个键已经有更新的内存结果时不覆盖（配置变更后 `sync()` 会重跑，这里
 * 只负责把「启动时什么都没有」这个状态补上）。读盘失败 / 格式坏 / 键不符
 * 一律静默跳过。
 * @param deps - route dependencies (homes + exclude list).
 */
export declare function hydrateAgentsRoster(deps: SkillHubRouteDeps): Promise<void>;
/** 清空内存缓存（测试用来模拟 host 重启：内存清掉后由 hydrate 从磁盘读回）。 */
export declare function resetAgentsRosterCache(): void;
//# sourceMappingURL=agents-index.d.ts.map
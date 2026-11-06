/**
 * 旧版本数据的一次性搬迁：`$DSH_HOME` 根下的两处旧位置 → `$DSH_HOME/plugin/data/
 * custom-instruction-manager/`。
 *
 * 要搬的是两样东西，都在旧版本里散落在 `$DSH_HOME` 根部：
 *  - `dsh-skill-hub.json`（技能开关、来源、市场源、回收站记录）→ `state.json`
 *  - `skill-hub/tokenizers/`（25 MB 词表）→ `tokenizer/`
 *
 * 为什么同步、且在 apply() 里跑：记录文件是懒加载的，任何一条路由都可能先读到
 * 它；搬迁要是异步的就存在「路由先读到空状态、随后才被迁过来」的窗口，用户会
 * 看到开关全丢。这里只做几次 exists/rename，微秒级，启动时一次性成本可以忽略。
 *
 * 三条安全规则：目标已存在就**不覆盖**（用户可能已经在新位置有数据）；任何一步
 * 失败只记日志、不抛（最坏情况是旧数据留在原地、词表重新下载）；重复执行无副作用。
 */
/** 每样东西的搬迁结果：`moved` 搬了、`kept` 目标已有数据没动、`absent` 没找到旧的。 */
export type MigrationOutcome = 'moved' | 'kept' | 'absent';
export interface LegacyDataMigration {
    /** 记录文件。 */
    state: MigrationOutcome;
    /** 词表缓存目录。 */
    tokenizers: MigrationOutcome;
    /** 新数据根目录（日志用）。 */
    dir: string;
    /** 搬迁失败的原因（成功时缺省）；旧数据留在原地，功能照旧。 */
    error?: string;
}
/**
 * 把 0.3.x 的两处旧数据搬到插件自己的数据目录（幂等）。
 *
 * @param home - DSH home 覆盖（测试注入临时目录）。
 * @returns 每样东西各自的结果，供调用方决定要不要写一行日志。
 */
export declare function migrateLegacyData(home?: string): LegacyDataMigration;
//# sourceMappingURL=data-migrate.d.ts.map
/**
 * Pure grouping helpers for the skill-hub panel (no React/DOM deps, so the
 * merge/classify/filter logic stays unit-testable).
 *
 * The "分组" view groups a skill by its origin collection (sidecar sources →
 * backend-aggregated CollectionGroup).
 */
import type { CatalogSkill, CollectionGroup } from '../protocol.ts';
import { isProjectSource } from '../protocol.ts';
export { isProjectSource };
/**
 * 技能是否有真实磁盘文件（用户根 / 项目根）。bundled 与第三方 provider
 * 注册的技能只存在于应用包或 provider 内存里，Finder 打不开。
 */
export declare function isFileSource(source: string): boolean;
/**
 * Stable React key for one catalog row.
 *
 * A skill NAME is not unique in the catalog: the host keys project skills by
 * `<name>+<workspace>+<source>` on purpose, so the same name may legitimately
 * appear twice (two workspaces owning a skill of that name, or the same name
 * coming from different roots/providers). Keying rows by name alone collides
 * inside one list, and React then mis-reconciles the list: switching the
 * 平铺/分组 view leaves the stale rows in the DOM and they pile up on every
 * further switch. The identity below matches the host's logical key.
 */
export declare function skillRowKey(skill: Pick<CatalogSkill, 'name' | 'source' | 'workspace'>): string;
/** Origin-repo filter value: skills with no source record (private skills). */
export declare const PRIVATE_SOURCE = "private";
/**
 * Apply the origin filter ('all' or a specific origin repo; skills without a
 * source record count as PRIVATE_SOURCE). The origins map is the store's
 * skillName → repo derivation, so filtering follows the tracked source
 * records instead of the filesystem root a skill happens to live under.
 * 项目级技能（有 workspace 归属）永远不算「个人」。
 */
export declare function filterBySource(skills: readonly CatalogSkill[], source: string, origins: Readonly<Record<string, string>>): CatalogSkill[];
/** One origin collection with the members visible under the current filters. */
export interface VisibleCollection {
    collection: CollectionGroup;
    /** Currently visible members. */
    skills: CatalogSkill[];
}
/**
 * 用户可见的「管理方」：技能从哪来、由谁维护。provider id 是注册表概念，
 * 用户技能全都显示成 skill-hub 会造成误导，所以按可读语义收敛：
 * - 有上游来源记录（市场 / 直接 URL 导入）→ 仓库名；
 * - 用户根 → User Managed；
 * - 项目根 → Project Managed；
 * - 内置 / 第三方 provider → provider id（如 dsh-office、openviking）。
 */
export type ManagedBy = {
    kind: 'repo';
    repo: string;
} | {
    kind: 'user';
} | {
    kind: 'project';
} | {
    kind: 'provider';
    provider: string;
};
/** Derive the user-facing 管理方 for one skill (origin repo wins). */
export declare function managedByOf(skill: Pick<CatalogSkill, 'source' | 'provider'>, origin?: string): ManagedBy;
/** 个人技能按「管理方」聚合出的一个二级分组。 */
export interface ManagedBucket {
    /** 稳定键（`managed:<kind>[:<id>]`），与折叠状态共用。 */
    key: string;
    managed: ManagedBy;
    /** 该管理方下、且通过当前筛选的技能。 */
    skills: CatalogSkill[];
}
/**
 * Group the personal (untracked, non-project) skills by 管理方 — user-owned
 * skills collapse into one "User Managed" bucket instead of the misleading
 * `skill-hub` provider id; bundled / third-party providers keep their id.
 *
 * Bucket order follows first appearance in the incoming (already sorted)
 * list, so the chosen sort key still decides the subgroup order.
 */
export declare function personalManagedBuckets(skills: readonly CatalogSkill[]): ManagedBucket[];
/**
 * Match origin collections against the currently visible skills, dropping
 * collections with no visible member. Without this, a stale origin (skill
 * deleted on disk) renders a group header with zero rows — an empty shell the
 * sources tab otherwise never shows (project/personal groups already
 * disappear when they have nothing to display).
 */
export declare function visibleCollections(collections: readonly CollectionGroup[], visibleSkills: readonly CatalogSkill[]): VisibleCollection[];
/** Catalog sort keys offered by the filter bar. */
export type SortKey = 'name' | 'added' | 'uses';
/**
 * Sort a skill list in place-safe copy order: name ascending, added
 * descending (newest first, unknown addedAt last), or uses descending
 * (most-called first). Unknown values always trail.
 */
export declare function sortSkills(skills: readonly CatalogSkill[], key: SortKey, getUses?: (name: string) => number | undefined): CatalogSkill[];
/**
 * Rank one workspace path in the dsh sidebar (registry) order.
 * Unknown paths — including the cwd-scoped pseudo workspace and project skills
 * whose workspace is unset — trail every known one, so a partially known order
 * still renders deterministically.
 */
export declare function workspaceRank(path: string | undefined, order: readonly string[]): number;
/** Localized relative-time tuple; the caller resolves it via tt(). */
export interface RelativeTime {
    key: 'time.justNow' | 'time.minutesAgo' | 'time.hoursAgo' | 'time.daysAgo' | 'time.weeksAgo';
    value?: number;
}
/** Format an epoch-ms timestamp as a short relative time bucket. */
export declare function formatRelativeTime(ms: number, now?: number): RelativeTime;
//# sourceMappingURL=grouping.d.ts.map
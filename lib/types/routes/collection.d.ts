/**
 * routes 共享层 · 集合装配：origin 映射 → 集合组，以及 groups 路由的数据源。
 * 从 helpers.ts 原样搬出；集合顺序固定按名称，不再有手动重排。
 */
import type { CollectionGroup, GroupsResponse } from '../protocol.ts';
import type { SkillHubRouteDeps } from './deps.ts';
/**
 * 由 origin 映射（skillName → 仓库）构建集合组，按集合名排序。
 * catalog/groups 与 sources 路由共用这一份排序语义。
 */
export declare function buildCollections(origins: Readonly<Record<string, string>>): CollectionGroup[];
/** 系统集合组 + origin 映射（groups 路由的数据源）。 */
export declare function buildGroups(deps: SkillHubRouteDeps): Promise<GroupsResponse>;
//# sourceMappingURL=collection.d.ts.map
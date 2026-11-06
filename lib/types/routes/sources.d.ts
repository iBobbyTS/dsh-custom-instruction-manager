/**
 * 来源跟踪域路由：sources 列表 / check 上游更新 / sync 同步 / delete 跟进
 * 删除 / restore 恢复 / trash/clear 清空回收站。从 routes.ts 原样搬出，
 * handler 逻辑不变。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 来源跟踪域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function sourceRoutes(deps: SkillHubRouteDeps): RouteSpec[];
//# sourceMappingURL=sources.d.ts.map
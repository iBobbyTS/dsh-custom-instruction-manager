/**
 * 分组域路由：groups。从 routes.ts 原样搬出，handler 逻辑不变。
 * 集合顺序由名称决定（工作区分组的顺序来自 dsh 侧面栏），不再支持手动重排。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 分组域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function groupRoutes(deps: SkillHubRouteDeps): RouteSpec[];
//# sourceMappingURL=groups.d.ts.map
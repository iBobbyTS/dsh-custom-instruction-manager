/**
 * 目录域路由：catalog / skill 详情 / skill 删除 / create / stats。
 * 从 routes.ts 原样搬出，handler 逻辑不变。
 */
import type { SkillDefinition } from '@deepseek-ai/dsh-skill';
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/**
 * 详情/写调用方式/写正文共用的解析顺序：显式 cwd 只看该工作区；否则按已知
 * 工作区逐个查找（与目录默认视图一致），最后回退用户级根，保证默认视图里
 * 可见的项目技能也能打开详情、也能被同一个技能命中。
 */
export declare function findSkill(deps: SkillHubRouteDeps, name: string, cwd: string): Promise<SkillDefinition | undefined>;
/** 目录域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function catalogRoutes(deps: SkillHubRouteDeps): RouteSpec[];
//# sourceMappingURL=catalog.d.ts.map
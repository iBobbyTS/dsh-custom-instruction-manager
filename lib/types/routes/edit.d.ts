/**
 * 编辑保存路由：把技能正文写回 SKILL.md。
 *
 * 边界（与需求契约一致）：
 *  - 只替换 frontmatter 之后的那段正文，frontmatter 逐字节保留
 *    （name / description / 调用键都归详情页的其他控件管）；
 *  - 可写范围沿用调用方式那条线：用户根与项目根的真实发现文件，内置/插件
 *    provider 没有文件可写；
 *  - 载入时的 mtime/size 与磁盘不一致 → 409 + 最新内容，客户端弹
 *    「复制并重新加载 / 继续编辑 / 仍然覆盖」；
 *  - 同目录临时文件 + rename 原子落盘，保留原权限位。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** 技能正文写回的全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function editRoutes(deps: SkillHubRouteDeps): RouteSpec[];
//# sourceMappingURL=edit.d.ts.map
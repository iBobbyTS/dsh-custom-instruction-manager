/**
 * AGENTS.md 域路由：指令文件清单（用户级 + 每个已知工作区）与文档正文。
 *
 * 这一页不写索引、也没有开关语义——dsh 对指令文件没有启用/禁用概念。排除
 * 目录清单走既有的 /config 路由（HubConfig.excludeDirs），这一族只负责按
 * 当前配置扫磁盘。
 *
 * 索引分两层：
 *   - **缓存**（见 ../agents-index.ts）：上一次完整扫描的结果，内存一份 + 磁盘
 *     一份（插件加载时读回），按（家目录 + 共享根 + 排除目录）分键。面板打开
 *     页面先读它（GET /agents），一次遍历都不用跑；点开一行、保存正文也用它做
 *     成员资格校验，所以「进入分类 → 点开一行」不再是两次全树遍历。
 *   - **进行中的扫描**（`staged`）：GET /agents/scan 分步推进。第 0 步建一份
 *     计划并回用户级分组，之后每个工作区一步；最后一步把整份结果提升为缓存。
 *     面板每步把它并进列表，所以扫描期间看到的是「缓存打底 + 扫到的实时替换」。
 *
 * 成员资格校验用「缓存 ∪ 进行中」：扫描期间新冒出来的文件在完成前就能点开，
 * 不必等这一轮跑完。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** AGENTS.md 页的全部路由 spec（由 routes.ts 包上统一围栏）。 */
export declare function agentsRoutes(deps: SkillHubRouteDeps): RouteSpec[];
//# sourceMappingURL=agents.d.ts.map
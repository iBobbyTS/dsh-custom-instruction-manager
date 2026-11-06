/**
 * MCP 域的 host 实现：从 dsh 的插件管理 / Loader / 工具注册表里读事实，并转发开关。
 *
 * 这里是本插件里唯一碰 dsh 运行内部服务的地方，所以全部用**结构接口**声明
 * （外部插件解析不到 @deepseek-ai 的运行时包，只能靠 ctx.get() 拿到对象），
 * 缺服务就降级成告警，绝不抛给 apply()。
 *
 * 已知边界（见 .agent-work/PLAN.md）：
 *   - 没有连接状态 API：只投影 fiber 阶段与工具数；
 *   - agent preset 里的 MCP 行不在 Loader 顶层，面板看不到；
 *   - 不可寻址的行（补丁里没有 id，如外部产品写入的 insert 行）只能列不能开/关。
 */
import { type McpAccess } from './mcp.ts';
/**
 * Build the MCP access surface over a context service reader.
 * @param get - reads one service off the plugin context (`ctx.get`), `undefined` when absent.
 * @returns list/toggle over the MCP rows of this process.
 */
export declare function createMcpAccess(get: (name: string) => unknown): McpAccess;
//# sourceMappingURL=mcp-runtime.d.ts.map
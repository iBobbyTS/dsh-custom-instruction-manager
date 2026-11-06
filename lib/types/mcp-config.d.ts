/**
 * MCP 域的写入口。
 *
 * 两条路径，刻意分开：
 *   - 本插件受管块里的行（`mcp-hub-*`）：直接重写块，因为 dsh 没有"新增/
 *     删除组合行"的接口；
 *   - 其余已存在的行：交给 dsh 的 `configEditor.edit()`——它做整份补丁校验、
 *     原子写与 Loader 热应用，我们只负责把表单值合进去。
 *
 * 写盘用"重读 → 比对 → 原子替换"的 CAS 循环：dsh 自己的开关/配置写入器也会
 * 改同一个补丁文件，缩小的竞争窗口比加一把它们不认识的锁更有用。HMR 在时
 * 整个写过程包进 `hmr.runExclusive`，与 dsh 的重载串行。
 */
import { type McpConfigurator } from './mcp.ts';
/** 等待 Loader 应用的上限与轮询间隔（测试可缩短）。 */
export interface McpConfigOptions {
    applyTimeoutMs?: number;
    pollMs?: number;
}
/**
 * Build the MCP configurator over a context service reader.
 * @param get - reads one service off the plugin context (`ctx.get`).
 * @param options - apply-wait bound (tests shorten it).
 * @returns save/remove over MCP rows, either through the managed block or dsh's config editor.
 */
export declare function createMcpConfig(get: (name: string) => unknown, options?: McpConfigOptions): McpConfigurator;
//# sourceMappingURL=mcp-config.d.ts.map
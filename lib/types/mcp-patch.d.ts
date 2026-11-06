/**
 * MCP 域的受管块：本插件在 profile 补丁里自己维护的一段 insert 行。
 *
 * dsh 没有"新增 MCP 服务器行"的接口（`pluginManager` 只开关、`configEditor`
 * 只改已有行），所以新增/删除只能写补丁。为了不碰别人的内容，这一段用两条
 * 注释标记围起来：
 *
 *   # @managed-by: custom-instruction-manager (mcp)
 *   ...
 *   # @end-managed-by: custom-instruction-manager (mcp)
 *
 * 每次保存只重写标记之间的文本，块外一个字节都不动（注释、顺序、`!!js`
 * 都原样保留），这也是 dsh 自己的配置写入器能容忍的形状——它们用 `yaml`
 * 的 Document 改行，注释会跟着走。
 *
 * 这一层是纯文本 + js-yaml：不读盘、不加锁，方便单测。
 */
import type { McpFieldError, McpServerInput } from './protocol.ts';
/** 受管块起始标记（整行比较，允许前后空白）。 */
export declare const MANAGED_START = "# @managed-by: custom-instruction-manager (mcp)";
/** 受管块结束标记。 */
export declare const MANAGED_END = "# @end-managed-by: custom-instruction-manager (mcp)";
/** 写在起始标记下面的说明行（每次重写都会重建）。 */
export declare const MANAGED_NOTE = "# \u672C\u5757\u7531\u300C\u81EA\u5B9A\u4E49\u6307\u4EE4\u7BA1\u7406\u5668\u300D\u6309\u9762\u677F\u4FDD\u5B58\u91CD\u5199\uFF1B\u5757\u5916\u5185\u5BB9\u539F\u6837\u4FDD\u7559\uFF0C\u8BF7\u52FF\u5728\u5757\u5185\u624B\u6539\u3002";
/** 面板生成的行 id 前缀：即使标记被弄丢，也能看出这些行是本插件建的。 */
export declare const HUB_ENTRY_PREFIX = "mcp-hub-";
/** 受管块里的一行：id + 原始 config（保留未知字段，例如 reconnect）。 */
export interface ManagedServer {
    id: string;
    config: Record<string, unknown>;
}
/** 解析/读取问题（英文原文，路由按 409 回给界面）。 */
export declare class McpPatchError extends Error {
    readonly status: number;
    readonly field?: string | undefined;
    constructor(message: string, status?: number, /** 字段级错误时指向表单字段。 */ field?: string | undefined);
}
/**
 * 读受管块里的服务器行。
 *
 * 只接受 `name: @deepseek-ai/dsh-mcp-client` 且带字符串 id 的行；块里出现别的
 * 插件（或没有 id 的行）时整块报错，而不是悄悄丢掉——那是人手改过的痕迹。
 * @param text - 补丁文件全文。
 * @returns 受管行（没有块时为空数组）。
 */
export declare function readManagedBlock(text: string): ManagedServer[];
/**
 * 把受管行渲染成块文本（含两条标记与说明行）。
 * @param servers - 受管行，顺序即写入顺序。
 * @returns 可以直接拼进补丁文件的文本（不含首尾空行）。
 */
export declare function renderManagedBlock(servers: readonly ManagedServer[]): string;
/**
 * 用新的受管行替换补丁里的块；没有块时追加到文件末尾。
 * @param text - 补丁文件全文。
 * @param servers - 新的受管行（空数组表示清空块内容，保留标记）。
 * @returns 新的文件全文。
 */
export declare function writeManagedBlock(text: string, servers: readonly ManagedServer[]): string;
/** 由 serverName 生成行 id 的骨架（稳定、可读、只含 [a-z0-9-]）。 */
export declare function entryIdFor(serverName: string): string;
/**
 * 生成一个不与 `taken` 冲突的行 id。
 * @param serverName - 服务器名。
 * @param taken - 现存的 Loader 条目 id 与受管行 id。
 * @returns `mcp-hub-<slug>`，冲突时追加 `-2`、`-3`…
 */
export declare function uniqueEntryId(serverName: string, taken: Iterable<string>): string;
/**
 * 校验并归一化面板提交的一台服务器配置。
 *
 * 只保留当前传输用得上的字段：stdio 丢掉 url/headers，HTTP 丢掉 command/args/
 * env/cwd——避免把上一次的配置带进新传输。
 * @param value - 请求体里的 `server`（JSON 未知形状）。
 * @returns 归一化配置；字段有错时 `errors` 非空、`server` 为 undefined。
 */
export declare function normalizeServerInput(value: unknown): {
    server?: McpServerInput;
    errors: McpFieldError[];
};
/** 归一化配置 → 写进补丁的 config（只写显式给出的字段）。 */
export declare function configFromServer(server: McpServerInput): Record<string, unknown>;
/**
 * 把面板提交的配置覆盖到一份已有行配置上，保留未知字段（例如 `reconnect`）。
 * 换传输时清掉另一种传输的字段，避免把旧命令带进 HTTP 行。
 * @param base - 补丁里该行的原始 config。
 * @param server - 归一化后的提交值。
 * @returns 新的 config（不修改 base）。
 */
export declare function applyServerToConfig(base: Record<string, unknown>, server: McpServerInput): Record<string, unknown>;
//# sourceMappingURL=mcp-patch.d.ts.map
/**
 * MCP 域的纯投影：把「Loader 行 + 行配置 + 当前工具表」折成面板要的服务器列表。
 *
 * 这一层没有 IO，方便单测；真正的读取（pluginManager / loader / tools）在
 * ./mcp-runtime.ts，路由只做参数校验与错误映射。
 *
 * 之所以不读配置文件：dsh 里 MCP 服务器的唯一事实源是**组合后的 Loader 行**
 * （bundle 层 / profile 补丁 / home 补丁 / 启动 overlay 都可能插入或覆盖它），
 * 只有运行中的行才带生效值与当前工具。
 */
import type { McpApplication, McpEditBlockedReason, McpPhase, McpReadOnlyReason, McpResponse, McpServerInfo, McpServerInput } from './protocol.ts';
/** dsh 的 MCP 客户端插件模块名（每个服务器一行）。 */
export declare const MCP_CLIENT_MODULE = "@deepseek-ai/dsh-mcp-client";
/** MCP 工具的公开名前缀；完整形状是 `mcp__<serverName>__<rawName>`。 */
export declare const MCP_TOOL_PREFIX = "mcp__";
/** dsh 的 serverName 约束（也决定工具名的命名空间边界）。 */
export declare const MCP_SERVER_NAME_RE: RegExp;
/** dsh 的 toolCallTimeoutMs 默认值。 */
export declare const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000;
/** 一行 Loader 里读到的事实（config 是补丁原文，可能缺字段）。 */
export interface McpServerFacts {
    /** Loader 条目 id（开关接口的唯一键）。 */
    entryId: string;
    /** 行配置原文。 */
    config: unknown;
    enabled: boolean;
    phase: McpPhase;
    /** 能经插件管理接口定位时的补丁行 id。 */
    patchId?: string;
    readOnlyReason?: McpReadOnlyReason;
}
/** 工具表里的一行（ctx.tools.schemas() 的可见子集）。 */
export interface McpToolFact {
    name: string;
    description?: string;
    /** 工具参数的 JSON Schema（只取顶层 properties 的键）。 */
    parameters?: unknown;
}
/** 投影结果（响应中除环境信息外的全部字段）。 */
export interface McpProjection {
    servers: McpServerInfo[];
    orphanTools: string[];
    warnings: string[];
}
/** host 侧一次读取的完整事实集。 */
export interface McpListFacts {
    facts: McpServerFacts[];
    tools: McpToolFact[];
    /** profile 补丁文件绝对路径；取不到时为 null。 */
    configPath: string | null;
    /** dsh 的插件管理服务可用。 */
    canManage: boolean;
    /**
     * 可编辑性（相对"开关"是另一套判定）：
     *   - managedIds：本插件受管块里的行，改/删都走受管块；
     *   - editableIds：面板能改配置的行（受管行 + dsh 配置编辑服务能定位的行）；
     *   - editBlocked：不能改的行及原因（缺省按 unaddressable 处理）。
     */
    managedIds?: readonly string[];
    editableIds?: readonly string[];
    editBlocked?: Readonly<Record<string, McpEditBlockedReason>>;
    /** 读取阶段（缺服务、某行读失败）产生的告警。 */
    warnings: string[];
}
/** 投影要知道的可写能力（列表事实里的可编辑性字段）。 */
export interface McpCapabilities {
    managedIds?: readonly string[];
    editableIds?: readonly string[];
    editBlocked?: Readonly<Record<string, McpEditBlockedReason>>;
}
/** 一次开关的结果（与 dsh ChangeResult 的对应字段一一映射）。 */
export interface McpToggleOutcome {
    application: McpApplication;
    restartReason?: string;
    /** dsh 的诊断文本（缺省时用 errorCode 说明原因）。 */
    error?: string;
    /** dsh 的错误分类：`unaddressable` / `management-required` / `unknown-plugin` 等。 */
    errorCode?: string;
}
/**
 * 开关前拒绝调用：目标是未知的、或不是 MCP 行。
 * 路由按 status 回 HTTP 状态，而不是把「找不到」报成 500。
 */
export declare class McpAccessError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
/**
 * MCP 域的 host 访问面：路由只依赖这两个方法，测试注入假实现。
 * 生产实现见 ./mcp-runtime.ts。
 */
export interface McpAccess {
    list(): Promise<McpListFacts>;
    setEnabled(entryId: string, enabled: boolean): Promise<McpToggleOutcome>;
}
/** 一次保存/删除的结果（与开关结果同形，界面复用同一套提示）。 */
export interface McpSaveOutcome {
    application: McpApplication;
    /** 新建时是新生成的 id；编辑/删除时回显请求里的 id。 */
    entryId: string;
    restartReason?: string;
}
/**
 * MCP 域的写入口：新建/编辑/删除服务器行。
 *
 * 两条路径：本插件受管块里的行直接重写块；其余行交给 dsh 的 config-editor
 * （官方校验 + 原子写 + Loader 热应用）。生产实现见 ./mcp-config.ts。
 */
export interface McpConfigurator {
    save(server: McpServerInput, entryId?: string): Promise<McpSaveOutcome>;
    remove(entryId: string): Promise<McpSaveOutcome>;
}
/** `!!js` 字段在面板上的占位文本（不执行表达式，也不假装知道它的值）。 */
export declare const JS_EXPR_PLACEHOLDER = "\u27EA!!js\u27EB";
/**
 * 把事实集折成面板数据。
 *
 * 规则：
 *   - 认不出 serverName 的行跳过并告警（没有命名空间就无法归属工具）；
 *   - 同名服务器保留第一行并告警（dsh 激活时会拒绝第二个）；
 *   - 工具按 `mcp__<serverName>__` 归属，最长前缀优先；归不上的进 orphanTools。
 * @param facts - Loader 行事实，顺序即 Loader 顺序。
 * @param tools - 当前注册的工具表。
 * @param capabilities - 受管行与可编辑行（缺省：全部不可编辑）。
 * @returns 服务器列表、未归属工具与告警。
 */
export declare function projectMcpServers(facts: readonly McpServerFacts[], tools?: readonly McpToolFact[], capabilities?: McpCapabilities): McpProjection;
/** 合并投影与环境信息，得到 GET /mcp 的完整响应体。 */
export declare function buildMcpResponse(facts: McpListFacts): McpResponse;
//# sourceMappingURL=mcp.d.ts.map
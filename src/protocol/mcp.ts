/**
 * MCP 分类页的线上形状。
 *
 * MCP 服务器在 dsh 里不是一份配置清单，而是 Loader 里一行一个
 * `@deepseek-ai/dsh-mcp-client` 插件实例。这一页读到的是**运行中的投影**：
 * 行（启用态、阶段、能否寻址）+ 行配置 + 该命名空间当前注册的工具。
 *
 * 两个入口：GET /api/skill-hub/mcp（列表）与 POST /api/skill-hub/mcp/toggle
 * （开关）。开关走 dsh 插件管理接口，不直接改配置文件。
 *
 * 字段命名与 dsh 的 PluginInventoryEntry / ToolSchema 对齐，但在这里重新拼成
 * 纯 JSON 形状——浏览器半不能依赖宿主 SDK 包。
 */

/** Loader 行的运行阶段（与 dsh 的 PluginFiberPhase 同值；null = 没有活 fiber）。 */
export type McpPhase = 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null

/**
 * 为什么这行不能从面板改：
 *   - `management-required`：dsh 自己的管理插件，禁止经 profile 补丁改动；
 *   - `unaddressable`：补丁里这行没有可定位的 id（如外部产品写入的 insert 行），
 *     或它来自 bundle 层；
 *   - `no-manager`：本部署根本没有插件管理服务，这一页只能读（本插件自定义的
 *     降级值，不属于 dsh 的 ReadOnlyReason）。
 */
export type McpReadOnlyReason = 'management-required' | 'unaddressable' | 'no-manager'

/**
 * 面板展示用的状态。**注意**：没有连接状态 API，`running` 只表示这一行插件
 * 起来了（并带着当前注册的工具数），不表示 MCP 会话一定连着。
 */
export type McpStatus = 'running' | 'starting' | 'failed' | 'disabled'

/** dsh 只支持这两种传输。 */
export type McpTransport = 'stdio' | 'streamable-http'

/** 一个工具：公开名（模型看到的名字）、原始名与参数名清单。 */
export interface McpToolInfo {
  /** 注册进 ctx.tools 的公开名：`mcp__<serverName>__<rawName>`。 */
  name: string
  /** 服务器 tools/list 里的原始名。 */
  rawName: string
  description: string
  /** 参数对象的顶层键（来自 JSON Schema 的 properties），不含完整 schema。 */
  paramNames: string[]
}

/** stdio 传输的配置摘要。 */
export interface McpStdioConfig {
  command: string
  args: string[]
  cwd: string
  /** 环境变量（原样，含值）：经回环 + 会话栅栏返回，界面默认遮掩。 */
  env: Record<string, string>
}

/** Streamable HTTP 传输的配置摘要。 */
export interface McpHttpConfig {
  url: string
  /** 附加请求头（原样，含值）：同上。 */
  headers: Record<string, string>
}

/** 一个 MCP 服务器在面板里的完整形状。 */
export interface McpServerInfo {
  /** Loader 条目 id（开关接口认它）。 */
  entryId: string
  serverName: string
  transport: McpTransport
  enabled: boolean
  phase: McpPhase
  status: McpStatus
  /** 能经插件管理接口定位时给出的补丁行 id；缺失即不可开关。 */
  patchId?: string
  readOnlyReason?: McpReadOnlyReason
  stdio?: McpStdioConfig
  http?: McpHttpConfig
  toolCallTimeoutMs: number
  failOnStartupError: boolean
  /** 当前归属到这个名字空间的工具。 */
  tools: McpToolInfo[]
}

/** GET /api/skill-hub/mcp 的响应。 */
export interface McpResponse {
  ok: true
  servers: McpServerInfo[]
  /** `mcp__` 开头却归属不到任何已知服务器的工具（超长名截断后前缀失效等）。 */
  orphanTools: string[]
  /** profile 补丁文件绝对路径（UI 显示来源用）；没有 profileContext 时为 null。 */
  configPath: string | null
  /** dsh 插件管理服务可用（开关能不能用）。 */
  canManage: boolean
  /** 降级原因与解析失败的行（原文英文，UI 按行展示）。 */
  warnings: string[]
}

/** POST /api/skill-hub/mcp/toggle 的请求体。 */
export interface McpToggleRequest {
  entryId: string
  enabled: boolean
}

/** dsh 插件管理返回的应用结果（ChangeResult.application）。 */
export type McpApplication = 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'

/** POST /api/skill-hub/mcp/toggle 的响应：结果 + 刷新后的列表。 */
export interface McpToggleResponse {
  ok: true
  application: McpApplication
  /** 需要重启时的原因（dsh 的 RestartReason）。 */
  restartReason?: string
  /** application='failed' 时的诊断文本（dsh 的 ManagementError.diagnostic）。 */
  error?: string
  /**
   * application='failed' 时的错误分类（dsh 的 ManagementError.code）。dsh 对
   * 「不可寻址 / 受保护 / 找不到行」只给 code、不给 diagnostic，所以两者都要
   * 带上，界面才能说出真实原因。
   */
  errorCode?: string
  mcp: McpResponse
}

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

/**
 * 面板为什么不能编辑这一行的配置：
 *   - `unaddressable`：补丁里没有唯一 id，dsh 的配置编辑服务定位不到；
 *   - `no-editor`：本部署没有 dsh 的配置编辑服务（config-editor 未装载）；
 *   - `invalid-config`：这一行在本插件的受管块里被手工改成了无法安全重写的形状
 *     （例如写进了 `!!js` 表达式）。
 */
export type McpEditBlockedReason = 'unaddressable' | 'no-editor' | 'invalid-config'

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
  /** 这一行在本插件的受管块里：可以改、可以删。 */
  managed: boolean
  /** 面板能改这一行的配置（受管行或能被 dsh 配置编辑服务定位的行）。 */
  editable: boolean
  /** 能从面板删除这一行（只有受管行可以）。 */
  removable: boolean
  /** editable=false 的原因。 */
  editBlockedReason?: McpEditBlockedReason
  stdio?: McpStdioConfig
  http?: McpHttpConfig
  toolCallTimeoutMs: number
  failOnStartupError: boolean
  /** 归属给模型的服务说明上限（字节）；未配置时缺省。 */
  maxInstructionBytes?: number
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

/** 面板提交的一台服务器配置；字段按传输取舍（stdio 用 command/args/env/cwd）。 */
export interface McpServerInput {
  /** `[A-Za-z0-9_-]{1,32}`；决定工具名的命名空间。 */
  serverName: string
  transport: McpTransport
  /** stdio：可执行文件。 */
  command?: string
  /** stdio：参数（不经 shell 展开）。 */
  args?: string[]
  /** stdio：工作目录。 */
  cwd?: string
  /** stdio：追加在清洗过的环境变量之上。 */
  env?: Record<string, string>
  /** streamable-http：MCP 端点。 */
  url?: string
  /** streamable-http：附加请求头。 */
  headers?: Record<string, string>
  /** 单次工具调用/资源请求的超时（毫秒）；null 表示清掉、用 dsh 默认值。 */
  toolCallTimeoutMs?: number | null
  /** 首次连接或工具同步失败时是否让插件激活失败。 */
  failOnStartupError?: boolean
  /** 归属给模型的服务说明的最大字节数；null 表示清掉。 */
  maxInstructionBytes?: number | null
}

/** 字段级校验失败的原因（文案在浏览器半翻译）。 */
export type McpFieldErrorCode = 'required' | 'invalid' | 'duplicate' | 'range'

/** 一个字段的校验失败。 */
export interface McpFieldError {
  /** 字段路径：`serverName`、`toolCallTimeoutMs`、`env.PATH`。 */
  field: string
  code: McpFieldErrorCode
}

/** POST /api/skill-hub/mcp/save 的请求体；entryId 缺省表示新建。 */
export interface McpSaveRequest {
  entryId?: string
  server: McpServerInput
}

/** 保存/删除成功后的应用结果 + 刷新后的列表。 */
export interface McpSaveResponse {
  ok: true
  application: McpApplication
  /** 新建时由 host 生成，编辑/删除时回显请求里的 id。 */
  entryId: string
  /** application='restart-required' 时的原因。 */
  restartReason?: string
  mcp: McpResponse
}

/** POST /api/skill-hub/mcp/remove 的请求体。 */
export interface McpRemoveRequest {
  entryId: string
}

/** POST /api/skill-hub/mcp/remove 的响应。 */
export interface McpRemoveResponse {
  ok: true
  application: McpApplication
  restartReason?: string
  mcp: McpResponse
}

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

/**
 * Pure MCP projection from legacy Loader rows, sanitized native manager views,
 * and current tools. Manager rows stay read-only and carry no inferred config.
 */

import type {
  McpApplication,
  McpEditBlockedReason,
  McpPhase,
  McpReadOnlyReason,
  McpResponse,
  McpServerInfo,
  McpServerInput,
  McpStatus,
  McpToolInfo,
  McpTransport,
} from './protocol.ts'

/** dsh 的 MCP 客户端插件模块名（每个服务器一行）。 */
export const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/** MCP 工具的公开名前缀；完整形状是 `mcp__<serverName>__<rawName>`。 */
export const MCP_TOOL_PREFIX = 'mcp__'

/** dsh 的 serverName 约束（也决定工具名的命名空间边界）。 */
export const MCP_SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/

/** dsh 的 toolCallTimeoutMs 默认值。 */
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

/** 一行 Loader 里读到的事实（config 是补丁原文，可能缺字段）。 */
export interface McpServerFacts {
  /** Loader 条目 id（开关接口的唯一键）。 */
  entryId: string
  /** 行配置原文。 */
  config: unknown
  enabled: boolean
  phase: McpPhase
  /** 能经插件管理接口定位时的补丁行 id。 */
  patchId?: string
  readOnlyReason?: McpReadOnlyReason
}

/** 工具表里的一行（ctx.tools.schemas() 的可见子集）。 */
export interface McpToolFact {
  name: string
  description?: string
  /** 工具参数的 JSON Schema（只取顶层 properties 的键）。 */
  parameters?: unknown
}

/** 投影结果（响应中除环境信息外的全部字段）。 */
export interface McpProjection {
  servers: McpServerInfo[]
  orphanTools: string[]
  warnings: string[]
}

/** Sanitized native manager view; excludes configuration and credentials. */
export interface McpManagerServerFact {
  name: string
  configured: boolean
  status: { state: 'closed' | 'waiting-credentials' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'disabled' }
}

/** host 侧一次读取的完整事实集。 */
export interface McpListFacts {
  facts: McpServerFacts[]
  managerServers?: readonly McpManagerServerFact[]
  tools: McpToolFact[]
  /** profile 补丁文件绝对路径；取不到时为 null。 */
  configPath: string | null
  /** dsh 的插件管理服务可用。 */
  canManage: boolean
  /**
   * 可编辑性（相对"开关"是另一套判定）：
   *   - managedIds：本插件受管块里的行，改/删都走受管块；
   *   - editableIds：面板能改配置的行（受管行 + dsh 配置编辑服务能定位的行）；
   *   - editBlocked：不能改的行及原因（缺省按 unaddressable 处理）。
   */
  managedIds?: readonly string[]
  editableIds?: readonly string[]
  editBlocked?: Readonly<Record<string, McpEditBlockedReason>>
  /** 读取阶段（缺服务、某行读失败）产生的告警。 */
  warnings: string[]
}

/** 投影要知道的可写能力（列表事实里的可编辑性字段）。 */
export interface McpCapabilities {
  managerServers?: readonly McpManagerServerFact[]
  managedIds?: readonly string[]
  editableIds?: readonly string[]
  editBlocked?: Readonly<Record<string, McpEditBlockedReason>>
}

/** 一次开关的结果（与 dsh ChangeResult 的对应字段一一映射）。 */
export interface McpToggleOutcome {
  application: McpApplication
  restartReason?: string
  /** dsh 的诊断文本（缺省时用 errorCode 说明原因）。 */
  error?: string
  /** dsh 的错误分类：`unaddressable` / `management-required` / `unknown-plugin` 等。 */
  errorCode?: string
}

/**
 * 开关前拒绝调用：目标是未知的、或不是 MCP 行。
 * 路由按 status 回 HTTP 状态，而不是把「找不到」报成 500。
 */
export class McpAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'McpAccessError'
  }
}

/**
 * MCP 域的 host 访问面：路由只依赖这两个方法，测试注入假实现。
 * 生产实现见 ./mcp-runtime.ts。
 */
export interface McpAccess {
  list(): Promise<McpListFacts>
  setEnabled(entryId: string, enabled: boolean): Promise<McpToggleOutcome>
}

/** 一次保存/删除的结果（与开关结果同形，界面复用同一套提示）。 */
export interface McpSaveOutcome {
  application: McpApplication
  /** 新建时是新生成的 id；编辑/删除时回显请求里的 id。 */
  entryId: string
  restartReason?: string
}

/**
 * MCP 域的写入口：新建/编辑/删除服务器行。
 *
 * 两条路径：本插件受管块里的行直接重写块；其余行交给 dsh 的 config-editor
 * （官方校验 + 原子写 + Loader 热应用）。生产实现见 ./mcp-config.ts。
 */
export interface McpConfigurator {
  save(server: McpServerInput, entryId?: string): Promise<McpSaveOutcome>
  remove(entryId: string): Promise<McpSaveOutcome>
}

/**
 * 补丁里的 `!!js` 表达式在 Loader 的条目配置里原样保留成 `{ __jsExpr }`
 * （解析成值发生在 fiber 激活时，面板读到的是原文）。识别它，才能把这类字段
 * 显示成占位符，而不是当成"缺字段"。
 */
function isJsExpr(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as { __jsExpr?: unknown }).__jsExpr === 'string'
}

/** `!!js` 字段在面板上的占位文本（不执行表达式，也不假装知道它的值）。 */
export const JS_EXPR_PLACEHOLDER = '⟪!!js⟫'

/** 配置里是否嵌了 `!!js` 表达式（这类行不从表单改，避免把表达式写成字面量）。 */
function containsJsExpr(value: unknown, depth = 0): boolean {
  if (depth > 6) return false
  if (isJsExpr(value)) return true
  if (Array.isArray(value)) return value.some((entry) => containsJsExpr(entry, depth + 1))
  const record = asRecord(value)
  if (record === undefined) return false
  return Object.values(record).some((entry) => containsJsExpr(entry, depth + 1))
}

/** 读一个纯对象；数组与 null 都不算。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** 读一个字符串字段（trim 后非空才算）；`!!js` 表达式读成占位符。 */
function readText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (isJsExpr(value)) return JS_EXPR_PLACEHOLDER
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text === '' ? undefined : text
}

/** 字段存在且可展示（字符串或 `!!js` 表达式）。 */
function hasText(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return (typeof value === 'string' && value.trim() !== '') || isJsExpr(value)
}

/** 读字符串数组（非字符串项丢弃，`!!js` 表达式读成占位符）。 */
function readTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => typeof entry === 'string' ? [entry] : isJsExpr(entry) ? [JS_EXPR_PLACEHOLDER] : [])
}

/** 读字符串字典（非字符串值丢弃，`!!js` 表达式读成占位符）。 */
function readTextMap(value: unknown): Record<string, string> {
  const record = asRecord(value)
  if (record === undefined) return {}
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string') out[key] = entry
    else if (isJsExpr(entry)) out[key] = JS_EXPR_PLACEHOLDER
  }
  return out
}

/** 读一个毫秒数（正数才算）。 */
function readCount(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/** 工具参数的顶层键（JSON Schema 的 properties）。 */
function paramNamesOf(parameters: unknown): string[] {
  const record = asRecord(parameters)
  if (record === undefined) return []
  const properties = asRecord(record.properties)
  return properties === undefined ? [] : Object.keys(properties)
}

/** 面板状态推导：只有"插件起来了"与"没有工具"这两件事是确定的。 */
function statusOf(enabled: boolean, phase: McpPhase): McpStatus {
  if (!enabled) return 'disabled'
  if (phase === 'failed') return 'failed'
  return phase === 'active' ? 'running' : 'starting'
}

/**
 * 传输方式：先认显式值，再按配置形状兜底（缺 transport，或 transport 本身是
 * `!!js` 表达式时按 command/url 的形状判断，并在告警里说明推断过）。
 */
function transportOf(raw: Record<string, unknown>): { transport?: McpTransport; note?: string } {
  const declared = raw.transport
  if (declared === 'stdio' || declared === 'streamable-http') return { transport: declared }
  if (declared !== undefined && !isJsExpr(declared)) return {}
  const inferred: McpTransport | undefined = hasText(raw, 'command') ? 'stdio' : hasText(raw, 'url') ? 'streamable-http' : undefined
  if (inferred === undefined) return {}
  return isJsExpr(declared) ? { transport: inferred, note: 'transport is a !!js expression; inferred from the config shape' } : { transport: inferred }
}

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
export function projectMcpServers(
  facts: readonly McpServerFacts[],
  tools: readonly McpToolFact[] = [],
  capabilities: McpCapabilities = {},
): McpProjection {
  const warnings: string[] = []
  const servers: McpServerInfo[] = []
  const byName = new Map<string, McpServerInfo>()
  const ambiguousNames = new Set<string>()
  const managedIds = new Set(capabilities.managedIds ?? [])
  const editableIds = new Set(capabilities.editableIds ?? [])
  const editBlocked = capabilities.editBlocked ?? {}

  for (const fact of facts) {
    const raw = asRecord(fact.config)
    if (raw === undefined) {
      warnings.push(`ignored MCP entry "${fact.entryId}": config is not an object`)
      continue
    }
    if (isJsExpr(raw.serverName)) {
      warnings.push(`ignored MCP entry "${fact.entryId}": serverName is a !!js expression; its tools cannot be attributed`)
      continue
    }
    const serverName = readText(raw, 'serverName')
    if (serverName === undefined || !MCP_SERVER_NAME_RE.test(serverName)) {
      warnings.push(`ignored MCP entry "${fact.entryId}": serverName is missing or outside [A-Za-z0-9_-]{1,32}`)
      continue
    }
    if (byName.has(serverName)) {
      warnings.push(`MCP server "${serverName}" is configured more than once; entry "${fact.entryId}" is hidden behind "${byName.get(serverName)?.entryId ?? ''}"`)
      continue
    }
    const { transport, note } = transportOf(raw)
    if (transport === undefined) {
      warnings.push(`ignored MCP entry "${fact.entryId}": unknown transport ${JSON.stringify(raw.transport)}`)
      continue
    }
    if (note !== undefined) warnings.push(`MCP entry "${fact.entryId}": ${note}`)
    // 面板/开关用的 entryId 带树前缀（`include:`），补丁与配置编辑服务用
    // 补丁行 id；可写性按后者判定。
    const addressId = fact.patchId ?? fact.entryId
    const server: McpServerInfo = {
      entryId: fact.entryId,
      serverName,
      transport,
      enabled: fact.enabled,
      phase: fact.phase,
      status: statusOf(fact.enabled, fact.phase),
      toolCallTimeoutMs: readCount(raw, 'toolCallTimeoutMs') ?? DEFAULT_TOOL_CALL_TIMEOUT_MS,
      failOnStartupError: raw.failOnStartupError === true,
      managed: managedIds.has(addressId),
      editable: editableIds.has(addressId),
      removable: managedIds.has(addressId),
      tools: [],
    }
    if (!server.editable) server.editBlockedReason = editBlocked[addressId] ?? 'unaddressable'
    const maxInstructionBytes = readCount(raw, 'maxInstructionBytes')
    if (maxInstructionBytes !== undefined) server.maxInstructionBytes = maxInstructionBytes
    // 含 !!js 的行只能读/开关：表单拿不到表达式的真实值，回写会把表达式变成字面量。
    if (containsJsExpr(raw)) {
      server.editable = false
      server.editBlockedReason = 'invalid-config'
    }
    if (fact.patchId !== undefined) server.patchId = fact.patchId
    if (fact.readOnlyReason !== undefined) server.readOnlyReason = fact.readOnlyReason
    if (transport === 'stdio') {
      server.stdio = {
        command: readText(raw, 'command') ?? '',
        args: readTextList(raw.args),
        cwd: readText(raw, 'cwd') ?? '',
        env: readTextMap(raw.env),
      }
    } else {
      server.http = {
        url: readText(raw, 'url') ?? '',
        headers: readTextMap(raw.headers),
      }
    }
    byName.set(serverName, server)
    servers.push(server)
  }

  // Native manager entries have no writable Loader patch identity.
  for (const fact of capabilities.managerServers ?? []) {
    if (byName.has(fact.name)) {
      warnings.push(`MCP server "${fact.name}" appears in both Loader and native manager inventories; tool attribution is ambiguous`)
      ambiguousNames.add(fact.name)
    }
    const state = fact.status.state
    const server: McpServerInfo = {
      entryId: 'mcp-manager:' + fact.name,
      serverName: fact.name,
      source: 'mcp-manager',
      managerEntryPresent: fact.configured,
      enabled: fact.configured && state !== 'disabled',
      phase: null,
      status: state === 'connecting' ? 'starting' : state,
      readOnlyReason: 'native-manager',
      managed: false, editable: false, removable: false, tools: [],
    }
    byName.set(fact.name, server)
    servers.push(server)
  }

  // 归属：最长命名空间优先（serverName 本身允许下划线，`a` 与 `a__b` 可能同时存在）。
  const prefixes = [...servers]
    .filter(server => !ambiguousNames.has(server.serverName))
    .map((server) => ({ server, prefix: MCP_TOOL_PREFIX + server.serverName + '__' }))
    .sort((left, right) => right.prefix.length - left.prefix.length)
  const orphanTools: string[] = []
  for (const tool of tools) {
    if (!tool.name.startsWith(MCP_TOOL_PREFIX)) continue
    const owner = prefixes.find((entry) => tool.name.startsWith(entry.prefix))
    if (owner === undefined) {
      orphanTools.push(tool.name)
      continue
    }
    const info: McpToolInfo = {
      name: tool.name,
      rawName: tool.name.slice(owner.prefix.length),
      description: tool.description ?? '',
      paramNames: paramNamesOf(tool.parameters),
    }
    owner.server.tools.push(info)
  }
  // 工具顺序跟随注册顺序；服务器顺序仍是 Loader 顺序。
  orphanTools.sort()

  return { servers, orphanTools, warnings }
}

/** 合并投影与环境信息，得到 GET /mcp 的完整响应体。 */
export function buildMcpResponse(facts: McpListFacts): McpResponse {
  const projection = projectMcpServers(facts.facts, facts.tools, {
    managerServers: facts.managerServers,
    managedIds: facts.managedIds,
    editableIds: facts.editableIds,
    editBlocked: facts.editBlocked,
  })
  return {
    ok: true,
    servers: projection.servers,
    orphanTools: projection.orphanTools,
    configPath: facts.configPath,
    canManage: facts.canManage,
    warnings: [...facts.warnings, ...projection.warnings],
  }
}

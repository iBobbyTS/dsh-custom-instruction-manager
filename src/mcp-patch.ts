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

import yaml from 'js-yaml'
import type { McpFieldError, McpServerInput, McpTransport } from './protocol.ts'
import { MCP_CLIENT_MODULE, MCP_SERVER_NAME_RE } from './mcp.ts'

/** 受管块起始标记（整行比较，允许前后空白）。 */
export const MANAGED_START = '# @managed-by: custom-instruction-manager (mcp)'

/** 受管块结束标记。 */
export const MANAGED_END = '# @end-managed-by: custom-instruction-manager (mcp)'

/** 写在起始标记下面的说明行（每次重写都会重建）。 */
export const MANAGED_NOTE = '# 本块由「自定义指令管理器」按面板保存重写；块外内容原样保留，请勿在块内手改。'

/** 面板生成的行 id 前缀：即使标记被弄丢，也能看出这些行是本插件建的。 */
export const HUB_ENTRY_PREFIX = 'mcp-hub-'

/** 补丁里允许的超时上限（毫秒，2^31-1）。 */
const MAX_TIMEOUT_MS = 2_147_483_647

/** 请求头名的 token 字符集（RFC 7230）。 */
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/** 受管块里的一行：id + 原始 config（保留未知字段，例如 reconnect）。 */
export interface ManagedServer {
  id: string
  config: Record<string, unknown>
}

/** 解析/读取问题（英文原文，路由按 409 回给界面）。 */
export class McpPatchError extends Error {
  constructor(message: string, readonly status = 409, /** 字段级错误时指向表单字段。 */ readonly field?: string) {
    super(message)
    this.name = 'McpPatchError'
  }
}

/** 一行文本的标记命中（trim 后完全相等才算）。 */
function markerOf(line: string): 'start' | 'end' | undefined {
  const text = line.trim()
  if (text === MANAGED_START) return 'start'
  if (text === MANAGED_END) return 'end'
  return undefined
}

/** 受管块在内层文本里的位置：起始标记、我们的 `- insert:` 条目、可选结束标记。 */
interface BlockRange {
  /** 起始标记行号。 */
  start: number
  /** `- insert:` 行号（空块时缺省）。 */
  insertStart?: number
  /** insert 条目结束（不含）的行号。 */
  insertEnd?: number
  /** 结束标记行号（老文件可能没有）。 */
  end?: number
}

/**
 * 定位受管块。
 *
 * **不能只用两条标记围出区间**：dsh 的 config-editor 把新行 append 到
 * YAML 序列末尾，而结束标记是一条尾随注释，于是别人写的覆盖行会落在两条
 * 标记之间。所以真正的块是「起始标记之后的那一个 `- insert:` 条目」，标记
 * 之间多出来的内容属于别的写入器，读写都必须原样保留。
 * @param lines - 补丁文件的每一行。
 * @returns 位置；没有起始标记时 undefined。
 */
function locateBlock(lines: readonly string[]): BlockRange | undefined {
  let start = -1
  let end = -1
  for (let index = 0; index < lines.length; index += 1) {
    const marker = markerOf(lines[index] ?? '')
    if (marker === 'start') {
      if (start >= 0) throw new McpPatchError('the MCP managed block is declared twice; keep one start marker')
      start = index
    } else if (marker === 'end') {
      if (start < 0) throw new McpPatchError('the MCP managed block has an end marker but no start marker')
      end = index
      break
    }
  }
  if (start < 0) return undefined
  const limit = end < 0 ? lines.length : end
  let insertStart = -1
  for (let index = start + 1; index < limit; index += 1) {
    if (/^-\s*insert\s*:/.test(lines[index] ?? '')) {
      insertStart = index
      break
    }
  }
  if (insertStart < 0) return { start, ...(end >= 0 ? { end } : {}) }
  let insertEnd = insertStart + 1
  while (insertEnd < limit) {
    const line = lines[insertEnd] ?? ''
    if (line.trim() === '' || /^\s/.test(line)) {
      insertEnd += 1
      continue
    }
    break
  }
  return { start, insertStart, insertEnd, ...(end >= 0 ? { end } : {}) }
}

/** 纯对象判定。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** 块内 `- insert:` 条目的文本（没有条目时为空串）。 */
function insertText(lines: readonly string[], range: BlockRange): string {
  if (range.insertStart === undefined || range.insertEnd === undefined) return ''
  return lines.slice(range.insertStart, range.insertEnd).join('\n')
}

/**
 * 读受管块里的服务器行。
 *
 * 只接受 `name: @deepseek-ai/dsh-mcp-client` 且带字符串 id 的行；块里出现别的
 * 插件（或没有 id 的行）时整块报错，而不是悄悄丢掉——那是人手改过的痕迹。
 * @param text - 补丁文件全文。
 * @returns 受管行（没有块时为空数组）。
 */
export function readManagedBlock(text: string): ManagedServer[] {
  const lines = text.split('\n')
  const range = locateBlock(lines)
  if (range === undefined) return []
  const body = insertText(lines, range)
  if (body.includes('!!js')) throw new McpPatchError('the MCP managed block contains a !!js expression; rewrite it outside the block or edit it by hand')
  let parsed: unknown
  try {
    parsed = yaml.load(body)
  } catch (error) {
    throw new McpPatchError('the MCP managed block is not valid YAML: ' + (error instanceof Error ? error.message : String(error)))
  }
  if (parsed === undefined || parsed === null) return []
  if (!Array.isArray(parsed)) throw new McpPatchError('the MCP managed block must hold a YAML list')
  const servers: ManagedServer[] = []
  for (const entry of parsed) {
    const record = asRecord(entry)
    const insert = record === undefined ? undefined : record.insert
    if (!Array.isArray(insert)) throw new McpPatchError('the MCP managed block must hold `- insert:` entries only')
    for (const row of insert) {
      const item = asRecord(row)
      if (item === undefined) throw new McpPatchError('the MCP managed block holds a non-map row')
      const name = item.name
      if (name !== MCP_CLIENT_MODULE) {
        throw new McpPatchError('the MCP managed block holds a row for "' + String(name) + '"; only ' + MCP_CLIENT_MODULE + ' rows belong here')
      }
      const id = item.id
      if (typeof id !== 'string' || id.trim() === '') throw new McpPatchError('an MCP row in the managed block has no string id')
      const config = asRecord(item.config)
      if (config === undefined) throw new McpPatchError('MCP row "' + id + '" has no config object')
      servers.push({ id, config })
    }
  }
  const seen = new Set<string>()
  for (const server of servers) {
    if (seen.has(server.id)) throw new McpPatchError('the MCP managed block repeats the id "' + server.id + '"')
    seen.add(server.id)
  }
  return servers
}

/**
 * 把受管行渲染成块文本（含两条标记与说明行）。
 * @param servers - 受管行，顺序即写入顺序。
 * @returns 可以直接拼进补丁文件的文本（不含首尾空行）。
 */
export function renderManagedBlock(servers: readonly ManagedServer[]): string {
  const entry = renderInsert(servers)
  const lines = [MANAGED_START, MANAGED_NOTE, ...(entry === '' ? [] : entry.split('\n')), MANAGED_END]
  return lines.join('\n')
}

/** 只渲染 `- insert:` 条目（没有服务器时为空串）。 */
function renderInsert(servers: readonly ManagedServer[]): string {
  if (servers.length === 0) return ''
  return yaml.dump([{ insert: servers.map((server) => ({ id: server.id, name: MCP_CLIENT_MODULE, config: server.config })) }], {
    lineWidth: -1,
    noRefs: true,
    quotingType: '\'',
    forceQuotes: false,
  }).replace(/\n$/, '')
}

/**
 * 用新的受管行替换补丁里的块；没有块时追加到文件末尾。
 * @param text - 补丁文件全文。
 * @param servers - 新的受管行（空数组表示清空块内容，保留标记）。
 * @returns 新的文件全文。
 */
export function writeManagedBlock(text: string, servers: readonly ManagedServer[]): string {
  const lines = text.split('\n')
  const range = locateBlock(lines)
  if (range === undefined) {
    const block = renderManagedBlock(servers)
    const base = text.replace(/[ \t]+$/, '')
    if (base.trim() === '') return block + '\n'
    return base.replace(/\n*$/, '\n') + '\n' + block + '\n'
  }
  // 只替换我们的 insert 条目；标记之间的其他内容（别的写入器 append 的
  // 覆盖行、注释、`!!js`）逐字保留。
  const entry = renderInsert(servers)
  if (range.insertStart !== undefined && range.insertEnd !== undefined) {
    const next = [
      ...lines.slice(0, range.insertStart),
      ...(entry === '' ? [] : entry.split('\n')),
      ...lines.slice(range.insertEnd),
    ]
    return next.join('\n')
  }
  if (entry === '') return lines.join('\n')
  const at = range.start + (lines[range.start + 1]?.trim().startsWith('#') === true ? 2 : 1)
  const next = [...lines.slice(0, at), ...entry.split('\n'), ...lines.slice(at)]
  return next.join('\n')
}

/** 由 serverName 生成行 id 的骨架（稳定、可读、只含 [a-z0-9-]）。 */
export function entryIdFor(serverName: string): string {
  const slug = serverName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  return HUB_ENTRY_PREFIX + (slug === '' ? 'server' : slug)
}

/**
 * 生成一个不与 `taken` 冲突的行 id。
 * @param serverName - 服务器名。
 * @param taken - 现存的 Loader 条目 id 与受管行 id。
 * @returns `mcp-hub-<slug>`，冲突时追加 `-2`、`-3`…
 */
export function uniqueEntryId(serverName: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = entryIdFor(serverName)
  if (!used.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = base + '-' + String(index)
    if (!used.has(candidate)) return candidate
  }
  return base + '-' + String(Date.now())
}

/** 字符串字段（去首尾空白；空串视为缺省）。 */
function textOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text === '' ? undefined : text
}

/** 字符串数组：非字符串项返回 undefined（报 invalid，而不是静默丢弃）。 */
function listOf(value: unknown): string[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value)) return undefined
  return value.every((entry): entry is string => typeof entry === 'string') ? [...value] : undefined
}

/** 字符串字典：键值都必须是字符串。 */
function mapOf(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return {}
  const record = asRecord(value)
  if (record === undefined) return undefined
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string') return undefined
    out[key] = entry
  }
  return out
}

/**
 * 可选的数字字段：缺省 = 不动；null = 清掉；正整数 = 设置；其余算非法。
 * @param value - 请求体里的原始值。
 * @returns `undefined`/`null`/数字，或 `false`（非法）。
 */
function optionalCount(value: unknown): number | null | undefined | false {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TIMEOUT_MS) return value
  return false
}

/** 校验失败的累加器。 */
class FieldErrors {
  readonly list: McpFieldError[] = []
  add(field: string, code: McpFieldError['code']): void {
    this.list.push({ field, code })
  }
}

/**
 * 校验并归一化面板提交的一台服务器配置。
 *
 * 只保留当前传输用得上的字段：stdio 丢掉 url/headers，HTTP 丢掉 command/args/
 * env/cwd——避免把上一次的配置带进新传输。
 * @param value - 请求体里的 `server`（JSON 未知形状）。
 * @returns 归一化配置；字段有错时 `errors` 非空、`server` 为 undefined。
 */
export function normalizeServerInput(value: unknown): { server?: McpServerInput; errors: McpFieldError[] } {
  const errors = new FieldErrors()
  const record = asRecord(value)
  if (record === undefined) {
    errors.add('server', 'invalid')
    return { errors: errors.list }
  }
  const serverName = textOf(record.serverName)
  if (serverName === undefined) errors.add('serverName', 'required')
  else if (!MCP_SERVER_NAME_RE.test(serverName)) errors.add('serverName', 'invalid')

  const transportRaw = record.transport
  const transport: McpTransport | undefined = transportRaw === 'stdio' || transportRaw === 'streamable-http' ? transportRaw : undefined
  if (transportRaw === undefined) errors.add('transport', 'required')
  else if (transport === undefined) errors.add('transport', 'invalid')

  const timeout = optionalCount(record.toolCallTimeoutMs)
  if (timeout === false) errors.add('toolCallTimeoutMs', 'range')

  const maxInstruction = optionalCount(record.maxInstructionBytes)
  if (maxInstruction === false) errors.add('maxInstructionBytes', 'range')

  const failRaw = record.failOnStartupError
  if (failRaw !== undefined && typeof failRaw !== 'boolean') errors.add('failOnStartupError', 'invalid')

  const server: McpServerInput = {
    serverName: serverName ?? '',
    transport: transport ?? 'stdio',
  }
  if (timeout !== false) server.toolCallTimeoutMs = timeout
  if (maxInstruction !== false) server.maxInstructionBytes = maxInstruction
  if (failRaw === true) server.failOnStartupError = true
  else if (failRaw === false) server.failOnStartupError = false

  if (transport === 'stdio') {
    const command = textOf(record.command)
    if (command === undefined) errors.add('command', 'required')
    else server.command = command
    const args = listOf(record.args)
    if (args === undefined) errors.add('args', 'invalid')
    else server.args = args
    const cwd = textOf(record.cwd)
    if (cwd !== undefined) server.cwd = cwd
    const env = mapOf(record.env)
    if (env === undefined) {
      errors.add('env', 'invalid')
    } else {
      for (const key of Object.keys(env)) {
        if (key.trim() === '' || key.includes('=') || key.includes('\n')) errors.add('env.' + key, 'invalid')
      }
      server.env = env
    }
  } else if (transport === 'streamable-http') {
    const url = textOf(record.url)
    if (url === undefined) {
      errors.add('url', 'required')
    } else {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.add('url', 'invalid')
        else server.url = url
      } catch {
        errors.add('url', 'invalid')
      }
    }
    const headers = mapOf(record.headers)
    if (headers === undefined) {
      errors.add('headers', 'invalid')
    } else {
      for (const [key, value] of Object.entries(headers)) {
        if (!HEADER_NAME_RE.test(key)) errors.add('headers.' + key, 'invalid')
        if (value.includes('\n') || value.includes('\r')) errors.add('headers.' + key, 'invalid')
      }
      server.headers = headers
    }
  }

  return errors.list.length > 0 ? { errors: errors.list } : { server, errors: [] }
}

/** 归一化配置 → 写进补丁的 config（只写显式给出的字段）。 */
export function configFromServer(server: McpServerInput): Record<string, unknown> {
  const config: Record<string, unknown> = { serverName: server.serverName, transport: server.transport }
  if (server.transport === 'stdio') {
    config.command = server.command ?? ''
    config.args = [...(server.args ?? [])]
    if (server.cwd !== undefined) config.cwd = server.cwd
    if (server.env !== undefined && Object.keys(server.env).length > 0) config.env = { ...server.env }
  } else {
    config.url = server.url ?? ''
    if (server.headers !== undefined && Object.keys(server.headers).length > 0) config.headers = { ...server.headers }
  }
  if (typeof server.toolCallTimeoutMs === 'number') config.toolCallTimeoutMs = server.toolCallTimeoutMs
  if (server.failOnStartupError !== undefined) config.failOnStartupError = server.failOnStartupError
  if (typeof server.maxInstructionBytes === 'number') config.maxInstructionBytes = server.maxInstructionBytes
  return config
}

/**
 * 把面板提交的配置覆盖到一份已有行配置上，保留未知字段（例如 `reconnect`）。
 * 换传输时清掉另一种传输的字段，避免把旧命令带进 HTTP 行。
 * @param base - 补丁里该行的原始 config。
 * @param server - 归一化后的提交值。
 * @returns 新的 config（不修改 base）。
 */
export function applyServerToConfig(base: Record<string, unknown>, server: McpServerInput): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base }
  if (base.transport !== server.transport) {
    for (const key of ['command', 'args', 'cwd', 'env', 'url', 'headers']) delete next[key]
  }
  next.serverName = server.serverName
  next.transport = server.transport
  if (server.transport === 'stdio') {
    next.command = server.command ?? ''
    next.args = [...(server.args ?? [])]
    if (server.cwd !== undefined && server.cwd !== '') next.cwd = server.cwd
    else delete next.cwd
    if (server.env !== undefined && Object.keys(server.env).length > 0) next.env = { ...server.env }
    else delete next.env
  } else {
    next.url = server.url ?? ''
    if (server.headers !== undefined && Object.keys(server.headers).length > 0) next.headers = { ...server.headers }
    else delete next.headers
  }
  if (server.toolCallTimeoutMs === null) delete next.toolCallTimeoutMs
  else if (server.toolCallTimeoutMs !== undefined) next.toolCallTimeoutMs = server.toolCallTimeoutMs
  if (server.failOnStartupError !== undefined) next.failOnStartupError = server.failOnStartupError
  if (server.maxInstructionBytes === null) delete next.maxInstructionBytes
  else if (server.maxInstructionBytes !== undefined) next.maxInstructionBytes = server.maxInstructionBytes
  return next
}

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

import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import yaml from 'js-yaml'
import type { McpServerInput } from './protocol.ts'
import {
  McpAccessError,
  MCP_CLIENT_MODULE,
  type McpConfigurator,
  type McpSaveOutcome,
} from './mcp.ts'
import {
  applyServerToConfig,
  configFromServer,
  McpPatchError,
  readManagedBlock,
  uniqueEntryId,
  writeManagedBlock,
  type ManagedServer,
} from './mcp-patch.ts'

/** Loader 条目子集（写入口只需要 id / 模块名 / 配置）。 */
interface LoaderEntryLike {
  id: string
  options?: { id?: string; name?: string; config?: unknown }
}

/** Loader 服务子集。 */
interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>
}

/** dsh config-editor 的子集（只用到读配置与改一行）。 */
interface ConfigEditorLike {
  entries(): LoaderEntryLike[]
  configuration(): Array<{ entry: LoaderEntryLike; inherited: Record<string, unknown>; override: Record<string, unknown> }>
  edit(
    entry: LoaderEntryLike,
    change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void>
}

/** profileContext 子集。 */
interface ProfileContextLike {
  patchPath?: string
}

/** HMR 服务子集（存在时让写盘与重载串行）。 */
interface HmrLike {
  runExclusive<T>(run: () => Promise<T>): Promise<T>
}

const JsExprType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: (data) => ({ __jsExpr: String(data) }),
})

/** 与 dsh 的补丁方言一致：允许 `!!js` 标量。 */
const PATCH_SCHEMA = yaml.DEFAULT_SCHEMA.extend([JsExprType])

/** 保存后等 Loader 应用的上限（HMR 通常在一两百毫秒内重组）。 */
const APPLY_TIMEOUT_MS = 6_000

/** 轮询间隔。 */
const APPLY_POLL_MS = 100

/** 纯对象判定。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** 错误文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 睡眠（HMR 应用轮询）。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/** 配置里是否嵌了 `!!js` 表达式（含表达式的行只能手工改：表单拿不到真实值）。 */
function hasExpression(value: unknown, depth = 0): boolean {
  if (depth > 6) return false
  if (typeof value === 'object' && value !== null && typeof (value as { __jsExpr?: unknown }).__jsExpr === 'string') return true
  if (Array.isArray(value)) return value.some((entry) => hasExpression(entry, depth + 1))
  const record = asRecord(value)
  if (record === undefined) return false
  return Object.values(record).some((entry) => hasExpression(entry, depth + 1))
}

/** 等待 Loader 应用的上限与轮询间隔（测试可缩短）。 */
export interface McpConfigOptions {
  applyTimeoutMs?: number
  pollMs?: number
}

/**
 * Build the MCP configurator over a context service reader.
 * @param get - reads one service off the plugin context (`ctx.get`).
 * @param options - apply-wait bound (tests shorten it).
 * @returns save/remove over MCP rows, either through the managed block or dsh's config editor.
 */
export function createMcpConfig(get: (name: string) => unknown, options: McpConfigOptions = {}): McpConfigurator {
  /** 进程内串行化：两次保存不会同时读改写同一个文件。 */
  let chain: Promise<unknown> = Promise.resolve()
  const serialize = <T>(run: () => Promise<T>): Promise<T> => {
    const next = chain.then(run, run)
    chain = next.catch(() => undefined)
    return next
  }

  const loader = (): LoaderLike => {
    const service = get('loader') as LoaderLike | undefined
    if (service === undefined) throw new Error('loader service is absent: MCP rows cannot be read')
    return service
  }

  const patchPath = (): string => {
    const profile = get('profileContext') as ProfileContextLike | undefined
    if (profile?.patchPath === undefined) throw new Error('profileContext service is absent: the profile patch cannot be located')
    return profile.patchPath
  }

  const mcpEntries = (): LoaderEntryLike[] => {
    const rows: LoaderEntryLike[] = []
    for (const entry of loader().entries()) {
      if (entry.options?.name === MCP_CLIENT_MODULE) rows.push(entry)
    }
    return rows
  }

  /**
   * 补丁/配置编辑服务认的 id：行在补丁里的 id（`options.id`）。
   *
   * 面板传来的 entryId 是 Loader 的树 id（顶层行带 `include:` 前缀），两者
   * 不是一回事；写补丁、找块、比对覆盖行都必须用前者。
   */
  const patchIdOf = (entry: LoaderEntryLike): string => entry.options?.id ?? entry.id
  const findEntry = (id: string): LoaderEntryLike | undefined =>
    mcpEntries().find((entry) => entry.id === id || entry.options?.id === id)

  const readPatch = async (path: string): Promise<string> => {
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
      throw error
    }
  }

  /** 读改写循环：内容被别人改过就重来，绝不覆盖没读到的编辑。 */
  const mutatePatch = async <T>(mutate: (text: string) => { text: string; result: T }): Promise<T> => {
    const path = patchPath()
    const run = async (): Promise<T> => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const current = await readPatch(path)
        const { text, result } = mutate(current)
        if (text === current) return result
        const again = await readPatch(path)
        if (again !== current) continue
        const temporary = join(`${path}.${String(process.pid)}.${Math.random().toString(36).slice(2)}.tmp`)
        await writeFile(temporary, text, { mode: 0o600 })
        await rename(temporary, path)
        return result
      }
      throw new McpPatchError('the profile patch kept changing while saving; nothing was written, try again')
    }
    const hmr = get('hmr') as HmrLike | undefined
    return hmr === undefined || typeof hmr.runExclusive !== 'function' ? run() : hmr.runExclusive(run)
  }

  /** 补丁全文的 id → 带 config 的覆盖行（用于发现受管行被别处覆盖）。 */
  const configOverrides = (text: string): Map<string, true> => {
    const out = new Map<string, true>()
    let parsed: unknown
    try {
      parsed = yaml.load(text, { schema: PATCH_SCHEMA })
    } catch {
      return out
    }
    if (!Array.isArray(parsed)) return out
    for (const entry of parsed) {
      const record = asRecord(entry)
      if (record === undefined || record.insert !== undefined) continue
      const id = record.id
      if (typeof id === 'string' && record.config !== undefined) out.set(id, true)
    }
    return out
  }

  /** 等 Loader 应用一次补丁改动；超时说明这次改动要重启才生效。 */
  const applyTimeoutMs = options.applyTimeoutMs ?? APPLY_TIMEOUT_MS
  const pollMs = options.pollMs ?? APPLY_POLL_MS
  const waitForApply = async (predicate: () => boolean): Promise<boolean> => {
    const deadline = Date.now() + applyTimeoutMs
    for (;;) {
      try {
        if (predicate()) return true
      } catch {
        // Loader 可能在重组中途短暂不可用：等下一轮。
      }
      if (Date.now() >= deadline) return false
      await delay(pollMs)
    }
  }

  const outcomeOf = (applied: boolean, entryId: string): McpSaveOutcome => applied
    ? { application: 'applied', entryId }
    : { application: 'restart-required', entryId, restartReason: 'load-pending' }

  const save = async (server: McpServerInput, entryId?: string): Promise<McpSaveOutcome> => serialize(async () => {
    const entries = mcpEntries()
    const editor = get('configEditor') as ConfigEditorLike | undefined

    // 新建 → 受管块。
    if (entryId === undefined) {
      const created = await mutatePatch<{ id: string; config: Record<string, unknown> }>((text) => {
        const block = readManagedBlock(text)
        assertUniqueName(server, entries, block)
        const taken = [...entries.map(patchIdOf), ...entries.map((entry) => entry.id), ...block.map((row) => row.id)]
        const id = uniqueEntryId(server.serverName, taken)
        const config = configFromServer(server)
        const next: ManagedServer[] = [...block, { id, config }]
        const nextText = writeManagedBlock(text, next)
        assertPatchParses(nextText)
        return { text: nextText, result: { id, config } }
      })
      const applied = await waitForApply(() => {
        const row = mcpEntries().find((entry) => patchIdOf(entry) === created.id)
        return row !== undefined && isDeepStrictEqual(row.options?.config, created.config)
      })
      return outcomeOf(applied, created.id)
    }

    // 编辑 → 受管块优先，其余交给 config-editor。
    const target = findEntry(entryId)
    const key = target === undefined ? entryId : patchIdOf(target)
    const managed = await mutatePatch<{ kind: 'managed'; config: Record<string, unknown> } | { kind: 'foreign' }>((text) => {
      const block = readManagedBlock(text)
      const index = block.findIndex((row) => row.id === key)
      if (index < 0) return { text, result: { kind: 'foreign' } }
      if (configOverrides(text).has(key)) {
        throw new McpAccessError('this row also has a later patch entry with config; edit it there instead', 409)
      }
      assertUniqueName(server, entries, block, key)
      const config = applyServerToConfig((block[index] as ManagedServer).config, server)
      const next: ManagedServer[] = [...block]
      next[index] = { id: key, config }
      const nextText = writeManagedBlock(text, next)
      assertPatchParses(nextText)
      return { text: nextText, result: { kind: 'managed', config } }
    })

    if (managed.kind === 'managed') {
      const applied = await waitForApply(() => {
        const row = mcpEntries().find((entry) => patchIdOf(entry) === key)
        return row !== undefined && isDeepStrictEqual(row.options?.config, managed.config)
      })
      return outcomeOf(applied, key)
    }

    if (editor === undefined) {
      throw new McpAccessError('this row is not managed by the plugin and this deployment has no config editor; it can only be toggled', 409)
    }
    return editForeign(editor, server, key)
  })

  /** 用 dsh 的 config-editor 改一行（保留 `!!js` 原文）。 */
  const editForeign = async (editor: ConfigEditorLike, server: McpServerInput, patchId: string): Promise<McpSaveOutcome> => {
    const entry = editor.entries().find((item) => (item.options?.id ?? item.id) === patchId || item.id === patchId)
    if (entry === undefined) throw new McpAccessError('MCP row is not addressable through the config editor: ' + patchId, 409)
    if (entry.options?.name !== MCP_CLIENT_MODULE) throw new McpAccessError('not an MCP row: ' + patchId, 404)
    const configuration = editor
      .configuration()
      .find((item) => (item.entry.options?.id ?? item.entry.id) === patchId || item.entry === entry)
    if (configuration === undefined) throw new McpAccessError('MCP row configuration is unavailable: ' + patchId, 409)
    const override = asRecord(configuration.override)
    const inherited = asRecord(configuration.inherited) ?? {}
    const raw = override !== undefined && Object.keys(override).length > 0 ? override : inherited
    if (hasExpression(raw) || hasExpression(entry.options?.config)) {
      throw new McpAccessError('this row contains a !!js expression; edit it in the profile patch by hand', 409)
    }
    assertUniqueName(server, mcpEntries(), [], patchId)
    const next = applyServerToConfig(raw, server)
    try {
      await editor.edit(entry, () => next)
    } catch (error) {
      throw new McpAccessError('config editor refused the change: ' + messageOf(error), 409)
    }
    return { application: 'applied', entryId: patchId }
  }

  const remove = async (entryId: string): Promise<McpSaveOutcome> => serialize(async () => {
    const target = findEntry(entryId)
    const key = target === undefined ? entryId : patchIdOf(target)
    const live = target !== undefined
    const removed = await mutatePatch((text) => {
      const block = readManagedBlock(text)
      const index = block.findIndex((row) => row.id === key)
      if (index < 0) return { text, result: false }
      const next = block.filter((row) => row.id !== key)
      const nextText = writeManagedBlock(text, next)
      assertPatchParses(nextText)
      return { text: nextText, result: true }
    })
    if (!removed) {
      if (!live) throw new McpAccessError('unknown MCP server entry: ' + entryId, 404)
      throw new McpAccessError('this row was not created from this page; remove it where it is declared', 409)
    }
    const applied = await waitForApply(() => !mcpEntries().some((entry) => patchIdOf(entry) === key))
    return outcomeOf(applied, key)
  })

  return { save, remove }
}

/** 同名的服务器只能有一台（dsh 会拒绝第二个注册同一命名空间的实例）。 */
function assertUniqueName(
  server: McpServerInput,
  entries: readonly LoaderEntryLike[],
  block: readonly ManagedServer[],
  selfId?: string,
): void {
  for (const entry of entries) {
    if (entry.id === selfId || entry.options?.id === selfId) continue
    const config = asRecord(entry.options?.config)
    if (config?.serverName === server.serverName) {
      throw new McpPatchError('MCP server name "' + server.serverName + '" is already used by row "' + (entry.options?.id ?? entry.id) + '"', 409, 'serverName')
    }
  }
  for (const row of block) {
    if (row.id === selfId) continue
    if (row.config.serverName === server.serverName) {
      throw new McpPatchError('MCP server name "' + server.serverName + '" is already used by row "' + row.id + '"', 409, 'serverName')
    }
  }
}

/** 整份补丁在写入前后都必须能解析（防止拼接把文件写坏）。 */
function assertPatchParses(text: string): void {
  if (text.trim() === '') return
  try {
    yaml.load(text, { schema: PATCH_SCHEMA })
  } catch (error) {
    throw new McpPatchError('the profile patch would not parse after this change: ' + messageOf(error))
  }
}

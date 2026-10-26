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

import type { McpPhase, McpReadOnlyReason } from './protocol.ts'
import { McpAccessError, MCP_CLIENT_MODULE, type McpAccess, type McpListFacts, type McpToggleOutcome } from './mcp.ts'

/** dsh 的 PluginInventoryEntry 子集（listPlugins 的返回行）。 */
interface PluginInfoLike {
  entryId: string
  moduleName: string
  enabled: boolean
  fiberPhase: McpPhase
  patchId?: string
  readOnlyReason?: McpReadOnlyReason
}

/** dsh 的 ChangeResult 子集。 */
interface ChangeResultLike {
  application?: string
  restartReason?: string
  error?: { code?: string; diagnostic?: string }
}

/** dsh 的 PluginManager 子集。 */
interface PluginManagerLike {
  listPlugins(): Promise<readonly PluginInfoLike[]>
  setPluginEnabled(id: string, enabled: boolean): Promise<ChangeResultLike>
}

/** dsh 的 Loader 条目子集（只读 config 与启用态）。 */
interface LoaderEntryLike {
  id: string
  disabled?: boolean
  fiber?: { state?: number }
  options?: { name?: string; config?: unknown }
}

/** dsh 的 Loader 服务子集。 */
interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>
}

/** dsh 的工具注册表子集。 */
interface ToolsLike {
  schemas(): readonly { name: string; description?: string; parameters?: unknown }[]
}

/** dsh 的 profileContext 子集。 */
interface ProfileContextLike {
  patchPath?: string
}

/** FiberState 的运行时镜像（DISPOSED = null）。 */
const FIBER_PHASE: Readonly<Record<number, McpPhase>> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
}

/** 开关结果的合法取值（dsh 之外的值按 failed 处理，不把未知状态喂给界面）。 */
const APPLICATIONS = new Set<McpToggleOutcome['application']>(['applied', 'restart-required', 'overridden', 'failed', 'cancelled'])

/** 错误对象的可读文本（不吞掉非 Error 的抛出）。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 只有 pluginManager 缺席或读不出列表时用 Loader 兜底：能列，但不能开关。 */
function loaderRows(loader: LoaderLike | undefined, warnings: string[]): PluginInfoLike[] {
  if (loader === undefined) {
    warnings.push('loader service is absent: MCP servers cannot be enumerated')
    return []
  }
  const rows: PluginInfoLike[] = []
  try {
    for (const entry of loader.entries()) {
      if (entry.options?.name !== MCP_CLIENT_MODULE) continue
      const state = entry.fiber?.state
      rows.push({
        entryId: entry.id,
        moduleName: MCP_CLIENT_MODULE,
        enabled: entry.disabled !== true,
        fiberPhase: state === undefined ? null : FIBER_PHASE[state] ?? null,
        // 没有插件管理服务时，连「这行有没有 id」都不知道：原因如实写成
        // no-manager，而不是假装它在补丁里没有 id。
        readOnlyReason: 'no-manager',
      })
    }
  } catch (error) {
    warnings.push('loader.entries() failed: ' + messageOf(error))
  }
  return rows
}

/**
 * Build the MCP access surface over a context service reader.
 * @param get - reads one service off the plugin context (`ctx.get`), `undefined` when absent.
 * @returns list/toggle over the MCP rows of this process.
 */
export function createMcpAccess(get: (name: string) => unknown): McpAccess {
  const list = async (): Promise<McpListFacts> => {
    const warnings: string[] = []
    const manager = get('pluginManager') as PluginManagerLike | undefined
    const loader = get('loader') as LoaderLike | undefined
    const tools = get('tools') as ToolsLike | undefined
    const profile = get('profileContext') as ProfileContextLike | undefined

    let rows: readonly PluginInfoLike[] = []
    let canManage = manager !== undefined
    if (manager === undefined) {
      warnings.push('pluginManager service is absent: MCP servers are listed from the Loader only and cannot be toggled')
      rows = loaderRows(loader, warnings)
    } else {
      try {
        rows = (await manager.listPlugins()).filter((row) => row.moduleName === MCP_CLIENT_MODULE)
      } catch (error) {
        // 管理服务在、但读不出来（profile 损坏等）：降级成只读列表，别把整页干掉。
        warnings.push('pluginManager.listPlugins() failed: ' + messageOf(error))
        rows = loaderRows(loader, warnings)
      }
    }

    // 行配置只存在于 Loader 条目里（补丁原文，未填默认值）：按条目 id 对齐。
    const configs = new Map<string, unknown>()
    if (loader !== undefined) {
      try {
        for (const entry of loader.entries()) configs.set(entry.id, entry.options?.config)
      } catch (error) {
        warnings.push('loader.entries() failed: ' + messageOf(error))
      }
    } else if (rows.length > 0) {
      warnings.push('loader service is absent: MCP row configs are unavailable')
    }

    const facts = rows.map((row) => ({
      entryId: row.entryId,
      config: configs.get(row.entryId),
      enabled: row.enabled,
      phase: row.fiberPhase ?? null,
      ...(row.patchId !== undefined ? { patchId: row.patchId } : {}),
      ...(row.readOnlyReason !== undefined ? { readOnlyReason: row.readOnlyReason } : {}),
    }))

    let toolFacts: McpListFacts['tools'] = []
    if (tools === undefined) {
      if (rows.length > 0) warnings.push('tools service is absent: tool lists are unavailable')
    } else {
      try {
        toolFacts = tools.schemas().map((tool) => ({
          name: tool.name,
          ...(tool.description !== undefined ? { description: tool.description } : {}),
          ...(tool.parameters !== undefined ? { parameters: tool.parameters } : {}),
        }))
      } catch (error) {
        warnings.push('tools.schemas() failed: ' + messageOf(error))
      }
    }

    return {
      facts,
      tools: toolFacts,
      configPath: profile?.patchPath ?? null,
      canManage,
      warnings,
    }
  }

  const setEnabled = async (entryId: string, enabled: boolean): Promise<McpToggleOutcome> => {
    const manager = get('pluginManager') as PluginManagerLike | undefined
    if (manager === undefined) throw new Error('pluginManager service is absent: MCP servers cannot be toggled in this deployment')
    // 只允许开/关 MCP 行：setPluginEnabled 本身会接受任何可寻址的 Loader 条目，
    // 不在这里收窄，浏览器的这个路由就能改动本插件的其他插件行。
    const rows = await manager.listPlugins()
    const target = rows.find((row) => row.entryId === entryId && row.moduleName === MCP_CLIENT_MODULE)
    if (target === undefined) throw new McpAccessError('unknown MCP server entry: ' + entryId, 404)
    const result = await manager.setPluginEnabled(entryId, enabled)
    const application = result.application !== undefined && APPLICATIONS.has(result.application as McpToggleOutcome['application'])
      ? result.application as McpToggleOutcome['application']
      : 'failed'
    return {
      application,
      ...(result.restartReason !== undefined ? { restartReason: result.restartReason } : {}),
      ...(result.error?.diagnostic !== undefined ? { error: result.error.diagnostic } : {}),
      // dsh 对「不可寻址 / 受保护 / 找不到行」只给 code、不给 diagnostic，两者都要带。
      ...(result.error?.code !== undefined ? { errorCode: result.error.code } : {}),
    }
  }

  return { list, setEnabled }
}

/**
 * AGENTS.md 页索引的落盘缓存。
 *
 * 位置：`$DSH_HOME/plugin/data/custom-instruction-manager/agents-index.json` ——
 * 和 state.json、词表缓存在同一个插件数据目录下。
 *
 * 生命周期：
 *   - 插件加载时（包括每次打开 dsh）读一次进内存，面板打开页面立刻有内容；
 *   - 每一轮分步扫描完成后原子覆盖写一次，下一次启动读到的就是那一份；
 *   - 读不到、JSON 坏了、版本或键对不上，都当作**没有缓存**：页面退化成
 *     「无缓存 → 直接从第一轮扫描开始」，功能不受影响（缓存从来不参与写操作）。
 *
 * 键 = 家目录 + 共享 agents 根 + 排除目录。少了这道校验，用户改了排除目录
 * （哪怕是在 dsh 关着的时候改的）之后还会拿旧索引来铺——那正是索引缓存要
 * 避免的「拿旧结果当现状」。
 */

import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { resolveExcludeDirs, type InstructionFileRef, type InstructionGroup, type InstructionRoster } from './protocol.ts'
import { readFileSnapshot, writeTextAtomic } from './skillfs/write.ts'
import { agentsHome, dshHome, pluginDataDir } from './store.ts'
import { configOf, type SkillHubRouteDeps } from './routes/deps.ts'

/** 索引缓存文件的名字（在插件数据目录下）。 */
export const AGENTS_INDEX_FILE = 'agents-index.json'

/** 落盘格式版本；形状变了就 +1，旧文件按「没有缓存」处理。 */
const AGENTS_INDEX_VERSION = 1

/** 缓存文件的绝对路径。 */
export function agentsIndexPath(home = dshHome()): string {
  return join(pluginDataDir(home), AGENTS_INDEX_FILE)
}

/** 一份索引缓存的键：这三样任一变化，旧索引就不再适用。 */
export interface AgentsIndexKey {
  home: string
  agentsHome: string
  excludeDirs: string[]
}

/** 当前依赖下的键。 */
export function agentsIndexKey(deps: SkillHubRouteDeps): AgentsIndexKey {
  return {
    home: deps.home ?? dshHome(),
    agentsHome: deps.agentsHome ?? agentsHome(),
    excludeDirs: resolveExcludeDirs(configOf(deps).excludeDirs),
  }
}

/** 内存里的索引缓存键（键的 JSON 串）。 */
function keyOf(deps: SkillHubRouteDeps): string {
  return JSON.stringify(agentsIndexKey(deps))
}

/** 当前依赖下的缓存键（字符串形态）；进行中的分步扫描也用它分键。 */
export function agentsKeyString(deps: SkillHubRouteDeps): string {
  return keyOf(deps)
}

/** 一份可用的索引缓存：完成时间 + 清单。 */
export interface CachedAgentsRoster {
  /** 这一轮扫描完成的时间（epoch ms）。 */
  at: number
  roster: InstructionRoster
}

/** 磁盘上的记录形状。 */
interface AgentsIndexFile {
  version: number
  /** 扫描完成时间（epoch ms），原样回给面板。 */
  scannedAt: number
  key: AgentsIndexKey
  groups: InstructionGroup[]
}

/** 已完成的索引（host 进程内，按键分键）。 */
const cached = new Map<string, CachedAgentsRoster>()

/**
 * 读内存里的索引缓存。
 * @param deps - route dependencies (homes + exclude list).
 * @returns 命中时是 `{at, roster}`，否则 undefined。
 */
export function cachedAgentsRoster(deps: SkillHubRouteDeps): CachedAgentsRoster | undefined {
  return cached.get(keyOf(deps))
}

/**
 * 一轮扫描完成：覆盖内存里的那份，并原子写回磁盘。
 *
 * 写盘是尽力而为：失败只是下次启动首屏少一份缓存，不影响本次结果。
 * @param deps - route dependencies (homes + exclude list).
 * @param roster - 这一轮的完整结果。
 * @param at - 完成时间（默认现在）。
 */
export async function saveAgentsRoster(
  deps: SkillHubRouteDeps,
  roster: InstructionRoster,
  at = Date.now(),
): Promise<void> {
  cached.set(keyOf(deps), { at, roster })
  const file: AgentsIndexFile = {
    version: AGENTS_INDEX_VERSION,
    scannedAt: at,
    key: agentsIndexKey(deps),
    groups: roster.groups,
  }
  await writeAgentsIndexFile(agentsIndexPath(deps.home ?? dshHome()), file).catch(() => undefined)
}

/**
 * 插件加载时把磁盘上那份索引读进内存。
 *
 * 同一个键已经有更新的内存结果时不覆盖（配置变更后 `sync()` 会重跑，这里
 * 只负责把「启动时什么都没有」这个状态补上）。读盘失败 / 格式坏 / 键不符
 * 一律静默跳过。
 * @param deps - route dependencies (homes + exclude list).
 */
export async function hydrateAgentsRoster(deps: SkillHubRouteDeps): Promise<void> {
  const key = keyOf(deps)
  if (cached.has(key)) return
  const text = await readFile(agentsIndexPath(deps.home ?? dshHome()), 'utf8').catch(() => undefined)
  if (text === undefined) return
  const loaded = parseAgentsIndexFile(text, key)
  // 读盘期间可能已经有一轮扫描完成并写入了更新的内存结果：以内存为准。
  if (loaded !== undefined && !cached.has(key)) cached.set(key, loaded)
}

/** 清空内存缓存（测试用来模拟 host 重启：内存清掉后由 hydrate 从磁盘读回）。 */
export function resetAgentsRosterCache(): void {
  cached.clear()
}

/** 原子写一份索引文件（父目录按需创建；保留原权限位）。 */
async function writeAgentsIndexFile(path: string, file: AgentsIndexFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const previous = await readFileSnapshot(path)
  await writeTextAtomic(path, JSON.stringify(file) + '\n', previous?.mode)
}

/** 解析并校验一份索引文件；任何一处不对劲都按「没有缓存」处理。 */
function parseAgentsIndexFile(text: string, key: string): CachedAgentsRoster | undefined {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Partial<AgentsIndexFile>
  if (record.version !== AGENTS_INDEX_VERSION) return undefined
  if (typeof record.scannedAt !== 'number' || !Number.isFinite(record.scannedAt)) return undefined
  if (record.key === undefined || JSON.stringify(record.key) !== key) return undefined
  if (!Array.isArray(record.groups) || !record.groups.every(isInstructionGroup)) return undefined
  return { at: record.scannedAt, roster: { groups: record.groups, excludeDirs: record.key.excludeDirs } }
}

/** 一行是否长成清单行的样子。 */
function isInstructionRef(value: unknown): value is InstructionFileRef {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.name === 'string' && typeof row.path === 'string' && typeof row.absolute === 'string'
}

/** 一个分组是否长成清单分组的样子。 */
function isInstructionGroup(value: unknown): value is InstructionGroup {
  if (typeof value !== 'object' || value === null) return false
  const group = value as Record<string, unknown>
  if (group.kind !== 'user' && group.kind !== 'project') return false
  if (group.title !== undefined && typeof group.title !== 'string') return false
  return Array.isArray(group.files) && group.files.every(isInstructionRef)
}

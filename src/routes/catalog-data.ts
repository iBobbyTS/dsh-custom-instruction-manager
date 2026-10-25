/**
 * routes 共享层 · 目录装配：已知工作区清单、完整目录响应（时间戳/interface
 * 元数据/重名诊断）与详情映射。从 helpers.ts 原样搬出，行为不变。
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import {
  isProjectSource,
  type CatalogResponse,
  type CatalogSkill,
  type SkillDetail,
  type WritableRoot,
} from '../protocol.ts'
import { editableSkillFile, rootPath, readSkillInterface, scanDiagnostics, type SkillInterface } from '../skillfs.ts'
import { CURRENT_VERSION } from '../update.ts'
import { homeOf, isWritableSource, type SkillHubRouteDeps } from './deps.ts'

/**
 * 目录中存在的技能名集合。默认（`includeDisabled` 未显式关闭）为「启用目录 ∪
 * 已禁用名单」。
 *
 * 导入去重必须传 `{ includeDisabled: false }`：禁用只意味着「暂不启用」，把它
 * 算作「已存在」会让一次禁用产生「永久占名」的副作用，真技能再也导不进来
 * （issue #16）。
 */
export async function knownSkillNames(
  deps: SkillHubRouteDeps,
  options?: { includeDisabled?: boolean },
): Promise<Set<string>> {
  const snapshot = await deps.skills.snapshot()
  const names = new Set(snapshot.skills.map((skill) => skill.name))
  if (options?.includeDisabled === false) return names
  for (const disabled of await deps.store.listDisabled()) names.add(disabled.name)
  return names
}

/** 已知工作区条目（dsh 的 workspace.json 表）。 */
export interface WorkspaceEntry {
  path: string
  title: string
}

/** 已知工作区条目（dsh 的 workspace.json 表 + 显示顺序）。 */
export interface WorkspaceEntry {
  /** Workspace 注册 id（workspace.json 的 tables 键）。 */
  id?: string
  path: string
  title: string
}

/**
 * 读取 dsh 的已知工作区清单（~/.dsh/storages/workspace.json 的
 * tables.workspaces 表），**按侧面栏的显示顺序**返回：global.workspaceIds
 * 是注册表维护的有序 id 表（dsh-workspace 的 `workspaceRegistry.list()`），
 * 侧面栏就按它渲染；表键顺序只是插入顺序，会与界面顺序相反。没有
 * workspaceIds（旧文件/手写测试）时退回表键顺序。文件缺失/损坏时返回
 * 空清单（回退为仅用户级视图）。
 */
export async function workspaceEntries(home: string): Promise<WorkspaceEntry[]> {
  try {
    const raw = await readFile(join(home, 'storages', 'workspace.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const root = parsed as Record<string, unknown>
    const tables = typeof root.tables === 'object' && root.tables !== null
      ? root.tables as Record<string, unknown>
      : undefined
    const workspaces = tables !== undefined && typeof tables.workspaces === 'object' && tables.workspaces !== null
      ? tables.workspaces as Record<string, unknown>
      : undefined
    if (workspaces === undefined) return []
    const byId = new Map<string, WorkspaceEntry>()
    for (const [id, record] of Object.entries(workspaces)) {
      const entry = record as { path?: unknown; title?: unknown } | null
      if (entry === null || typeof entry !== 'object') continue
      if (typeof entry.path !== 'string' || entry.path === '') continue
      byId.set(id, {
        id,
        path: entry.path,
        title: typeof entry.title === 'string' && entry.title !== '' ? entry.title : entry.path,
      })
    }
    // global.workspaceIds 决定显示顺序；不在表里的 id 忽略，表里多出来的
    // 记录按插入顺序补在末尾（不能让它们从分组里消失）。
    const order = (root.global as { workspaceIds?: unknown } | undefined)?.workspaceIds
    const ordered: WorkspaceEntry[] = []
    if (Array.isArray(order)) {
      for (const id of order) {
        if (typeof id !== 'string') continue
        const entry = byId.get(id)
        if (entry === undefined) continue
        ordered.push(entry)
        byId.delete(id)
      }
    }
    ordered.push(...byId.values())
    return ordered
  } catch {
    return []
  }
}

/**
 * Build the full catalog response (shared by catalog/toggle/create handlers).
 * 显式 cwd 只看该工作区；否则合并所有已知工作区（workspace.json）的项目技能
 * + 用户级技能，同名技能先到先得；没有任何工作区时回退为仅用户级视图。
 */
export async function buildCatalog(deps: SkillHubRouteDeps, cwd?: string): Promise<CatalogResponse> {
  const home = homeOf(deps)
  let workspaces: WorkspaceEntry[]
  if (cwd !== undefined && cwd !== '') {
    workspaces = [{ path: cwd, title: cwd }]
  } else {
    workspaces = await workspaceEntries(home)
    if (workspaces.length === 0) workspaces = [{ path: '', title: '' }]
  }
  // Project skills with same name but different workspace are distinct entries (grouped by workspace in SourcesView), so key includes workspace for project sources.
  const byKey = new Map<string, { skill: SkillSummary; workspace?: string; workspaceTitle?: string }>()
  // Distinct identities per logical key: the same skill reappearing across
  // workspace snapshots (same source+provider) is one skill, not a duplicate.
  // Only different source/provider identities sharing a name are ambiguous.
  const identitiesByKey = new Map<string, Set<string>>()
  let complete = true
  for (const ws of workspaces) {
    const lookup = ws.path !== '' ? { cwd: ws.path } : undefined
    const snapshot = await deps.skills.snapshot(lookup)
    if (!snapshot.complete) complete = false
    for (const skill of snapshot.skills) {
      const logicalKey = isProjectSource(skill.source) && ws.path !== '' ? `${skill.name}\0${ws.path}\0${skill.source}` : skill.name
      let identities = identitiesByKey.get(logicalKey)
      if (identities === undefined) {
        identities = new Set()
        identitiesByKey.set(logicalKey, identities)
      }
      identities.add(skill.source + '\0' + skill.provider)
      if (byKey.has(logicalKey)) continue
      byKey.set(logicalKey, {
        skill,
        ...(isProjectSource(skill.source) && ws.path !== '' ? { workspace: ws.path, workspaceTitle: ws.title } : {}),
      })
    }
  }
  const disabled = await deps.store.listDisabled()
  const byName = byKey
  // A hub-disabled record whose name is also enabled elsewhere hides one
  // identity behind the toggle; flag it as well.
  for (const d of disabled) {
    let identities = identitiesByKey.get(d.name)
    if (identities === undefined) {
      identities = new Set()
      identitiesByKey.set(d.name, identities)
    }
    identities.add('hub-disabled\0' + d.root)
  }
  const duplicateNames = [...identitiesByKey.entries()]
    .filter(([, identities]) => identities.size > 1)
    .map(([key]) => key.split('\0')[0])
    .filter((name, idx, arr) => arr.indexOf(name) === idx)
    .sort((a, b) => a.localeCompare(b))
  // 添加/更新时间 = 用户级技能文件的创建/修改时间（排序与详情展示用）。
  // snapshot 只给 SkillSummary（无 path），所以按可写根推断路径；非用户级
  // 来源没有稳定路径，省略字段，客户端排序会把它放到末尾。
  // 全部技能并发收集（面板每 5 秒轮询一次，逐个串行 stat 会让响应随技能
  // 数量线性变慢）。
  const timesByName = new Map<string, { addedAt: number; updatedAt: number }>()
  await Promise.all([...byName.values()].map(async ({ skill }) => {
    if (!isWritableSource(skill.source)) return
    const base = rootPath(skill.source as WritableRoot, home)
    for (const candidate of [join(base, skill.name, 'SKILL.md'), join(base, skill.name), join(base, skill.name + '.md')]) {
      try {
        const times = await stat(candidate)
        timesByName.set(skill.name, { addedAt: times.birthtimeMs, updatedAt: times.mtimeMs })
        return
      } catch {
        // 目录/文件不存在则尝试下一个候选路径。
      }
    }
  }))
  // UI metadata from agents/openai.yaml (codex SkillInterface) — best-effort, no error if missing.
  // 按逻辑键（name[+workspace+source]）而非技能名缓存：两个工作区的同名项目
  // 技能是不同的行，否则会互相串显示最后读到的那份 interface。
  const interfaceByName = new Map<string, SkillInterface>()
  await Promise.all([...byName.entries()].map(async ([logicalKey, { skill, workspace }]) => {
    const candidates: string[] = []
    if (isWritableSource(skill.source as WritableRoot)) {
      candidates.push(join(rootPath(skill.source as WritableRoot, home), skill.name))
    } else if (isProjectSource(skill.source) && workspace !== undefined) {
      candidates.push(join(workspace, skill.source === 'project-dsh' ? '.dsh/skills' : '.agents/skills', skill.name))
    } else if (isProjectSource(skill.source)) {
      for (const ws of workspaces) if (ws.path !== '') candidates.push(join(ws.path, skill.source === 'project-dsh' ? '.dsh/skills' : '.agents/skills', skill.name))
    }
    for (const dir of candidates) {
      try {
        const iface = await readSkillInterface(dir)
        if (iface !== undefined) {
          interfaceByName.set(logicalKey, iface)
          return
        }
      } catch {
        // ignore
      }
    }
  }))
  const skills: CatalogSkill[] = [...byName.entries()].map(([logicalKey, { skill, workspace, workspaceTitle }]) => {
    const row: CatalogSkill = {
      name: skill.name,
      description: skill.description,
      ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
      invocation: {
        modelInvocable: skill.invocation.modelInvocable,
        userInvocable: skill.invocation.userInvocable,
      },
      provider: skill.provider,
      writable: isWritableSource(skill.source),
      source: skill.source,
      ...(workspace !== undefined ? { workspace, workspaceTitle: workspaceTitle ?? workspace } : {}),
    }
    const times = timesByName.get(skill.name)
    if (times !== undefined) {
      row.addedAt = times.addedAt
      row.updatedAt = times.updatedAt
    }
    const iface = interfaceByName.get(logicalKey)
    if (iface !== undefined) applyInterface(row, iface)
    return row
  })
  // 两个 root 的诊断扫描互不依赖：面板每 5 秒轮询一次 /catalog，串行会让响应
  // 随技能数量线性变慢。扫描内部的逐条读盘也已是并发的（见 scanDiagnostics）。
  const [userDshDiagnostics, userAgentsDiagnostics] = await Promise.all([
    scanDiagnostics('user-dsh', home),
    scanDiagnostics('user-agents', home),
  ])
  const diagnostics = [...userDshDiagnostics, ...userAgentsDiagnostics]
  // 默认视图把工作区顺序带回面板：项目级分组按它排（与侧面栏一致）。
  // 显式 cwd 只有一个临时工作区，不对外声明顺序。
  const workspaceRefs = cwd !== undefined && cwd !== ''
    ? undefined
    : workspaces
      .filter((entry) => entry.path !== '')
      .map((entry) => ({ path: entry.path, title: entry.title }))
  return {
    ok: true,
    pluginVersion: CURRENT_VERSION,
    complete,
    skills,
    disabled,
    diagnostics,
    ...(workspaceRefs !== undefined && workspaceRefs.length > 0 ? { workspaces: workspaceRefs } : {}),
    ...(duplicateNames.length > 0 ? { duplicateNames } : {}),
  }
}

/** agents/openai.yaml 的 interface 元数据 → 目录行/详情行（catalog 与详情共用）。 */
export function applyInterface<T extends SkillInterface>(row: T, iface: SkillInterface): void {
  if (iface.displayName !== undefined) row.displayName = iface.displayName
  if (iface.shortDescription !== undefined) row.shortDescription = iface.shortDescription
  if (iface.brandColor !== undefined) row.brandColor = iface.brandColor
  if (iface.iconSmall !== undefined) row.iconSmall = iface.iconSmall
  if (iface.iconLarge !== undefined) row.iconLarge = iface.iconLarge
  if (iface.defaultPrompt !== undefined) row.defaultPrompt = iface.defaultPrompt
}

/** Map a loaded definition onto the wire shape. */
export function toDetail(skill: SkillDefinition, home?: string): SkillDetail {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
    invocation: {
      modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable,
    },
    provider: skill.provider,
    ...(skill.path !== undefined ? { path: skill.path, editable: editableSkillFile(skill.path, home) } : { editable: false }),
    content: skill.content,
  }
}

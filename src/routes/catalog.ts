/**
 * 目录域路由：catalog / skill 详情 / skill 删除 / create / stats。
 * 从 routes.ts 原样搬出，handler 逻辑不变。
 */

import { readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SkillDefinition } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import {
  SKILL_HUB_API,
  type CreateResponse,
  type SkillDeleteResponse,
  type SkillDetail,
  type SkillDetailResponse,
  type SkillInvocationResponse,
  type SkillRevealResponse,
  type StatsResponse,
  type WritableRoot,
} from '../protocol.ts'
import { createSkill, editableSkillFile, isBundledPath, occupancyOf, parseFrontmatter, readSkillInterface, revealInFileManager, rootPath, setInvocationPolicy, systemTrashDir, trashSourceOf, trashSkillToSystem } from '../skillfs.ts'
import { errorText } from '../error-text.ts'
import {
  applyInterface,
  buildCatalog,
  configOf,
  homeOf,
  isWritableSource,
  pathExists,
  queryParam,
  readString,
  resolveWritableSkill,
  toDetail,
  workspaceEntries,
  writeError,
  writeJson,
  type RouteSpec,
  type SkillHubRouteDeps,
} from './helpers.ts'

/**
 * 文件创建/修改时间与大小 → 详情行的 addedAt/updatedAt/size（读取失败时省略
 * 字段，详情页不显示那两行）；size 是编辑保存时判断「磁盘是否被改过」的指纹之一。
 */
async function applyFileTimes(row: { addedAt?: number; updatedAt?: number; size?: number }, path: string): Promise<void> {
  try {
    const times = await stat(path)
    row.addedAt = times.birthtimeMs
    row.updatedAt = times.mtimeMs
    row.size = times.size
  } catch {
    // 文件不可读时省略时间字段。
  }
}

/**
 * 详情/写调用方式/写正文共用的解析顺序：显式 cwd 只看该工作区；否则按已知
 * 工作区逐个查找（与目录默认视图一致），最后回退用户级根，保证默认视图里
 * 可见的项目技能也能打开详情、也能被同一个技能命中。
 */
export async function findSkill(deps: SkillHubRouteDeps, name: string, cwd: string): Promise<SkillDefinition | undefined> {
  if (cwd !== '') return deps.skills.get(name, { cwd })
  for (const ws of await workspaceEntries(homeOf(deps))) {
    const skill = await deps.skills.get(name, { cwd: ws.path })
    if (skill !== undefined) return skill
  }
  return deps.skills.get(name)
}

/** 目录域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export function catalogRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // ------------------------------------------------------------ catalog
    {
      path: SKILL_HUB_API.catalog,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const cwd = queryParam(url, 'cwd')
        writeJson(res, 200, await buildCatalog(deps, cwd))
      },
    },
    // -------------------------------------------------------------- detail
    {
      path: SKILL_HUB_API.skill,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const name = queryParam(url, 'name')
        if (name === undefined || name === '') { writeError(res, 400, 'name query parameter is required'); return }
        const cwd = queryParam(url, 'cwd') ?? ''
        const skill = await findSkill(deps, name, cwd)
        if (skill === undefined) {
          writeError(res, 404, 'skill not found: ' + name)
          return
        }
        const detail = toDetail(skill, homeOf(deps))
        if (skill.path !== undefined) {
          await applyFileTimes(detail, skill.path)
          // UI metadata from agents/openai.yaml beside the skill directory (codex).
          try {
            const rb = skill.resourceBase as { kind?: string; path?: string } | undefined
            const dir = rb?.kind === 'directory' && typeof rb.path === 'string' ? rb.path : (skill.path.endsWith('SKILL.md') ? dirname(skill.path) : undefined)
            if (dir !== undefined) {
              const iface = await readSkillInterface(dir)
              if (iface !== undefined) applyInterface(detail, iface)
            }
          } catch {
            // best-effort
          }
        }
        writeJson(res, 200, { ok: true, skill: detail } satisfies SkillDetailResponse)
      },
    },
    // --------------------------------------------------- skill/invocation
    // dsh's registry has no invocation setter: the two booleans every consumer
    // reads come from the skill file's frontmatter. Write them there — user and
    // project roots only, bundled/plugin providers own no writable file.
    {
      path: SKILL_HUB_API.skillInvocation,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const name = readString(body, 'name').trim()
        if (!isSkillName(name)) { writeError(res, 400, 'skill name must be kebab-case (lowercase letters, digits, dashes)'); return }
        if (typeof body.modelInvocable !== 'boolean' || typeof body.userInvocable !== 'boolean') {
          writeError(res, 400, 'modelInvocable and userInvocable must be booleans')
          return
        }
        const policy = { modelInvocable: body.modelInvocable, userInvocable: body.userInvocable }
        const cwd = readString(body, 'cwd')
        // Same resolution order as the detail route, so the checkbox row edits
        // exactly the skill the page is showing (including project skills).
        const skill = await findSkill(deps, name, cwd)
        if (skill === undefined) { writeError(res, 404, 'skill not found: ' + name); return }
        if (skill.path === undefined) {
          writeError(res, 409, 'skill "' + name + '" is registered by provider "' + skill.provider + '" and has no file to edit')
          return
        }
        const path = skill.path
        if (!editableSkillFile(path, homeOf(deps))) {
          writeError(res, 409, 'skill "' + name + '" is managed by provider "' + skill.provider + '"; only skill files under a user or project root can change invocation')
          return
        }
        try {
          await setInvocationPolicy(path, policy, homeOf(deps))
        } catch (error) {
          if (error instanceof TypeError) { writeError(res, 400, errorText(error)); return }
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') { writeError(res, 409, 'skill file is missing on disk: ' + path); return }
          throw error
        }
        // Callers re-read the detail/catalog through the registry, so drop the
        // cached summaries that still carry the old invocation policy.
        deps.invalidate?.()
        writeJson(res, 200, { ok: true, name, path, invocation: policy } satisfies SkillInvocationResponse)
      },
    },
    // -------------------------------------------------------- skill/reveal
    // 「在 Finder 中显示」：只处理真实磁盘文件。bundled / 插件 provider 的技能
    // 文件在应用包（app.asar）里，Finder 打不开，直接拒绝而不是弹一个空窗口。
    {
      path: SKILL_HUB_API.skillReveal,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const name = readString(body, 'name')
        if (name === '') { writeError(res, 400, 'name is required'); return }
        const cwd = readString(body, 'cwd')
        const skill = await findSkill(deps, name, cwd)
        const target = skill?.path
        if (target === undefined) { writeError(res, 404, 'skill has no file on disk: ' + name); return }
        if (isBundledPath(target)) { writeError(res, 409, 'skill lives inside the dsh application bundle: ' + target); return }
        if (!await pathExists(target)) { writeError(res, 404, 'skill file is missing on disk: ' + target); return }
        try {
          await (deps.reveal ?? revealInFileManager)(target)
        } catch (error) {
          writeError(res, 500, 'cannot open the file manager: ' + errorText(error))
          return
        }
        writeJson(res, 200, { ok: true, name, path: target } satisfies SkillRevealResponse)
      },
    },
    // -------------------------------------------------------- skill/delete
    // 把单个技能（目录或平面文件）移入系统废纸篓（~/.Trash，可在 Finder 中恢复），
    // 并清理来源映射。重名时目标名追加时间戳，绝不覆盖已有废纸篓条目。
    // 上游跟删（sources/delete）走的是 hub 自己的 .trash，可在面板内恢复。
    {
      path: SKILL_HUB_API.skillDelete,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const name = readString(body, 'name')
        if (name === '') { writeError(res, 400, 'name is required'); return }
        const cwd = readString(body, 'cwd')
        const resolved = await resolveWritableSkill(deps, name, cwd !== '' ? cwd : undefined)
        if (!resolved.ok) { writeError(res, resolved.status, resolved.error); return }
        const entry = trashSourceOf(resolved.path)
        let path: string
        try {
          path = await trashSkillToSystem(entry, deps.trashDir ?? systemTrashDir())
        } catch (error) {
          // 不可达的废纸篓（例如无权限/平台不支持）是拒绝，不是 500 崩溃。
          writeError(res, (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 409, 'cannot move the skill into the system trash: ' + errorText(error))
          return
        }
        await deps.store.removeSkillFromSources(name)
        deps.invalidate?.()
        writeJson(res, 200, { ok: true, name, path } satisfies SkillDeleteResponse)
      },
    },
    // -------------------------------------------------------------- create
    {
      path: SKILL_HUB_API.create,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const name = readString(body, 'name').trim()
        if (!isSkillName(name)) { writeError(res, 400, 'skill name must be kebab-case (lowercase letters, digits, dashes)'); return }
        // 缺省根 = user-dsh；给了但类型/取值不合法时保持原样交给下面的校验拒绝。
        const rootText = body.root === undefined ? 'user-dsh' : readString(body, 'root')
        if (!isWritableSource(rootText)) { writeError(res, 400, 'root must be user-dsh or user-agents'); return }
        const root: WritableRoot = rootText
        const existing = await deps.skills.get(name)
        if (existing !== undefined) { writeError(res, 409, 'skill name already exists: ' + name); return }
        // 建档前先看磁盘：三种占位都会让新目录与旧文件并存成同名两形态 ——
        // 已启用的发现文件（frontmatter 坏了因此注册表看不见）、旧版遗留的
        // `.disabled` 占位（目录包或扁平）、以及没有 SKILL.md 的空壳目录。
        const occupancy = await occupancyOf(rootPath(root, homeOf(deps)), name)
        if (occupancy.enabled.length > 0) {
          writeError(res, 409, 'a skill file already occupies this name on disk: ' + name + ' (check the discovery diagnostics)')
          return
        }
        if (occupancy.disabled.length > 0) {
          writeError(res, 409, 'name is occupied by a legacy .disabled file on disk: ' + name + ' (rename or remove it manually)')
          return
        }
        if (occupancy.bareDir !== undefined) {
          writeError(res, 409, 'name is occupied by an empty directory on disk: ' + name + ' (check the discovery diagnostics)')
          return
        }
        const path = await createSkill(root, name, readString(body, 'description'), homeOf(deps))
        deps.invalidate?.()
        writeJson(res, 201, { ok: true, path, root } satisfies CreateResponse)
      },
    },
    // ---------------------------------------------------------------- stats
    {
      path: SKILL_HUB_API.stats,
      methods: ['GET'],
      handler: async ({ res }) => {
        if (deps.stats === undefined) {
          writeJson(res, 200, { ok: true, available: false, stats: [] } satisfies StatsResponse)
          return
        }
        // All usage displays off means nobody reads statistics: answer
        // unavailable without invoking the reader, so no scan is triggered.
        const display = configOf(deps)
        if (display.showUseCount === false && display.showUseTime === false && display.showGroupSummary === false) {
          writeJson(res, 200, { ok: true, available: false, stats: [] } satisfies StatsResponse)
          return
        }
        const stats = await deps.stats()
        writeJson(res, 200, { ok: true, available: true, ...(deps.stats.source !== undefined ? { source: deps.stats.source } : {}), stats } satisfies StatsResponse)
      },
    },
  ]
}

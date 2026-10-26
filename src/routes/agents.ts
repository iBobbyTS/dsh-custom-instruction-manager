/**
 * AGENTS.md 域路由：指令文件清单（用户级 + 每个已知工作区）与文档正文。
 *
 * 这一页不写索引、也没有开关语义——dsh 对指令文件没有启用/禁用概念。排除
 * 目录清单走既有的 /config 路由（HubConfig.excludeDirs），这一族只负责按
 * 当前配置扫磁盘。
 *
 * 索引分两层：
 *   - **缓存**（`rosters`）：上一次完整扫描的结果，按（家目录 + 排除目录）分键。
 *     面板打开页面先读它（GET /agents），一次遍历都不用跑；点开一行、保存正文
 *     也用它做成员资格校验，所以「进入分类 → 点开一行」不再是两次全树遍历。
 *   - **进行中的扫描**（`staged`）：GET /agents/scan 分步推进。第 0 步建一份
 *     计划并回用户级分组，之后每个工作区一步；最后一步把整份结果提升为缓存。
 *     面板每步把它并进列表，所以扫描期间看到的是「缓存打底 + 扫到的实时替换」。
 *
 * 成员资格校验用「缓存 ∪ 进行中」：扫描期间新冒出来的文件在完成前就能点开，
 * 不必等这一轮跑完。
 */

import { randomUUID } from 'node:crypto'
import { agentsHome, dshHome } from '../store.ts'
import {
  MAX_EDIT_BODY_BYTES,
  resolveExcludeDirs,
  SKILL_HUB_API,
  type AgentsCacheResponse,
  type AgentsScanFailure,
  type AgentsScanStep,
  type EditConflictResponse,
  type InstructionFileSaveResponse,
  type InstructionGroup,
  type InstructionRoster,
} from '../protocol.ts'
import {
  InstructionFileError,
  planInstructionScan,
  readInstructionFile,
  saveInstructionFile,
  scanInstructionGroups,
  scanProjectGroup,
  StaleContentError,
  type InstructionScanPlan,
} from '../instructions.ts'
import { configOf, readNumber, readString, writeError, writeFileFailure, writeJson, writeRouteError, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** 缓存的索引按（家目录 + 排除目录）分键：配置或部署变化立即落到另一份。 */
interface CachedRoster {
  /** 这一份是什么时候扫完的（epoch ms）。 */
  at: number
  roster: InstructionRoster
}

/** 已完成扫描的缓存（host 进程内，直到被下一轮完整扫描覆盖）。 */
const rosters = new Map<string, CachedRoster>()

/** 一轮进行中的分步扫描。 */
interface StagedScan {
  scanId: string
  plan: InstructionScanPlan
  /** 已产出的分组（下标 = 步序号）。 */
  groups: InstructionGroup[]
}

/** 进行中的扫描，按同一个键分键：同时开着两轮时后一轮顶掉前一轮。 */
const staged = new Map<string, StagedScan>()

function scanKey(deps: SkillHubRouteDeps): string {
  return JSON.stringify({
    home: deps.home ?? dshHome(),
    agentsHome: deps.agentsHome ?? agentsHome(),
    excludeDirs: resolveExcludeDirs(configOf(deps).excludeDirs),
  })
}

/** 当前配置下的排除目录清单（无缓存时也能先把排除目录的条目画出来）。 */
function currentExcludeDirs(deps: SkillHubRouteDeps): string[] {
  return resolveExcludeDirs(configOf(deps).excludeDirs)
}

/**
 * 一份可用于成员资格校验的清单：完成的缓存加上进行中的那部分。
 *
 * 两者都没有（host 刚起来、面板直接点了一个旧行的路径）时兜底整扫一次，
 * 保证正文读取与保存永远有据可依。
 */
async function rosterFor(deps: SkillHubRouteDeps): Promise<InstructionRoster> {
  const key = scanKey(deps)
  const cached = rosters.get(key)?.roster
  const live = staged.get(key)
  if (cached !== undefined && live !== undefined) {
    return { excludeDirs: cached.excludeDirs, groups: [...cached.groups, ...live.groups] }
  }
  if (cached !== undefined) return cached
  if (live !== undefined) return { excludeDirs: live.plan.excludeDirs, groups: live.groups }
  const roster = await scanInstructionGroups(deps)
  rosters.set(key, { at: Date.now(), roster })
  return roster
}

/** 一轮扫完：整份结果成为新的缓存，进行中的那份退场。 */
function promote(deps: SkillHubRouteDeps, scan: StagedScan): void {
  const key = scanKey(deps)
  rosters.set(key, { at: Date.now(), roster: { groups: scan.groups, excludeDirs: scan.plan.excludeDirs } })
  staged.delete(key)
}

/** 一步的响应体（`groups[step]` 就是本步的分组）。 */
function stepPayload(scan: StagedScan, step: number): AgentsScanStep {
  const total = 1 + scan.plan.projects.length
  return {
    ok: true,
    scanId: scan.scanId,
    step,
    done: step + 1,
    total,
    more: step + 1 < total,
    group: scan.groups[step] ?? { kind: 'project', files: [] },
    excludeDirs: scan.plan.excludeDirs,
  }
}

/** 解析非负整数步序号；非法返回 undefined。 */
function stepOf(url: URL): number | undefined {
  const raw = url.searchParams.get('step') ?? ''
  if (!/^\d+$/.test(raw)) return undefined
  const step = Number(raw)
  return Number.isSafeInteger(step) ? step : undefined
}

/** AGENTS.md 页的全部路由 spec（由 routes.ts 包上统一围栏）。 */
export function agentsRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    // ----------------------------------------------------------- 索引缓存
    // 只读缓存、不触发扫描：没有缓存时 cached=false，面板直接进入分步扫描。
    {
      path: SKILL_HUB_API.agents,
      methods: ['GET'],
      handler: async ({ res }) => {
        const hit = rosters.get(scanKey(deps))
        const body: AgentsCacheResponse = hit === undefined
          ? { ok: true, cached: false, scannedAt: 0, groups: [], excludeDirs: currentExcludeDirs(deps) }
          : { ok: true, cached: true, scannedAt: hit.at, groups: hit.roster.groups, excludeDirs: hit.roster.excludeDirs }
        writeJson(res, 200, body)
      },
    },
    // --------------------------------------------------------- 分步扫描（一步）
    // step=0 建计划 + 回用户级分组；其后每个工作区一步；最后一步提升为缓存。
    {
      path: SKILL_HUB_API.agentsScan,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const step = stepOf(url)
        if (step === undefined) { writeError(res, 400, 'step must be a non-negative integer'); return }
        const key = scanKey(deps)
        try {
          if (step === 0) {
            const plan = await planInstructionScan(deps)
            const scan: StagedScan = { scanId: 'scan_' + randomUUID().slice(0, 8), plan, groups: [plan.user] }
            staged.set(key, scan)
            if (scan.groups.length >= 1 + plan.projects.length) promote(deps, scan)
            writeJson(res, 200, stepPayload(scan, 0))
            return
          }
          const scan = staged.get(key)
          const requested = (url.searchParams.get('scan') ?? '').trim()
          // 这一轮已经不在了（另一个面板开了新一轮、host 重启）：从第 0 步重来。
          if (scan === undefined || (requested !== '' && requested !== scan.scanId)) {
            writeJson(res, 409, { error: 'scan session expired', code: 'expired' } satisfies AgentsScanFailure)
            return
          }
          const total = 1 + scan.plan.projects.length
          if (step >= total) { writeError(res, 400, 'step out of range'); return }
          scan.groups.push(await scanProjectGroup(scan.plan, scan.plan.projects[step - 1]))
          const payload = stepPayload(scan, step)
          if (payload.more === false) promote(deps, scan)
          writeJson(res, 200, payload)
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },
    {
      path: SKILL_HUB_API.agentsFile,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const requested = (url.searchParams.get('path') ?? '').trim()
        if (requested === '') { writeError(res, 400, 'path is required'); return }
        try {
          // 用缓存（∪ 进行中的扫描）校验成员资格：点开一行不再重走整棵树。
          const scan = await rosterFor(deps)
          writeJson(res, 200, { ok: true, file: await readInstructionFile(deps, requested, scan) })
        } catch (error) {
          if (error instanceof InstructionFileError) { writeError(res, error.status, error.message); return }
          writeRouteError(res, error)
        }
      },
    },
    // ------------------------------------------------------ agents/file/save
    // 写回一份指令文件的整份原文。受理范围 = 清单里已经在列的文件（成员
    // 资格与正文读取共用同一份 roster），所以这个入口不新建文件、不改名；
    // 期间被外部改过则 409 + 最新内容，客户端弹三选。
    {
      path: SKILL_HUB_API.agentsFileSave,
      methods: ['POST'],
      jsonBody: true,
      bodyLimit: MAX_EDIT_BODY_BYTES,
      handler: async ({ res, body }) => {
        const requested = readString(body, 'path').trim()
        if (requested === '') { writeError(res, 400, 'path is required'); return }
        if (typeof body.content !== 'string') { writeError(res, 400, 'content must be a string'); return }
        const expectedMtime = readNumber(body, 'expectedMtime')
        const expectedSize = readNumber(body, 'expectedSize')
        const expected = expectedMtime !== undefined && expectedSize !== undefined
          ? { modifiedAt: expectedMtime, size: expectedSize }
          : undefined
        try {
          const scan = await rosterFor(deps)
          const saved = await saveInstructionFile(deps, requested, body.content, expected, scan)
          writeJson(res, 200, { ok: true, ...saved } satisfies InstructionFileSaveResponse)
        } catch (error) {
          if (error instanceof InstructionFileError) { writeError(res, error.status, error.message); return }
          if (error instanceof StaleContentError) {
            writeJson(res, 409, { error: error.message, code: 'stale', latest: error.latest } satisfies EditConflictResponse)
            return
          }
          if (writeFileFailure(res, error, requested)) return
          writeRouteError(res, error)
        }
      },
    },
  ]
}

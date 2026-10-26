/**
 * AGENTS.md 域路由：只读的指令文件清单（用户级 + 每个已知工作区）。
 *
 * 这一页不写任何文件，也没有开关语义——dsh 对指令文件没有启用/禁用概念。
 * 排除目录清单走既有的 /config 路由（HubConfig.excludeDirs），这一族只负责
 * 按当前配置扫一遍磁盘。
 *
 * 清单和点开正文走同一份**短命缓存**：一次扫描要递归遍历每个工作区（本机
 * 约 0.4s，几千个目录），而「进入分类 → 点开一行」是连着的两次请求。缓存
 * 只保留 10 秒、按（家目录 + 排除目录）作键，`?fresh=1` 强制重扫（面板的
 * 「重新扫描」和保存排除目录后都走它），并发请求共享同一个 promise。
 */

import { agentsHome, dshHome } from '../store.ts'
import {
  MAX_EDIT_BODY_BYTES,
  resolveExcludeDirs,
  SKILL_HUB_API,
  type AgentsResponse,
  type EditConflictResponse,
  type InstructionFileSaveResponse,
} from '../protocol.ts'
import { InstructionFileError, readInstructionFile, saveInstructionFile, scanInstructionGroups, StaleContentError } from '../instructions.ts'
import { configOf, readNumber, readString, writeError, writeFileFailure, writeJson, writeRouteError, type RouteSpec, type SkillHubRouteDeps } from './helpers.ts'

/** 清单缓存的有效期：够覆盖「进入分类 → 点开一行」，又不至于让外部改动看不见。 */
const SCAN_CACHE_TTL_MS = 10_000

interface CachedScan {
  at: number
  value: Promise<AgentsResponse>
}

/** 缓存按（家目录 + 排除目录）分键：配置或部署变化立即失效。 */
const scans = new Map<string, CachedScan>()

function scanKey(deps: SkillHubRouteDeps): string {
  return JSON.stringify({
    home: deps.home ?? dshHome(),
    agentsHome: deps.agentsHome ?? agentsHome(),
    excludeDirs: resolveExcludeDirs(configOf(deps).excludeDirs),
  })
}

/**
 * Return the cached scan, refreshing it when stale or forced.
 * @param deps - route dependencies.
 * @param fresh - bypass the cache (manual rescan).
 * @returns the shared scan promise.
 */
async function scanFor(deps: SkillHubRouteDeps, fresh: boolean): Promise<AgentsResponse> {
  const key = scanKey(deps)
  const hit = scans.get(key)
  if (!fresh && hit !== undefined && Date.now() - hit.at < SCAN_CACHE_TTL_MS) return hit.value
  const value = scanInstructionGroups(deps)
  scans.set(key, { at: Date.now(), value })
  // 失败的结果不留在缓存里，下一次请求重新扫。
  value.catch(() => { if (scans.get(key)?.value === value) scans.delete(key) })
  return value
}

/** AGENTS.md 页的全部路由 spec（由 routes.ts 包上统一围栏）。 */
export function agentsRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  return [
    {
      path: SKILL_HUB_API.agents,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const fresh = url.searchParams.get('fresh') === '1'
        try {
          writeJson(res, 200, await scanFor(deps, fresh))
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
          // 用清单缓存校验成员资格：点开一行不再重走整棵树。
          const scan = await scanFor(deps, false)
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
          const scan = await scanFor(deps, false)
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

/**
 * useAgentsFlow — AGENTS.md 页的数据域：索引缓存、分步扫描、单个文件正文、排除目录读写。
 *
 * 索引的取法（页面打开 / 手动重新扫描都走它）：
 *   1. 先读 host 的缓存（GET /agents）。命中就整份铺上——页面立即有内容，不再
 *      等一次全树遍历；没有缓存就跳过这一步。
 *   2. 然后按步重扫（GET /agents/scan）：第 0 步用户级，其后每个工作区一步。
 *      每回来一步就把它替换到列表的同一位置，还没扫到的尾部继续沿用缓存内容，
 *      所以扫描期间列表不闪空、内容逐步变成新的。
 *   3. 最后一步落下后列表就是这一轮的完整结果（host 也已把它提升为缓存）。
 *
 * 百分比 = 已完成步数 / 总步数；`scan` 为 null 表示没有扫描在跑。
 *
 * 排除目录保存后立刻重扫，让「改了立即生效」在界面上可见。
 */

import { useCallback, useRef, useState } from 'react'
import type { AgentsResponse, AgentsScanStep, InstructionFileDetail, InstructionFileRef, InstructionGroup } from '../../../protocol.ts'
import { SkillHubApiError, type SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'

/** 详情页状态：先带着列表行的信息打开（标题/路径立刻可见），正文随后到。 */
export interface AgentsFileState {
  ref: InstructionFileRef
  /** 所属分组标题（用户级或工作区标题）。 */
  scope: string
  detail?: InstructionFileDetail
  loading: boolean
  error?: string
}

/** 扫描进度：已完成的步数与总步数（第 0 步之前 total 为 0，按钮按 0% 显示）。 */
export interface AgentsScanProgress {
  done: number
  total: number
}

export function useAgentsFlow(api: SkillHubApi) {
  const [agents, setAgents] = useState<AgentsResponse | null>(null)
  /** 扫描进度；null = 没有扫描在跑（「重新扫描」按钮可用）。 */
  const [scan, setScan] = useState<AgentsScanProgress | null>(null)
  const [agentsError, setAgentsError] = useState<string | null>(null)
  /** 排除目录保存中（禁用输入与按钮，避免连点写两次）。 */
  const [excludeSaving, setExcludeSaving] = useState(false)
  /** 打开的指令文件详情；null = 列表视图。 */
  const [agentsFile, setAgentsFile] = useState<AgentsFileState | null>(null)
  /** 当前列表（不走 state 也能读到：扫描合并要用它当「还没扫到的尾部」）。 */
  const groupsRef = useRef<InstructionGroup[]>([])
  /** 扫描代次：每次 loadAgents 自增，旧的一轮在下一个 await 后自行退出。 */
  const generation = useRef(0)

  const applyAgents = useCallback((excludeDirs: string[], groups: InstructionGroup[]): void => {
    groupsRef.current = groups
    setAgents({ ok: true, groups, excludeDirs })
  }, [])

  /**
   * 拉一轮索引：缓存打底 + 分步扫描逐步替换。
   * @param fresh - 跳过缓存读取，直接开始一轮新扫描（手动「重新扫描」/保存排除目录后）。
   */
  const loadAgents = useCallback(async (fresh = false): Promise<void> => {
    const run = ++generation.current
    setAgentsError(null)
    setScan({ done: 0, total: 0 })
    // 还没扫到的尾部沿用列表现状：缓存命中时它就是缓存，否则是上一次的结果。
    let base = groupsRef.current
    try {
      if (!fresh) {
        const cached = await api.agentsCache()
        if (run !== generation.current) return
        if (cached.cached) {
          base = cached.groups
          applyAgents(cached.excludeDirs, cached.groups)
        }
      }
      const live: InstructionGroup[] = []
      let scanId: string | undefined
      let step = 0
      let restarted = false
      for (;;) {
        let chunk: AgentsScanStep
        try {
          chunk = await api.agentsScan(scanId, step)
        } catch (error) {
          // 这一轮被别的扫描顶掉了（另一个面板、或 host 刚重载）：从头来一次。
          if (!restarted && error instanceof SkillHubApiError && error.code === 'expired') {
            restarted = true
            scanId = undefined
            step = 0
            live.length = 0
            continue
          }
          throw error
        }
        if (run !== generation.current) return
        scanId = chunk.scanId
        live[step] = chunk.group
        setScan({ done: chunk.done, total: chunk.total })
        // 已扫到的组替换原位，还没扫到的尾部沿用 base：扫描期间列表不闪空。
        const groups = live.slice(0, step + 1)
        for (let index = groups.length; index < base.length; index += 1) groups.push(base[index])
        applyAgents(chunk.excludeDirs, groups)
        if (!chunk.more) break
        step += 1
      }
      setScan(null)
    } catch (error) {
      if (run !== generation.current) return
      setAgentsError(errorMessage(error))
      setScan(null)
    }
  }, [api, applyAgents])

  /** @param dirs - 完整清单；null = 清除覆盖、回落到默认清单。 */
  const saveExcludeDirs = useCallback(async (dirs: string[] | null): Promise<void> => {
    setExcludeSaving(true)
    try {
      await api.updateConfig({ excludeDirs: dirs })
      setAgentsError(null)
      await loadAgents(true)
    } catch (error) {
      setAgentsError(errorMessage(error))
    } finally {
      setExcludeSaving(false)
    }
  }, [api, loadAgents])

  /** 打开一行：标题/副标题立刻显示，正文异步读。 */
  const openAgentsFile = useCallback(async (ref: InstructionFileRef, scope: string): Promise<void> => {
    setAgentsFile({ ref, scope, loading: true })
    try {
      const detail = await api.agentsFile(ref.absolute)
      setAgentsFile({ ref, scope, detail, loading: false })
    } catch (error) {
      setAgentsFile({ ref, scope, loading: false, error: errorMessage(error) })
    }
  }, [api])

  const closeAgentsFile = useCallback((): void => { setAgentsFile(null) }, [])

  /** 保存成功后回填正文与磁盘指纹（文件刚写过，不必再读一次）。 */
  const patchAgentsFile = useCallback((next: { content: string; size: number; modifiedAt: number }): void => {
    setAgentsFile((previous) => previous === null || previous.detail === undefined
      ? previous
      : { ...previous, detail: { ...previous.detail, content: next.content, size: next.size, modifiedAt: next.modifiedAt } })
  }, [])

  return {
    agents, scan, agentsError, excludeSaving,
    loadAgents, saveExcludeDirs,
    agentsFile, openAgentsFile, closeAgentsFile, patchAgentsFile,
  }
}

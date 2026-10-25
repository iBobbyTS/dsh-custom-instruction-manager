/**
 * useAgentsFlow — AGENTS.md 页的数据域：清单扫描、单个文件正文、排除目录读写。
 *
 * 这一页只读文件系统：清单 = host 扫一遍；点开一行 = 按清单里的绝对路径再读
 * 一次正文；保存排除目录 = 走既有的 /config 路由（HubConfig.excludeDirs），
 * 保存成功后立刻重扫，让「改了立即生效」在界面上可见。
 */

import { useCallback, useState } from 'react'
import type { AgentsResponse, InstructionFileDetail, InstructionFileRef } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
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

export function useAgentsFlow(api: SkillHubApi) {
  const [agents, setAgents] = useState<AgentsResponse | null>(null)
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsError, setAgentsError] = useState<string | null>(null)
  /** 排除目录保存中（禁用输入与按钮，避免连点写两次）。 */
  const [excludeSaving, setExcludeSaving] = useState(false)
  /** 打开的指令文件详情；null = 列表视图。 */
  const [agentsFile, setAgentsFile] = useState<AgentsFileState | null>(null)

  /** @param fresh - 跳过 host 的 10 秒清单缓存（手动「重新扫描」）。 */
  const loadAgents = useCallback(async (fresh = false): Promise<void> => {
    setAgentsLoading(true)
    try {
      setAgents(await api.agents({ fresh }))
      setAgentsError(null)
    } catch (error) {
      setAgentsError(errorMessage(error))
    } finally {
      setAgentsLoading(false)
    }
  }, [api])

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

  return {
    agents, agentsLoading, agentsError, excludeSaving,
    loadAgents, saveExcludeDirs,
    agentsFile, openAgentsFile, closeAgentsFile,
  }
}

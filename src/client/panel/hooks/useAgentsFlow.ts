/**
 * useAgentsFlow — AGENTS.md 页的数据域：扫描结果、排除目录清单的读写。
 *
 * 这一页只读文件系统：加载 = 让 host 扫一遍，保存排除目录 = 走既有的
 * /config 路由（HubConfig.excludeDirs），保存成功后立刻重扫，让「改了立即
 * 生效」在界面上可见。
 */

import { useCallback, useState } from 'react'
import type { AgentsResponse } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'

export function useAgentsFlow(api: SkillHubApi) {
  const [agents, setAgents] = useState<AgentsResponse | null>(null)
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [agentsError, setAgentsError] = useState<string | null>(null)
  /** 排除目录保存中（禁用输入与按钮，避免连点写两次）。 */
  const [excludeSaving, setExcludeSaving] = useState(false)

  const loadAgents = useCallback(async (): Promise<void> => {
    setAgentsLoading(true)
    try {
      setAgents(await api.agents())
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
      await loadAgents()
    } catch (error) {
      setAgentsError(errorMessage(error))
    } finally {
      setExcludeSaving(false)
    }
  }, [api, loadAgents])

  return { agents, agentsLoading, agentsError, excludeSaving, loadAgents, saveExcludeDirs }
}

/**
 * useMcpFlow — MCP 分类页的数据域：服务器列表、展开状态、开关与结果提示。
 *
 * 只在进入 MCP 分类时拉一次（不参与目录/统计的 5s/60s 轮询）：MCP 的启用态
 * 只在用户动手或 dsh 重启时变化，定时重读只会白跑。
 *
 * 开关响应里已经带回刷新后的列表，所以开关后不再补一次 GET。
 */

import { useCallback, useRef, useState } from 'react'
import type { McpResponse } from '../../../protocol.ts'
import type { HubKey } from '../../locales.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage, tt } from '../../helpers.ts'

/** 一次开关的结果提示（存键 + 插值，语言切换后仍然正确）。 */
export interface McpNotice {
  kind: 'ok' | 'warn' | 'error'
  key: HubKey
  values?: Record<string, string>
}

/** MCP 页的完整状态与动作面。 */
export interface McpFlow {
  data: McpResponse | null
  loading: boolean
  error: string | null
  /** 正在开关的服务器 entryId（该行整体禁用交互）。 */
  busyEntry: string | null
  /** 最近一次开关的结果；null = 没有提示。 */
  notice: McpNotice | null
  /** 展开了工具清单的服务器 entryId 集合。 */
  expanded: ReadonlySet<string>
  /** 读一次服务器列表。 */
  load: () => Promise<void>
  /** 启用/禁用一台服务器。 */
  toggle: (entryId: string, enabled: boolean) => Promise<void>
  /** 展开/收起一台服务器的工具清单。 */
  toggleExpanded: (entryId: string) => void
  dismissNotice: () => void
}

/** dsh 的重启原因 → 文案键；未知 token 原样显示，不吞掉信息。 */
const RESTART_KEYS: Record<string, HubKey> = {
  'no-hmr': 'mcp.restart.noHmr',
  'package-moved': 'mcp.restart.packageMoved',
  'host-module': 'mcp.restart.hostModule',
  'unmanaged-plugin': 'mcp.restart.unmanaged',
  'module-comparison': 'mcp.restart.moduleComparison',
}

/** dsh 的失败分类 → 文案键（这些错误没有 diagnostic，只有 code）。 */
const ERROR_CODE_KEYS: Record<string, HubKey> = {
  unaddressable: 'mcp.toggleCode.unaddressable',
  'management-required': 'mcp.toggleCode.managementRequired',
  'unknown-plugin': 'mcp.toggleCode.unknownPlugin',
}

export function useMcpFlow(api: SkillHubApi): McpFlow {
  const [data, setData] = useState<McpResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyEntry, setBusyEntry] = useState<string | null>(null)
  const [notice, setNotice] = useState<McpNotice | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** 读取代次：后一次读取顶掉前一次（快速点「刷新」不会让旧结果覆盖新结果）。 */
  const generation = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const run = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const next = await api.mcp()
      if (run !== generation.current) return
      setData(next)
    } catch (failure) {
      if (run !== generation.current) return
      setError(errorMessage(failure))
    } finally {
      if (run === generation.current) setLoading(false)
    }
  }, [api])

  const toggle = useCallback(async (entryId: string, enabled: boolean): Promise<void> => {
    // 先占一代：并发的读（或另一次开关）不能把这次的结果覆盖掉。
    const run = ++generation.current
    setBusyEntry(entryId)
    setNotice(null)
    try {
      const response = await api.toggleMcp(entryId, enabled)
      if (run !== generation.current) return
      setData(response.mcp)
      if (response.application === 'applied') {
        setNotice({ kind: 'ok', key: 'mcp.toggleApplied' })
      } else if (response.application === 'restart-required') {
        const named = response.restartReason !== undefined ? RESTART_KEYS[response.restartReason] : undefined
        const reason = named !== undefined ? tt(named) : (response.restartReason ?? tt('mcp.restart.unknown'))
        setNotice({ kind: 'warn', key: 'mcp.toggleRestart', values: { reason } })
      } else if (response.application === 'overridden') {
        setNotice({ kind: 'warn', key: 'mcp.toggleOverridden' })
      } else {
        const named = response.errorCode !== undefined ? ERROR_CODE_KEYS[response.errorCode] : undefined
        const text = named !== undefined ? tt(named) : (response.error ?? tt('mcp.toggleFailedGeneric'))
        setNotice({ kind: 'error', key: 'mcp.toggleFailed', values: { error: text } })
      }
    } catch (failure) {
      if (run !== generation.current) return
      setNotice({ kind: 'error', key: 'mcp.toggleFailed', values: { error: errorMessage(failure) } })
    } finally {
      // 这一行由本次调用独占：无论结果是否被更新的读取代，都要解锁。
      setBusyEntry(null)
    }
  }, [api])

  const toggleExpanded = useCallback((entryId: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }, [])

  const dismissNotice = useCallback((): void => { setNotice(null) }, [])

  return { data, loading, error, busyEntry, notice, expanded, load, toggle, toggleExpanded, dismissNotice }
}

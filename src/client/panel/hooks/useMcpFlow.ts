/**
 * useMcpFlow — MCP 分类页的数据域：服务器列表、展开状态、开关、新建/编辑/删除。
 *
 * 只在进入 MCP 分类时拉一次（不参与目录/统计的 5s/60s 轮询）：MCP 的启用态
 * 只在用户动手或 dsh 重启时变化，定时重读只会白跑。
 *
 * 写操作的响应里已经带回刷新后的列表，所以保存/删除后不再补一次 GET。
 */

import { useCallback, useRef, useState } from 'react'
import type { McpFieldError, McpResponse, McpServerInfo, McpServerInput } from '../../../protocol.ts'
import type { HubKey } from '../../locales.ts'
import { SkillHubApiError, type SkillHubApi } from '../../api.ts'
import { errorMessage, tt } from '../../helpers.ts'

/** 一次操作的结果提示（存键 + 插值，语言切换后仍然正确）。 */
export interface McpNotice {
  kind: 'ok' | 'warn' | 'error'
  key: HubKey
  values?: Record<string, string>
}

/** 打开中的表单：新建，或编辑一台已存在的服务器。 */
export type McpEditorState = { mode: 'create' } | { mode: 'edit'; server: McpServerInfo }

/** MCP 页的完整状态与动作面。 */
export interface McpFlow {
  data: McpResponse | null
  loading: boolean
  error: string | null
  /** 正在开关/删除的服务器 entryId（该行整体禁用交互）。 */
  busyEntry: string | null
  /** 最近一次操作的结果；null = 没有提示。 */
  notice: McpNotice | null
  /** 展开了工具清单的服务器 entryId 集合。 */
  expanded: ReadonlySet<string>
  /** 打开中的新建/编辑表单。 */
  editor: McpEditorState | null
  /** 表单正在保存（禁用字段与按钮）。 */
  editorBusy: boolean
  /** 字段级校验失败（host 的 400 响应，按字段标红）。 */
  editorErrors: McpFieldError[]
  /** 表单里的非字段错误（网络/409）：显示在对话框内，而不是被遮罩挡住。 */
  editorError: string | null
  /** 读一次服务器列表。 */
  load: () => Promise<void>
  /** 启用/禁用一台服务器。 */
  toggle: (entryId: string, enabled: boolean) => Promise<void>
  /** 展开/收起一台服务器的工具清单。 */
  toggleExpanded: (entryId: string) => void
  /** 打开新建表单（不传）或编辑表单（传服务器）。 */
  openEditor: (server?: McpServerInfo) => void
  /** 关闭表单并丢弃草稿。 */
  closeEditor: () => void
  /** 新建（entryId 缺省）或保存编辑。 */
  saveServer: (input: McpServerInput, entryId?: string) => Promise<void>
  /** 删除本页管理的服务器。 */
  removeServer: (entryId: string) => Promise<void>
  dismissNotice: () => void
}

/** dsh 的重启原因 → 文案键；未知 token 原样显示，不吞掉信息。 */
const RESTART_KEYS: Record<string, HubKey> = {
  'no-hmr': 'mcp.restart.noHmr',
  'package-moved': 'mcp.restart.packageMoved',
  'host-module': 'mcp.restart.hostModule',
  'unmanaged-plugin': 'mcp.restart.unmanaged',
  'module-comparison': 'mcp.restart.moduleComparison',
  'load-pending': 'mcp.restart.loadPending',
}

/** dsh 的失败分类 → 文案键（这些错误没有 diagnostic，只有 code）。 */
const ERROR_CODE_KEYS: Record<string, HubKey> = {
  unaddressable: 'mcp.toggleCode.unaddressable',
  'management-required': 'mcp.toggleCode.managementRequired',
  'unknown-plugin': 'mcp.toggleCode.unknownPlugin',
}

/** 重启原因的可读文本（已知 token 走字典，其余原样）。 */
function restartText(reason: string | undefined): string {
  const named = reason !== undefined ? RESTART_KEYS[reason] : undefined
  return named !== undefined ? tt(named) : (reason ?? tt('mcp.restart.unknown'))
}

/** 从 400 错误体里取字段错误（形状不对就当没有，退回提示条）。 */
function fieldErrorsOf(error: unknown): McpFieldError[] {
  if (!(error instanceof SkillHubApiError)) return []
  const body = error.body
  if (typeof body !== 'object' || body === null) return []
  const fields = (body as { fields?: unknown }).fields
  if (!Array.isArray(fields)) return []
  const out: McpFieldError[] = []
  for (const entry of fields) {
    if (typeof entry !== 'object' || entry === null) continue
    const field = (entry as { field?: unknown }).field
    const code = (entry as { code?: unknown }).code
    if (typeof field !== 'string') continue
    if (code !== 'required' && code !== 'invalid' && code !== 'duplicate' && code !== 'range') continue
    out.push({ field, code })
  }
  return out
}

export function useMcpFlow(api: SkillHubApi): McpFlow {
  const [data, setData] = useState<McpResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyEntry, setBusyEntry] = useState<string | null>(null)
  const [notice, setNotice] = useState<McpNotice | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [editor, setEditor] = useState<McpEditorState | null>(null)
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorErrors, setEditorErrors] = useState<McpFieldError[]>([])
  const [editorError, setEditorError] = useState<string | null>(null)
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
        setNotice({ kind: 'warn', key: 'mcp.toggleRestart', values: { reason: restartText(response.restartReason) } })
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

  const openEditor = useCallback((server?: McpServerInfo): void => {
    setEditorErrors([])
    setEditorError(null)
    setEditor(server === undefined ? { mode: 'create' } : { mode: 'edit', server })
  }, [])

  const closeEditor = useCallback((): void => {
    setEditor(null)
    setEditorErrors([])
    setEditorError(null)
  }, [])

  const saveServer = useCallback(async (input: McpServerInput, entryId?: string): Promise<void> => {
    const run = ++generation.current
    setEditorBusy(true)
    setEditorErrors([])
    setEditorError(null)
    setNotice(null)
    try {
      const response = await api.saveMcpServer(input, entryId)
      if (run !== generation.current) return
      setData(response.mcp)
      setEditor(null)
      if (response.application === 'applied') {
        setNotice({ kind: 'ok', key: 'mcp.saveApplied' })
      } else if (response.application === 'restart-required') {
        setNotice({ kind: 'warn', key: 'mcp.saveRestart', values: { reason: restartText(response.restartReason) } })
      } else {
        setNotice({ kind: 'error', key: 'mcp.saveFailed', values: { error: response.application } })
      }
    } catch (failure) {
      if (run !== generation.current) return
      const fields = fieldErrorsOf(failure)
      if (fields.length > 0) setEditorErrors(fields)
      else setEditorError(errorMessage(failure))
    } finally {
      setEditorBusy(false)
    }
  }, [api])

  const removeServer = useCallback(async (entryId: string): Promise<void> => {
    const run = ++generation.current
    setBusyEntry(entryId)
    setNotice(null)
    try {
      const response = await api.removeMcpServer(entryId)
      if (run !== generation.current) return
      setData(response.mcp)
      setExpanded((previous) => {
        if (!previous.has(entryId)) return previous
        const next = new Set(previous)
        next.delete(entryId)
        return next
      })
      if (response.application === 'applied') {
        setNotice({ kind: 'ok', key: 'mcp.removeApplied' })
      } else if (response.application === 'restart-required') {
        setNotice({ kind: 'warn', key: 'mcp.removeRestart', values: { reason: restartText(response.restartReason) } })
      } else {
        setNotice({ kind: 'error', key: 'mcp.removeFailed', values: { error: response.application } })
      }
    } catch (failure) {
      if (run !== generation.current) return
      setNotice({ kind: 'error', key: 'mcp.removeFailed', values: { error: errorMessage(failure) } })
    } finally {
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

  return {
    data,
    loading,
    error,
    busyEntry,
    notice,
    expanded,
    editor,
    editorBusy,
    editorErrors,
    editorError,
    load,
    toggle,
    toggleExpanded,
    openEditor,
    closeEditor,
    saveServer,
    removeServer,
    dismissNotice,
  }
}

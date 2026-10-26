/**
 * useTokenModels — 「管理模型」的数据与动作：列出全部可选模型、记住当前选中，
 * 勾选就调用宿主下载词表、取消勾选就让宿主删掉那份词表。
 *
 * 选中集合存在宿主侧（插件数据目录的 state.json），不是 localStorage：它决定
 * 磁盘上留哪几份 25 MB 级词表，属于"这台机器装了什么"，换浏览器不该变。
 *
 * busy 记正在下载/删除的那一个 id：下载 19 MB 要几秒，期间把整组 checkbox 都
 * 禁用，避免用户在同一个模型上连点两次（第二次会看到"已勾选"又立刻反选）。
 */

import { useCallback, useEffect, useState } from 'react'
import type { TokenModelState } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'

export interface TokenModelsState {
  /** 服务器返回的模型列表；`null` = 还没拿到（表格先按协议层默认集合渲染）。 */
  models: TokenModelState[] | null
  loading: boolean
  /** 正在下载/删除的模型 id；`null` 表示空闲。 */
  busy: string | null
  /** 最近一次拉取或改选失败的原因。 */
  error?: string
  /** 勾选/取消一个模型（成功后把新列表写回）；返回是否成功，供调用方决定要不要重算。 */
  select: (id: string, selected: boolean) => Promise<boolean>
  /** 重新拉取（切回面板、重试时用）。 */
  reload: () => Promise<void>
}

export function useTokenModels(api: SkillHubApi, enabled: boolean): TokenModelsState {
  const [models, setModels] = useState<TokenModelState[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setModels(await api.tokenModels())
      setError(undefined)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [api])

  // 只在面板真正会用到它时拉（Skill/AGENTS 这类含文件详情的分类）；
  // 市场、关于这些页面不必为一个计数功能发一次请求。
  useEffect(() => {
    if (!enabled) return
    void reload()
  }, [enabled, reload])

  const select = useCallback(async (id: string, selected: boolean): Promise<boolean> => {
    setBusy(id)
    try {
      setModels(await api.selectTokenModel(id, selected))
      setError(undefined)
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(null)
    }
  }, [api])

  return { models, loading, busy, error, select, reload }
}

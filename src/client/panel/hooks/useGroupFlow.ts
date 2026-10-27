/**
 * useGroupFlow — 分组域：groups 加载（集合组 + origin 映射）。组内技能的
 * 启用/禁用不存在之后，这里只剩数据加载。
 */

import { useCallback, useState } from 'react'
import type { GroupsResponse } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'
import type { FlowNotices } from './shared.ts'

export function useGroupFlow(api: SkillHubApi, shared: FlowNotices) {
  const [groupsState, setGroupsState] = useState<GroupsResponse | null>(null)

  /** 加载系统集合组 + origin 映射。 */
  const loadGroups = useCallback(async (): Promise<void> => {
    try {
      setGroupsState(await api.groups())
    } catch (error) {
      shared.fail(errorMessage(error))
    }
  }, [api, shared])

  return { groupsState, loadGroups }
}

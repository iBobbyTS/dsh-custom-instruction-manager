/**
 * useGroupFlow — 分组域：groups 加载、集合重排、来源顶层重排、组开关与冲突
 * 解决。目录侧只消费 batchToggleNames + actionNames（聚合根传入），不碰目录
 * state。
 */

import { useCallback, useState } from 'react'
import type { GroupsResponse } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'
import { conflictsOnClose, type GroupSwitchState } from '../../grouping.ts'
import { runFlow, type FlowNotices } from './shared.ts'
import type { ConflictDialogState } from '../dialogs.tsx'

export function useGroupFlow(
  api: SkillHubApi,
  shared: FlowNotices,
  /** 整组开关的执行器（目录域提供，stable）。 */
  batchToggleNames: (names: string[], enabled: boolean) => Promise<void>,
  /** 当前启用且可写的技能名（目录域派生）。 */
  actionNames: ReadonlySet<string>,
) {
  const [groupsState, setGroupsState] = useState<GroupsResponse | null>(null)
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null)

  /** 加载系统集合组 + origin 映射。 */
  const loadGroups = useCallback(async (): Promise<void> => {
    try {
      setGroupsState(await api.groups())
    } catch (error) {
      shared.fail(errorMessage(error))
    }
  }, [api, shared])

  /** 所有来源集合：key → 成员名。 */
  const groupMap = useCallback((): Map<string, string[]> => {
    const map = new Map<string, string[]>()
    for (const collection of groupsState?.collections ?? []) map.set('col:' + collection.name, collection.skillNames)
    return map
  }, [groupsState])

  /**
   * Toggle a whole group via its tri-state switch. Closing with members that
   * are enabled in other groups opens the conflict dialog instead.
   */
  const toggleGroup = useCallback((key: string, name: string, view: GroupSwitchState): void => {
    const members = groupMap().get(key) ?? []
    if (members.length === 0) return
    if (view === 'off') {
      void batchToggleNames(members, true)
      return
    }
    const others = [...groupMap().entries()].filter(([otherKey]) => otherKey !== key).map(([, memberNames]) => ({ members: memberNames }))
    const conflicts = conflictsOnClose(members, actionNames, others)
    if (conflicts.length > 0) {
      setConflictDialog({ key, name, conflicts })
    } else {
      void batchToggleNames(members.filter((member) => actionNames.has(member)), false)
    }
  }, [groupMap, actionNames, batchToggleNames])

  /** Resolve the open conflict dialog. */
  const resolveConflict = useCallback(async (closeAll: boolean): Promise<void> => {
    const dialog = conflictDialog
    if (dialog === null) return
    setConflictDialog(null)
    const members = groupMap().get(dialog.key) ?? []
    if (closeAll) {
      await batchToggleNames(members.filter((member) => actionNames.has(member)), false)
    } else {
      await batchToggleNames(
        members.filter((member) => actionNames.has(member) && !dialog.conflicts.includes(member)),
        false,
      )
    }
  }, [conflictDialog, groupMap, actionNames, batchToggleNames])

  return {
    groupsState, conflictDialog,
    setConflictDialog,
    loadGroups, groupMap, toggleGroup, resolveConflict,
  }
}

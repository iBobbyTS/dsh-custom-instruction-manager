/**
 * useEditFlow — 详情页正文编辑的状态机：进入编辑、草稿、保存、冲突三选。
 *
 * 两个详情页（技能正文 / 指令文件整份原文）共用同一台状态机，差异只有两处：
 * 保存时调用的接口，以及保存成功后回填的页面字段。状态归这里，视图只收
 * props，所以视图仍可以用 renderToStaticMarkup 直接断言每一种状态。
 *
 * 冲突语义（需求契约）：保存时带上载入时的 mtime + 大小，host 发现磁盘上的
 * 文件已经变过就回 409 + 最新内容，这里弹三选——
 *   复制并重新加载：草稿复制到剪贴板，编辑器换成磁盘上的最新版本；
 *   继续编辑：关掉弹窗，草稿原样保留，不写盘；
 *   仍然覆盖：不带指纹再存一次，用草稿覆盖磁盘。
 */

import { useCallback, useRef, useState } from 'react'
import type { EditConflictResponse, EditSnapshot, InstructionFileSaveRequest, SkillContentRequest } from '../../../protocol.ts'
import { SkillHubApiError, type SkillHubApi } from '../../api.ts'
import { copyTextToClipboard, errorMessage, tt } from '../../helpers.ts'

/** 保存成功后交给面板的事件：面板据此回填详情、正文与 token 表。 */
export type EditSavedEvent =
  | { kind: 'skill'; name: string; cwd?: string; path: string; snapshot: EditSnapshot }
  | { kind: 'agents'; path: string; snapshot: EditSnapshot }

/** 一次编辑的目标（技能名或指令文件绝对路径 + 载入时的磁盘指纹）。 */
export interface EditTarget {
  kind: 'skill' | 'agents'
  /** 技能名，或指令文件的绝对路径。 */
  key: string
  /** 项目技能所属工作区。 */
  cwd?: string
  /** 最终写入的文件（详情页已知时传，用于提示）。 */
  path?: string
  /** 载入时的 mtime/size；缺省表示不做冲突检查。 */
  modifiedAt?: number
  size?: number
}

/** 冲突弹窗的三个选择。 */
export type EditChoice = 'copy-reload' | 'continue' | 'overwrite'

interface EditSession {
  target: EditTarget
  /** 进入编辑时的正文（判断「有未保存改动」）。 */
  base: string
  draft: string
  busy: boolean
  error?: string
  /** 磁盘上的最新状态；非空 = 弹三选框。 */
  conflict?: EditSnapshot
}

/** 载入指纹（两端都在才带；host 只在两端都有时比对）。 */
function fingerprint(target: EditTarget): { expectedMtime?: number; expectedSize?: number } {
  return target.modifiedAt !== undefined && target.size !== undefined
    ? { expectedMtime: target.modifiedAt, expectedSize: target.size }
    : {}
}

/** 冲突响应体里的 `latest`（类型守卫，避免把脏数据塞进编辑器）。 */
function latestOf(body: unknown): EditSnapshot | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const latest = (body as Partial<EditConflictResponse>).latest
  if (latest === undefined || typeof latest.content !== 'string') return undefined
  if (typeof latest.modifiedAt !== 'number' || typeof latest.size !== 'number') return undefined
  return { content: latest.content, modifiedAt: latest.modifiedAt, size: latest.size }
}

export function useEditFlow(api: SkillHubApi, onSaved: (event: EditSavedEvent) => void) {
  const [session, setSessionState] = useState<EditSession | null>(null)
  /** 同一份状态的可同步读取句柄：保存/取消要看最新的草稿，不能等下一次渲染。 */
  const sessionRef = useRef<EditSession | null>(null)
  const savedRef = useRef(onSaved)
  savedRef.current = onSaved

  const apply = useCallback((next: EditSession | null): void => {
    sessionRef.current = next
    setSessionState(next)
  }, [])

  const patch = useCallback((next: Partial<EditSession>): void => {
    const current = sessionRef.current
    if (current === null) return
    apply({ ...current, ...next })
  }, [apply])

  /** 进入编辑：草稿与基准都从页面当前正文开始。 */
  const start = useCallback((target: EditTarget, content: string): void => {
    apply({ target, base: content, draft: content, busy: false })
  }, [apply])

  /**
   * 退出编辑。有未保存改动时先确认；用户选「不放弃」就留在编辑态。
   * @returns true 表示已经退出（或本来就不在编辑态）。
   */
  const cancel = useCallback((): boolean => {
    const current = sessionRef.current
    if (current === null) return true
    if (current.draft !== current.base && !window.confirm(tt('detail.editDiscard'))) return false
    apply(null)
    return true
  }, [apply])

  const commit = useCallback(async (overwrite: boolean): Promise<void> => {
    const current = sessionRef.current
    if (current === null || current.busy) return
    patch({ busy: true, error: undefined, conflict: undefined })
    const expected = overwrite ? {} : fingerprint(current.target)
    try {
      if (current.target.kind === 'skill') {
        const payload: SkillContentRequest = {
          name: current.target.key,
          ...(current.target.cwd !== undefined && current.target.cwd !== '' ? { cwd: current.target.cwd } : {}),
          content: current.draft,
          ...expected,
        }
        const saved = await api.saveSkillContent(payload)
        apply(null)
        savedRef.current({
          kind: 'skill',
          name: current.target.key,
          ...(current.target.cwd !== undefined ? { cwd: current.target.cwd } : {}),
          path: saved.path,
          snapshot: { content: saved.content, modifiedAt: saved.modifiedAt, size: saved.size },
        })
      } else {
        const payload: InstructionFileSaveRequest = {
          path: current.target.key,
          content: current.draft,
          ...expected,
        }
        const saved = await api.saveAgentsFile(payload)
        apply(null)
        savedRef.current({
          kind: 'agents',
          path: saved.path,
          snapshot: { content: current.draft, modifiedAt: saved.modifiedAt, size: saved.size },
        })
      }
    } catch (error) {
      if (error instanceof SkillHubApiError && error.code === 'stale') {
        const latest = latestOf(error.body)
        if (latest !== undefined) {
          // 草稿继续留在编辑器里；三选之前不写盘、也不丢掉用户的改动。
          patch({ busy: false, conflict: latest })
          return
        }
      }
      patch({ busy: false, error: errorMessage(error) })
    }
  }, [api, apply, patch])

  const save = useCallback((): void => { void commit(false) }, [commit])

  const resolveConflict = useCallback((choice: EditChoice): void => {
    const current = sessionRef.current
    if (current === null || current.conflict === undefined) return
    const latest = current.conflict
    if (choice === 'continue') {
      patch({ conflict: undefined })
      return
    }
    if (choice === 'copy-reload') {
      // 先把草稿放进剪贴板，再换成磁盘上的版本——这样「重新加载」不会让
      // 用户刚才写的那段文字无声消失。
      void copyTextToClipboard(current.draft)
      patch({
        draft: latest.content,
        base: latest.content,
        conflict: undefined,
        error: undefined,
        target: { ...current.target, modifiedAt: latest.modifiedAt, size: latest.size },
      })
      return
    }
    void commit(true)
  }, [commit, patch])

  return {
    session,
    /** 当前有未保存改动。 */
    dirty: session !== null && session.draft !== session.base,
    start,
    setDraft: (value: string): void => { patch({ draft: value }) },
    cancel,
    save,
    resolveConflict,
  }
}

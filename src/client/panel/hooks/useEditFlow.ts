/**
 * useEditFlow — 正文编辑的草稿状态：正文框始终可写，草稿与磁盘内容分居两侧。
 *
 * 没有「编辑态」开关：详情页一到达就把当前正文放进来，用户直接改；下面固定
 * 是「保存 / 放弃所有编辑」。保存成功后草稿与基准都换成落盘的那份（按钮随之
 * 变灰），放弃则二次确认后回到载入时的磁盘内容。
 *
 * 冲突语义（需求契约）：保存时带上载入时的 mtime + 大小，host 发现磁盘上的
 * 文件已经变过就回 409 + 最新内容，这里弹三选——
 *   复制并重新加载：草稿复制到剪贴板，正文换成磁盘上的最新版本；
 *   继续编辑：关掉弹窗，草稿原样保留，不写盘；
 *   仍然覆盖：不带指纹再存一次，用草稿覆盖磁盘。
 */

import { useCallback, useRef, useState } from 'react'
import type { EditConflictResponse, EditSnapshot, InstructionFileSaveRequest, SkillContentRequest } from '../../../protocol.ts'
import { SkillHubApiError, type SkillHubApi } from '../../api.ts'
import { copyTextToClipboard, errorMessage, tt } from '../../helpers.ts'

/** 保存成功后交给面板的事件：面板据此刷新提示与 token 表。 */
export type EditSavedEvent =
  | { kind: 'skill'; name: string; cwd?: string; path: string; snapshot: EditSnapshot }
  | { kind: 'agents'; path: string; snapshot: EditSnapshot }

/** 一次编辑的目标（技能名或指令文件绝对路径 + 当前磁盘指纹）。 */
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
  /** 载入（或上次保存/放弃）时的磁盘正文。 */
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

/** 冲突响应体里的 `latest`（类型守卫，避免把脏数据塞进正文框）。 */
function latestOf(body: unknown): EditSnapshot | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const latest = (body as Partial<EditConflictResponse>).latest
  if (latest === undefined || typeof latest.content !== 'string') return undefined
  if (typeof latest.modifiedAt !== 'number' || typeof latest.size !== 'number') return undefined
  return { content: latest.content, modifiedAt: latest.modifiedAt, size: latest.size }
}

export function useEditFlow(api: SkillHubApi, onSaved: (event: EditSavedEvent) => void) {
  const [session, setSessionState] = useState<EditSession | null>(null)
  /** 同一份状态的可同步读取句柄：保存/放弃要看最新的草稿，不能等下一次渲染。 */
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

  /**
   * 详情页正文到达/刷新时把会话对齐到当前文件。同一个文件不清草稿：只有
   * 「磁盘正文确实变了」才动它（草稿干净就跟上，脏就保留，等保存时弹三选）。
   * 正文没变但指纹变了（例如刚改过调用方式）时只换指纹，避免误判冲突。
   */
  const begin = useCallback((target: EditTarget, content: string): void => {
    const current = sessionRef.current
    if (current === null || current.target.kind !== target.kind || current.target.key !== target.key) {
      apply({ target, base: content, draft: content, busy: false })
      return
    }
    if (content === current.base) {
      patch({ target })
      return
    }
    if (current.draft === current.base) {
      apply({ target, base: content, draft: content, busy: false })
    }
  }, [apply, patch])

  /** 离开详情页：丢掉会话（回来时按磁盘内容重新开始）。 */
  const clear = useCallback((): void => { apply(null) }, [apply])

  /** 有未保存改动时先确认；返回 false 表示用户选择继续编辑。 */
  const confirmDiscard = useCallback((): boolean => {
    const current = sessionRef.current
    if (current === null || current.draft === current.base) return true
    return window.confirm(tt('detail.editDiscard'))
  }, [])

  /** 放弃所有编辑：二次确认后恢复成载入时的磁盘内容。 */
  const discard = useCallback((): void => {
    const current = sessionRef.current
    if (current === null || current.draft === current.base) return
    if (!window.confirm(tt('detail.editDiscard'))) return
    patch({ draft: current.base, error: undefined, conflict: undefined })
  }, [patch])

  const commit = useCallback(async (overwrite: boolean): Promise<void> => {
    const current = sessionRef.current
    if (current === null || current.busy) return
    // 没有改动就不写盘（保存按钮此时也是禁用的，这里只是兜底）。
    if (!overwrite && current.draft === current.base) return
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
        // 落盘的那份成为新的基准：正文框里是它，按钮随即变灰。
        apply({
          target: { ...current.target, modifiedAt: saved.modifiedAt, size: saved.size },
          base: saved.content,
          draft: saved.content,
          busy: false,
        })
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
        apply({
          target: { ...current.target, modifiedAt: saved.modifiedAt, size: saved.size },
          base: current.draft,
          draft: current.draft,
          busy: false,
        })
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
          // 草稿继续留在正文框里；三选之前不写盘、也不丢掉用户的改动。
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
      apply({
        target: { ...current.target, modifiedAt: latest.modifiedAt, size: latest.size },
        base: latest.content,
        draft: latest.content,
        busy: false,
      })
      return
    }
    void commit(true)
  }, [apply, commit, patch])

  return {
    session,
    /** 当前有未保存改动。 */
    dirty: session !== null && session.draft !== session.base,
    begin,
    clear,
    setDraft: (value: string): void => { patch({ draft: value }) },
    save,
    discard,
    confirmDiscard,
    resolveConflict,
  }
}

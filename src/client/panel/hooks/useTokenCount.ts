/**
 * useTokenCount — 打开详情页时异步数一次当前文件原文的 token。
 *
 * 触发时机只有一个：原文出现或换成另一份（进入详情页、在列表里点开另一
 * 行）。不轮询、不防抖、不跟随编辑——这一步的正文是只读的，数字就是打开
 * 那一刻那份内容的数字；返回列表再点回来会重新数一次（宿主侧没有结果
 * 缓存，只有常驻的 tokenizer）。
 *
 * 状态是互斥的四档而不是几个并列布尔：表格要区分「还没开始（正文没到）」
 * 「在算」「算完了」「整个请求失败」，这四件事在 UI 上是四种文案，用布尔
 * 组合迟早会拼出`loading=false && entries=null`这种说不清的状态。
 */

import { useEffect, useState } from 'react'
import type { TokenCountEntry } from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage } from '../../helpers.ts'

/** 一次计数请求的生命周期。 */
export type TokenCountState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; entries: TokenCountEntry[] }
  | { status: 'failed'; error: string }

/**
 * @param api - panel 的 API 客户端。
 * @param text - 被计数的文件原文；`undefined` 表示正文还没到（详情页先渲染
 *   标题与元数据，正文随后到），此时不发请求。
 * @returns 当前这次计数的状态。
 */
export function useTokenCount(api: SkillHubApi, text: string | undefined): TokenCountState {
  const [state, setState] = useState<TokenCountState>({ status: 'idle' })

  useEffect(() => {
    if (text === undefined) {
      setState({ status: 'idle' })
      return
    }
    // 换文件/卸载后旧请求的结果必须丢掉：否则先点 A 再点 B，A 的慢结果会
    // 覆盖 B 的数字（两个词表首次都要下载，这种时序是常态）。
    let cancelled = false
    setState({ status: 'loading' })
    void api.countTokens(text)
      .then((entries) => { if (!cancelled) setState({ status: 'ready', entries }) })
      .catch((error: unknown) => { if (!cancelled) setState({ status: 'failed', error: errorMessage(error) }) })
    return () => { cancelled = true }
  }, [api, text])

  return state
}

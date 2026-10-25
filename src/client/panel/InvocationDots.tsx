/**
 * 调用方式圆点组：Agent 可调 → 蓝点，用户可调 → 绿点，两者互不排斥、可同时出现；
 * 都不可调时整组不渲染（列表图例：无圆点 = 不可被调用）。行与详情头部共用。
 */

import type { JSX } from 'react'
import type { CatalogSkill, HubConfig } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { dotStyle } from './format.ts'
import css from './panel.module.css'

export function InvocationDots(props: {
  invocation: CatalogSkill['invocation']
  /** Effective hub config; null while it has not loaded (falls back to defaults). */
  hubConfig: HubConfig | null
}): JSX.Element | null {
  const { invocation, hubConfig } = props
  if (!invocation.modelInvocable && !invocation.userInvocable) return null
  return (
    <span className={css.dots}>
      {invocation.modelInvocable
        ? <span className={css.dot + ' ' + css.dotModel} style={dotStyle(hubConfig?.dotModelColor)} title={tt('legend.model')} />
        : null}
      {invocation.userInvocable
        ? <span className={css.dot + ' ' + css.dotUser} style={dotStyle(hubConfig?.dotUserColor)} title={tt('legend.user')} />
        : null}
    </span>
  )
}

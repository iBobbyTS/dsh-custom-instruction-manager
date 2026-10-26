/**
 * Full-page skill detail view: metadata, upstream source card with
 * check/sync/follow-delete actions, and the raw SKILL.md body. Pure
 * presentation — every state value and action arrives as a prop, so the
 * panel stays the single owner of state.
 *
 * The source card is the only place update information appears, and it is
 * rendered solely for skills recorded against an upstream repo (imported
 * from a market source or a direct repo address). Built-in, plugin-provided,
 * hand-placed and project skills have no upstream, so they get no update UI
 * at all rather than a "no update checks" note — an empty slot is honest,
 * a label turning every skill into a "personal skill" is not.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import type { HubConfig, SkillDetail, SourceCheckResult, SourcesResponse } from '../../protocol.ts'
import { copyTextToClipboard, isDisplayNameDistinct, managedByText, tt } from '../helpers.ts'
import { managedByOf } from '../grouping.ts'
import css from './panel.module.css'
import { formatDateTime, shortSha } from './format.ts'
import type { TokenCountState } from './hooks/useTokenCount.ts'
import { InvocationDots } from './InvocationDots.tsx'
import { SourceStatusBadge } from './SourceStatusBadge.tsx'
import { TokenTable } from './TokenTable.tsx'

export interface SkillDetailViewProps {
  detail: SkillDetail
  hubConfig: HubConfig | null
  /** skillName → usage stat (count + last used). */
  uses: ReadonlyMap<string, { count: number; lastUsed?: number }>
  sourcesState: SourcesResponse | null
  sourceCheck: Readonly<Record<string, SourceCheckResult>>
  checkingSource: string | null
  syncingSource: string | null
  /** Whether the skill is currently hub-disabled (served from the .disabled file). */
  disabled?: boolean
  /**
   * 调用方式是否可写（host 按文件位置判定：用户根/项目根可写，内置/插件
   * provider 没有可写文件）。不可写时两个 checkbox 置灰；`undefined` 表示
   * host 还是旧版本（没有这个字段），整块调用方式直接不渲染，避免把
   * 「宿主不支持」误显示成「该技能只读」。
   */
  editable?: boolean
  /** 写入进行中（checkbox 禁用，避免连点写两次）。 */
  invocationBusy: boolean
  /** Token 统计（SKILL.md 正文到达后由 useTokenCount 异步算）。 */
  tokens: TokenCountState
  /** 写入调用方式（两个布尔是期望的「可调」状态，不是 frontmatter 的键值）。 */
  onInvocationChange: (modelInvocable: boolean, userInvocable: boolean) => void
  /** Re-enable a hub-disabled skill. */
  onEnable?: () => void
  onBack: () => void
  /** Check one source repo for upstream updates. */
  onCheck: (repo: string) => void
  /** Request syncing the skill (overwrites local edits; opens a confirm). */
  onSync: (repo: string, skills: string[]) => void
  /** Request following the upstream deletion (moves into the trash). */
  onFollowDelete: (repo: string, skills: string[]) => void
}

export function SkillDetailView(props: SkillDetailViewProps): JSX.Element {
  const { detail, hubConfig, uses, sourcesState, sourceCheck, checkingSource, syncingSource, disabled, editable, invocationBusy, tokens, onInvocationChange, onEnable, onBack, onCheck, onSync, onFollowDelete } = props
  const detailSource = sourcesState?.sources.find((source) => source.skills.includes(detail.name))
  const detailCheck = detailSource !== undefined ? sourceCheck[detailSource.repo] : undefined
  /** 管理方：上游仓库优先；否则按技能根目录/注册表 provider 归类。 */
  const detailManaged = managedByOf(
    { source: detail.source ?? (disabled === true ? 'user-dsh' : ''), provider: detail.provider },
    sourcesState?.origins[detail.name],
  )
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearTimeout(copyTimer.current) }, [])
  const copyText = (text: string, key: string): void => {
    void copyTextToClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(key)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setCopied(null) }, 1200)
    })
  }
  return (
    <div className={css.panel}>
      <div className={css.detailHead}>
        <button type='button' className={css.back} onClick={onBack}>{tt('detail.back')}</button>
        <span className={css.detailName} style={{ display:'inline-flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {detail.name}
          {isDisplayNameDistinct(detail.name, detail.displayName) ? <span className={css.displayName} style={{ fontSize:13, marginLeft:0 }}>{detail.displayName}</span> : null}
          <InvocationDots invocation={detail.invocation} hubConfig={hubConfig} />
        </span>
        <span className={css.actions} style={{ marginLeft: 'auto', gap: 6 }}>
          {disabled === true && onEnable !== undefined ? <button type='button' className={css.opBtn} role='switch' aria-checked={false} aria-label={tt('row.enable')} onClick={onEnable}>{tt('row.enable')}</button> : null}
          <button type='button' className={css.opBtn} onClick={() => { copyText('$' + detail.name, 'mention') }}>{copied === 'mention' ? tt('detail.copied') : tt('detail.copyMention')}</button>
          {detail.path !== undefined ? <button type='button' className={css.opBtn} onClick={() => { const path = detail.path; if (path !== undefined) copyText(path, 'path') }}>{copied === 'path' ? tt('detail.copied') : tt('detail.copyPath')}</button> : null}
        </span>
      </div>
      {editable !== undefined ? <section className={css.invocationCard} aria-label={tt('detail.invocation')} aria-busy={invocationBusy}>
        <div className={css.invocationHead}>
          <span className={css.invocationTitle}>{tt('detail.invocation')}</span>
          {!editable ? <span className={css.invocationReadonly}>{tt('detail.invocationReadonly')}</span> : null}
        </div>
        <label className={css.invocationRow}>
          <input
            type='checkbox'
            checked={detail.invocation.modelInvocable}
            disabled={!editable || invocationBusy}
            onChange={(event) => { onInvocationChange(event.target.checked, detail.invocation.userInvocable) }}
          />
          <span className={css.invocationLabel}>
            <span className={css.invocationName}>{tt('detail.modelInvocable')}</span>
            <small className={css.invocationHint}>{tt('detail.modelInvocableHint')}</small>
          </span>
        </label>
        <label className={css.invocationRow}>
          <input
            type='checkbox'
            checked={detail.invocation.userInvocable}
            disabled={!editable || invocationBusy}
            onChange={(event) => { onInvocationChange(detail.invocation.modelInvocable, event.target.checked) }}
          />
          <span className={css.invocationLabel}>
            <span className={css.invocationName}>{tt('detail.userInvocable')}</span>
            <small className={css.invocationHint}>{tt('detail.userInvocableHint')}</small>
          </span>
        </label>
      </section> : null}
      <div className={css.detailMeta}>
        <div className={css.detailMetaLine}>{tt('detail.managedBy')}: {managedByText(detailManaged)}</div>
        {detail.addedAt !== undefined ? <div className={css.detailMetaLine}>{tt('detail.addedAt')}: {formatDateTime(detail.addedAt)}</div> : null}
        {detail.updatedAt !== undefined ? <div className={css.detailMetaLine}>{tt('detail.updatedAt')}: {formatDateTime(detail.updatedAt)}</div> : null}
        {detail.path !== undefined ? <div className={css.detailMetaLine}>{tt('detail.path')}: {detail.path}</div> : null}
        {detail.whenToUse !== undefined ? <div className={css.detailMetaLine}>{tt('detail.whenToUse')}: {detail.whenToUse}</div> : null}
        {(() => {
          const stat = uses.get(detail.name)
          if (stat === undefined || stat.count === 0) return null
          const at = stat.lastUsed !== undefined ? ' · ' + formatDateTime(stat.lastUsed) : ''
          return <div className={css.detailMetaLine}>{tt('detail.uses')}: {stat.count}{at}</div>
        })()}
      </div>
      {detailSource !== undefined ? (
        <div className={css.sourceCard}>
          <div className={css.sourceCardTitle}>
            <a className={css.sourceLink} href={'https://github.com/' + detailSource.repo} target='_blank' rel='noreferrer'>{detailSource.repo}</a>
            {detailSource.ref !== undefined ? <span className={css.badge + ' ' + css.badgeSource}>{detailSource.ref}</span> : null}
            <SourceStatusBadge check={detailCheck} />
          </div>
          <div className={css.detailMetaLine}>
            {tt('source.commit')}: {detailSource.commitSha === '' ? tt('source.unverified') : shortSha(detailSource.commitSha)}
          </div>
          <div className={css.buttons + ' ' + css.actionsTop}>
            <button type='button' className={css.opBtn} disabled={checkingSource !== null} onClick={() => { onCheck(detailSource.repo) }}>
              {checkingSource === detailSource.repo ? tt('source.checking') : tt('source.check')}
            </button>
            {disabled !== true ? (
              <>
                <button type='button' className={css.opBtn} disabled={syncingSource !== null} onClick={() => { onSync(detailSource.repo, [detail.name]) }}>
                  {syncingSource === detailSource.repo ? tt('source.syncing') : tt('source.sync')}
                </button>
                {detailCheck?.deleted.includes(detail.name) === true
                  ? <button type='button' className={css.opBtn + ' ' + css.opDanger} onClick={() => { onFollowDelete(detailSource.repo, [detail.name]) }}>{tt('source.followDelete')}</button>
                  : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <pre className={css.detailContent}>{detail.content}</pre>
      <TokenTable state={tokens} />
    </div>
  )
}

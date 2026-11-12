/** MCP server list: legacy configuration controls and native manager status/tool views. */

import { useState } from 'react'
import type { McpFieldError, McpResponse, McpServerInput, McpServerInfo, McpStatus } from '../../protocol.ts'
import type { HubKey } from '../locales.ts'
import { tt } from '../helpers.ts'
import type { McpEditorState, McpNotice } from './hooks/useMcpFlow.ts'
import { ConfirmDialog } from './dialogs.tsx'
import { McpServerDialog } from './McpServerDialog.tsx'
import css from './panel.module.css'

export interface McpViewProps {
  data: McpResponse | null
  loading: boolean
  error: string | null
  /** 正在开关的服务器 entryId（该行禁用交互）。 */
  busyEntry: string | null
  notice: McpNotice | null
  expanded: ReadonlySet<string>
  /** 打开中的新建/编辑表单。 */
  editor: McpEditorState | null
  editorBusy: boolean
  editorErrors: readonly McpFieldError[]
  editorError: string | null
  onRefresh: () => void
  onToggle: (entryId: string, enabled: boolean) => void
  onToggleExpanded: (entryId: string) => void
  onOpenEditor: (server?: McpServerInfo) => void
  onCloseEditor: () => void
  onSaveServer: (input: McpServerInput, entryId?: string) => void
  onRemoveServer: (entryId: string) => void
  onDismissNotice: () => void
}

/** 不可编辑原因 → 文案键。 */
function editBlockedKey(reason: McpServerInfo['editBlockedReason']): HubKey {
  if (reason === 'no-editor') return 'mcp.editBlocked.noEditor'
  if (reason === 'invalid-config') return 'mcp.editBlocked.invalidConfig'
  return 'mcp.editBlocked.unaddressable'
}

/** 状态 → 文案键（状态值就是投影里的四个枚举）。 */
const STATUS_KEY: Record<McpStatus, HubKey> = {
  running: 'mcp.status.running',
  starting: 'mcp.status.starting',
  failed: 'mcp.status.failed',
  disabled: 'mcp.status.disabled',
  connected: 'mcp.status.connected',
  reconnecting: 'mcp.status.reconnecting',
  'waiting-credentials': 'mcp.status.waitingCredentials',
  closed: 'mcp.status.closed',
}

/** 状态 → 徽标配色（只标"好/坏"两档，其余用中性底色）。 */
function statusClass(status: McpStatus): string {
  if (status === 'running' || status === 'connected') return css.statusOk
  if (status === 'failed') return css.statusError
  return ''
}

/** 一行配置摘要：名称 + 值（等宽）。 */
function MetaLine(props: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={css.mcpMetaLine}>
      <span className={css.mcpMetaLabel}>{props.label}</span>
      <span className={css.mcpMetaValue}>{props.children}</span>
    </div>
  )
}

/** 展开后的配置摘要 + 工具清单。env/headers 的值默认遮掩。 */
function McpDetail(props: { server: McpServerInfo }): React.JSX.Element {
  const { server } = props
  const [revealed, setRevealed] = useState(false)
  const stdio = server.stdio
  const http = server.http
  const pairs = stdio !== undefined ? Object.entries(stdio.env) : Object.entries(http?.headers ?? {})
  const target = server.source === 'mcp-manager' ? tt('mcp.source.manager') : stdio !== undefined
    ? [stdio.command, ...stdio.args].filter((part) => part !== '').join(' ')
    : (http?.url ?? '')
  return (
    <div className={css.mcpDetail}>
      {server.source === 'mcp-manager' ? <MetaLine label={tt('mcp.detail.source')}>{tt('mcp.source.manager')}{server.managerEntryPresent === false ? ' · ' + tt('mcp.source.retained') : ''}</MetaLine> : null}
      {server.source !== 'mcp-manager' ? <><MetaLine label={stdio !== undefined ? tt('mcp.detail.command') : tt('mcp.detail.url')}>
        <span className={css.mcpMono}>{target !== '' ? target : '—'}</span>
      </MetaLine>
      {stdio !== undefined && stdio.cwd !== ''
        ? <MetaLine label={tt('mcp.detail.cwd')}><span className={css.mcpMono}>{stdio.cwd}</span></MetaLine>
        : null}
      {pairs.length > 0
        ? (
          <MetaLine label={stdio !== undefined ? tt('mcp.detail.env') : tt('mcp.detail.headers')}>
            <button
              type='button'
              className={css.mcpSecretToggle}
              aria-pressed={revealed}
              onClick={() => { setRevealed((value) => !value) }}
            >{revealed ? tt('mcp.detail.revealHide') : tt('mcp.detail.revealShow')}</button>
            <span className={css.mcpSecrets}>
              {pairs.map(([key, value]) => (
                <span key={key} className={css.mcpMono}>{key}={revealed ? value : '••••••'}</span>
              ))}
            </span>
          </MetaLine>
        )
        : null}
      <MetaLine label={tt('mcp.detail.timeout')}><span className={css.mcpMono}>{server.toolCallTimeoutMs + ' ms'}</span></MetaLine>
      <MetaLine label={tt('mcp.detail.failFast')}>{server.failOnStartupError ? tt('mcp.yes') : tt('mcp.no')}</MetaLine>
      </> : null}
      {server.patchId !== undefined ? <MetaLine label={tt('mcp.detail.patch')}><span className={css.mcpMono}>{server.patchId}</span></MetaLine> : null}
      <MetaLine label={tt('mcp.tools')}>
        <span className={css.mcpTools}>
          {server.tools.length === 0
            ? <span className={css.mcpToolEmpty}>{tt('mcp.noTools')}</span>
            : server.tools.map((tool) => (
              <span key={tool.name} className={css.mcpTool}>
                <span className={css.mcpToolName}>{tool.name}</span>
                {tool.description !== '' ? <span className={css.mcpToolDesc}>{tool.description}</span> : null}
                {tool.paramNames.length > 0 ? <span className={css.mcpToolParams}>{tt('mcp.toolParams', { params: tool.paramNames.join(', ') })}</span> : null}
              </span>
            ))}
        </span>
      </MetaLine>
    </div>
  )
}

/** 一台服务器的一行。 */
function McpServerRow(props: {
  server: McpServerInfo
  open: boolean
  /** 任意一行的开关在飞行中：全部开关先锁住，避免并发响应互相覆盖。 */
  busy: boolean
  canManage: boolean
  onToggle: (entryId: string, enabled: boolean) => void
  onToggleExpanded: (entryId: string) => void
  onEdit: (server: McpServerInfo) => void
  onAskRemove: (server: McpServerInfo) => void
}): React.JSX.Element {
  const { server, open, busy, canManage } = props
  const readOnly = server.readOnlyReason !== undefined
  const reason = readOnly
    ? tt(server.readOnlyReason === 'native-manager' ? 'mcp.readonly.nativeManager' : server.readOnlyReason === 'management-required'
      ? 'mcp.readonly.management'
      : server.readOnlyReason === 'no-manager' ? 'mcp.readonly.noManager' : 'mcp.readonly.unaddressable')
    : canManage ? undefined : tt('mcp.noManager')
  const disabled = busy || !canManage || readOnly
  // 编辑按钮常驻在行上（不藏在展开的详情里）：能改的行直接给按钮，不能改的行
  // 说明原因；已有行与开关原因重复时只留开关那句，避免同一行两行灰字。
  const editReason = server.editable || reason !== undefined
    ? undefined
    : tt(editBlockedKey(server.editBlockedReason))
  const stdio = server.stdio
  const target = server.source === 'mcp-manager' ? tt('mcp.source.manager') : stdio !== undefined
    ? [stdio.command, ...stdio.args].filter((part) => part !== '').join(' ')
    : (server.http?.url ?? '')
  return (
    <div className={css.mcpRow + (server.enabled ? '' : ' ' + css.mcpRowDisabled)}>
      <div className={css.mcpHead}>
        <button
          type='button'
          className={css.disclosure}
          aria-expanded={open}
          aria-label={tt('mcp.tools') + ': ' + server.serverName}
          onClick={() => { props.onToggleExpanded(server.entryId) }}
        >
          <span className={css.chevron + (open ? '' : ' ' + css.chevronCollapsed)} aria-hidden='true' />
          <span className={css.mcpName}>{server.serverName}</span>
          <span className={css.badges}>
            <span className={css.badge}>{tt(server.source === 'mcp-manager' ? 'mcp.source.manager' : server.transport === 'stdio' ? 'mcp.transport.stdio' : 'mcp.transport.http')}</span>
            <span className={css.badge + ' ' + statusClass(server.status)}>{tt(STATUS_KEY[server.status])}</span>
            {readOnly ? <span className={css.badge + ' ' + css.badgeReadonly} title={reason}>{tt('mcp.readonly.badge')}</span> : null}
            {server.managed ? <span className={css.badge}>{tt('mcp.managedBadge')}</span> : null}
          </span>
        </button>
        <span className={css.mcpToolCount}>{tt('mcp.toolCount', { count: server.tools.length })}</span>
        <span className={css.mcpRowActions}>
          {server.editable
            ? (
              <button
                type='button'
                className={css.mcpRowAction}
                disabled={busy}
                onClick={() => { props.onEdit(server) }}
              >{tt('mcp.edit')}</button>
            )
            : null}
          {server.removable
            ? (
              <button
                type='button'
                className={css.mcpRowAction + ' ' + css.danger}
                disabled={busy}
                onClick={() => { props.onAskRemove(server) }}
              >{tt('mcp.delete')}</button>
            )
            : null}
        </span>
        <button
          type='button'
          role='switch'
          aria-checked={server.enabled}
          aria-label={server.serverName}
          className={css.switch + (server.enabled ? ' ' + css.switchOn : '')}
          disabled={disabled}
          title={disabled ? reason : undefined}
          onClick={(event) => { event.stopPropagation(); props.onToggle(server.entryId, !server.enabled) }}
        >
          <span className={css.switchThumb} />
        </button>
      </div>
      <div className={css.mcpTarget} title={target}>{target !== '' ? target : '—'}</div>
      {/* 只读/不可开关的原因写出来，不藏在 title 里：键盘与读屏都到不了 title。 */}
      {reason !== undefined ? <div className={css.mcpReason}>{reason}</div> : null}
      {editReason !== undefined ? <div className={css.mcpReason}>{editReason}</div> : null}
      {open ? <McpDetail server={server} /> : null}
    </div>
  )
}

export function McpView(props: McpViewProps): React.JSX.Element {
  const { data, loading, error, notice } = props
  /** 等待确认删除的服务器（确认框关掉即丢弃）。 */
  const [pendingRemove, setPendingRemove] = useState<McpServerInfo | null>(null)
  const totalTools = (data?.servers ?? []).reduce((sum, server) => sum + server.tools.length, 0)
  const addDisabled = loading || data === null || props.busyEntry !== null
  const noticeClass = notice === null ? '' : notice.kind === 'error' ? css.errorBanner : notice.kind === 'warn' ? css.warnBanner : css.successBanner
  return (
    <>
      <div className={css.mcpBar}>
        <button type='button' className={css.opBtn} disabled={loading} onClick={props.onRefresh}>
          {loading ? tt('mcp.loading') : tt('mcp.refresh')}
        </button>
        <button type='button' className={css.opBtn} disabled={addDisabled} onClick={() => { props.onOpenEditor() }}>
          {tt('mcp.add')}
        </button>
        {data !== null
          ? <span className={css.mcpSummary}>{tt('mcp.summary', { servers: data.servers.length, tools: totalTools })}</span>
          : null}
        {data !== null && data.canManage === false ? <span className={css.hint}>{tt('mcp.noManager')}</span> : null}
      </div>

      {error !== null ? <div className={css.errorBanner} role='alert'>{tt('mcp.error', { error })}</div> : null}

      {notice !== null
        ? (
          <div className={noticeClass} role='status'>
            <span>{tt(notice.key, notice.values ?? {})}</span>
            <button type='button' className={css.button} onClick={props.onDismissNotice}>{tt('err.dismiss')}</button>
          </div>
        )
        : null}

      {/* 读取阶段的降级告警（缺服务、某行读不出来）：原文英文，逐行列出。 */}
      {data !== null && data.warnings.length > 0
        ? (
          <div className={css.warnBanner} role='status'>
            <div>
              {data.warnings.map((line, index) => <div key={index + ':' + line} className={css.diagReason}>{line}</div>)}
            </div>
          </div>
        )
        : null}

      {data === null && loading ? <p className={css.empty}>{tt('mcp.loading')}</p> : null}

      {data !== null && data.servers.length === 0
        ? (
          <p className={css.empty}>
            {data.configPath !== null ? tt('mcp.empty', { path: data.configPath }) : tt('mcp.emptyNoPath')}
          </p>
        )
        : null}

      {data !== null && data.servers.length > 0
        ? (
          <section className={css.section}>
            <div className={css.list}>
              {data.servers.map((server) => (
                <McpServerRow
                  key={server.entryId}
                  server={server}
                  open={props.expanded.has(server.entryId)}
                  busy={props.busyEntry !== null}
                  canManage={data.canManage}
                  onToggle={props.onToggle}
                  onToggleExpanded={props.onToggleExpanded}
                  onEdit={props.onOpenEditor}
                  onAskRemove={setPendingRemove}
                />
              ))}
            </div>
          </section>
        )
        : null}

      {data !== null && data.orphanTools.length > 0
        ? (
          <section className={css.section}>
            <div className={css.sectionTitle}>{tt('mcp.orphan', { count: data.orphanTools.length })}</div>
            <p className={css.hintLine}>{tt('mcp.orphanHint')}</p>
            <div className={css.mcpOrphans}>
              {data.orphanTools.map((name) => <span key={name} className={css.mcpMono}>{name}</span>)}
            </div>
          </section>
        )
        : null}

      {pendingRemove !== null
        ? (
          <ConfirmDialog
            title={tt('mcp.deleteConfirmTitle')}
            text={tt('mcp.deleteConfirmText', { name: pendingRemove.serverName })}
            confirmLabel={tt('mcp.delete')}
            danger
            onCancel={() => { setPendingRemove(null) }}
            onConfirm={() => {
              const entryId = pendingRemove.entryId
              setPendingRemove(null)
              props.onRemoveServer(entryId)
            }}
          />
        )
        : null}

      {props.editor !== null
        ? (
          <McpServerDialog
            editor={props.editor}
            busy={props.editorBusy}
            errors={props.editorErrors}
            error={props.editorError}
            onCancel={props.onCloseEditor}
            onSave={(input) => {
              props.onSaveServer(input, props.editor?.mode === 'edit' ? props.editor.server.entryId : undefined)
            }}
          />
        )
        : null}
    </>
  )
}

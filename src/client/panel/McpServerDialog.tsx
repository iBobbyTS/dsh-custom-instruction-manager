/**
 * McpServerDialog — 新建/编辑一台 MCP 服务器的表单。
 *
 * 字段与 dsh 的 `@deepseek-ai/dsh-mcp-client` 配置对齐；`reconnect` 之类的
 * 高级项不在这里改，但保存时会被原样保留（host 只覆盖表单提交的字段）。
 *
 * env/headers 用「每行一个」的朴素写法：`KEY=VALUE` 与 `KEY: VALUE`。解析
 * 失败在本地就拦住，不把一行坏文本发到 host 再让它 400。
 */

import { useState, type JSX } from 'react'
import type { McpEditorState } from './hooks/useMcpFlow.ts'
import type { McpFieldError, McpServerInput, McpServerInfo, McpTransport } from '../../protocol.ts'
import type { HubKey } from '../locales.ts'
import { tt } from '../helpers.ts'
import { DialogShell } from './dialogs.tsx'
import css from './panel.module.css'

export interface McpServerDialogProps {
  editor: McpEditorState
  /** 保存请求在飞行中：禁用字段与按钮。 */
  busy: boolean
  /** host 返回的字段级错误。 */
  errors: readonly McpFieldError[]
  /** 非字段错误（网络/冲突），显示在对话框内。 */
  error?: string | null
  onCancel: () => void
  onSave: (input: McpServerInput) => void
}

/** 表单草稿：全部用字符串，提交时再转数字/字典。 */
interface Draft {
  serverName: string
  transport: McpTransport
  command: string
  args: string
  cwd: string
  env: string
  url: string
  headers: string
  toolCallTimeoutMs: string
  failOnStartupError: boolean
  maxInstructionBytes: string
}

/** 表单初始化：编辑时按行配置铺开，新建时给一台 stdio 服务器的默认值。 */
function draftOf(server: McpServerInfo | undefined): Draft {
  if (server === undefined) {
    return {
      serverName: '',
      transport: 'stdio',
      command: '',
      args: '',
      cwd: '',
      env: '',
      url: '',
      headers: '',
      toolCallTimeoutMs: '60000',
      failOnStartupError: false,
      maxInstructionBytes: '',
    }
  }
  const stdio = server.stdio
  const http = server.http
  return {
    serverName: server.serverName,
    transport: server.transport,
    command: stdio?.command ?? '',
    args: (stdio?.args ?? []).join('\n'),
    cwd: stdio?.cwd ?? '',
    env: Object.entries(stdio?.env ?? {}).map(([key, value]) => key + '=' + value).join('\n'),
    url: http?.url ?? '',
    headers: Object.entries(http?.headers ?? {}).map(([key, value]) => key + ': ' + value).join('\n'),
    toolCallTimeoutMs: String(server.toolCallTimeoutMs),
    failOnStartupError: server.failOnStartupError,
    maxInstructionBytes: server.maxInstructionBytes === undefined ? '' : String(server.maxInstructionBytes),
  }
}

/** 逐行解析 KEY=VALUE / KEY: VALUE；坏行返回行号（1 起）。 */
function parsePairs(text: string, separator: '=' | ':'): { map: Record<string, string>; badLine?: number } {
  const map: Record<string, string> = {}
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim()
    if (line === '') continue
    const at = line.indexOf(separator)
    if (at <= 0) return { map, badLine: index + 1 }
    const key = line.slice(0, at).trim()
    if (key === '') return { map, badLine: index + 1 }
    map[key] = line.slice(at + 1).trim()
  }
  return { map }
}

/** 空串 → null（用默认/清掉），数字串 → 数字，其余 → undefined（本地报错）。 */
function numberOrNull(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** 字段错误的本地化文本。 */
function textOfError(code: McpFieldError['code'] | undefined): string | undefined {
  return code === undefined ? undefined : tt(('mcp.field.' + code) as HubKey)
}

export function McpServerDialog(props: McpServerDialogProps): JSX.Element {
  const { editor, busy, errors, error, onCancel, onSave } = props
  const server = editor.mode === 'edit' ? editor.server : undefined
  const [draft, setDraft] = useState<Draft>(() => draftOf(server))
  /** 本地解析失败：`field` 指向 env/headers/timeout 这类不在 host 校验前的项。 */
  const [localError, setLocalError] = useState<{ field: string; line?: number } | null>(null)

  const codeOf = (field: string): McpFieldError['code'] | undefined => errors.find((entry) => entry.field === field)?.code
  const patch = (next: Partial<Draft>): void => { setDraft((current) => ({ ...current, ...next })) }

  const submit = (): void => {
    if (busy) return
    const timeout = numberOrNull(draft.toolCallTimeoutMs)
    if (timeout === undefined) {
      setLocalError({ field: 'toolCallTimeoutMs' })
      return
    }
    const maxInstruction = numberOrNull(draft.maxInstructionBytes)
    if (maxInstruction === undefined) {
      setLocalError({ field: 'maxInstructionBytes' })
      return
    }
    const input: McpServerInput = {
      serverName: draft.serverName.trim(),
      transport: draft.transport,
      toolCallTimeoutMs: timeout,
      failOnStartupError: draft.failOnStartupError,
      maxInstructionBytes: maxInstruction,
    }
    if (draft.transport === 'stdio') {
      const env = parsePairs(draft.env, '=')
      if (env.badLine !== undefined) {
        setLocalError({ field: 'env', line: env.badLine })
        return
      }
      input.command = draft.command.trim()
      input.args = draft.args.split('\n').map((line) => line.trim()).filter((line) => line !== '')
      input.cwd = draft.cwd.trim()
      input.env = env.map
    } else {
      const headers = parsePairs(draft.headers, ':')
      if (headers.badLine !== undefined) {
        setLocalError({ field: 'headers', line: headers.badLine })
        return
      }
      input.url = draft.url.trim()
      input.headers = headers.map
    }
    setLocalError(null)
    onSave(input)
  }

  const errorLine = (field: string, code: McpFieldError['code'] | undefined): JSX.Element | null => {
    const text = textOfError(code)
    return text === undefined ? null : <span className={css.mcpFieldError}>{text}</span>
  }

  const localLine = (field: string, separator: '=' | ':'): JSX.Element | null => localError?.field !== field
    ? null
    : (
      <span className={css.mcpFieldError}>
        {tt('mcp.form.invalidLine', {
          field: tt(field === 'env' ? 'mcp.form.env' : 'mcp.form.headers'),
          line: String(localError.line ?? 0),
          sep: separator,
        })}
      </span>
    )

  const title = editor.mode === 'edit'
    ? tt('mcp.form.editTitle', { name: editor.server.serverName })
    : tt('mcp.form.createTitle')

  return (
    <DialogShell wide onClose={busy ? () => {} : onCancel}>
      <h3 className={css.dialogTitle}>{title}</h3>
      {error !== undefined && error !== null
        ? <div className={css.errorBanner} role='alert'>{tt('mcp.saveFailed', { error })}</div>
        : null}
      <form
        className={css.mcpForm}
        onSubmit={(event) => { event.preventDefault(); submit() }}
      >
        <label className={css.mcpField}>
          <span className={css.mcpFieldLabel}>{tt('mcp.form.name')}</span>
          <input
            className={css.mcpInput + (codeOf('serverName') !== undefined ? ' ' + css.mcpInputError : '')}
            value={draft.serverName}
            disabled={busy}
            onChange={(event) => { patch({ serverName: event.target.value }) }}
          />
          <span className={css.mcpHint}>{tt('mcp.form.nameHint', { name: draft.serverName.trim() === '' ? '…' : draft.serverName.trim() })}</span>
          {errorLine('serverName', codeOf('serverName'))}
        </label>

        <label className={css.mcpField}>
          <span className={css.mcpFieldLabel}>{tt('mcp.form.transport')}</span>
          <select
            className={css.mcpInput}
            value={draft.transport}
            disabled={busy}
            onChange={(event) => { patch({ transport: event.target.value as McpTransport }) }}
          >
            <option value='stdio'>{tt('mcp.transport.stdio')}</option>
            <option value='streamable-http'>{tt('mcp.transport.http')}</option>
          </select>
        </label>

        {draft.transport === 'stdio'
          ? (
            <>
              <label className={css.mcpField}>
                <span className={css.mcpFieldLabel}>{tt('mcp.form.command')}</span>
                <input
                  className={css.mcpInput + (codeOf('command') !== undefined ? ' ' + css.mcpInputError : '')}
                  value={draft.command}
                  disabled={busy}
                  onChange={(event) => { patch({ command: event.target.value }) }}
                />
                {errorLine('command', codeOf('command'))}
              </label>
              <label className={css.mcpField}>
                <span className={css.mcpFieldLabel}>{tt('mcp.form.args')}</span>
                <textarea
                  className={css.mcpTextarea}
                  rows={3}
                  value={draft.args}
                  disabled={busy}
                  onChange={(event) => { patch({ args: event.target.value }) }}
                />
              </label>
              <label className={css.mcpField}>
                <span className={css.mcpFieldLabel}>{tt('mcp.form.cwd')}</span>
                <input
                  className={css.mcpInput}
                  value={draft.cwd}
                  disabled={busy}
                  onChange={(event) => { patch({ cwd: event.target.value }) }}
                />
              </label>
              <label className={css.mcpField}>
                <span className={css.mcpFieldLabel}>{tt('mcp.form.env')}</span>
                <textarea
                  className={css.mcpTextarea}
                  rows={3}
                  value={draft.env}
                  disabled={busy}
                  onChange={(event) => { patch({ env: event.target.value }) }}
                />
                {localLine('env', '=')}
              </label>
            </>
          )
          : (
            <>
              <label className={css.mcpField}>
                <span className={css.mcpFieldLabel}>{tt('mcp.form.url')}</span>
                <input
                  className={css.mcpInput + (codeOf('url') !== undefined ? ' ' + css.mcpInputError : '')}
                  value={draft.url}
                  disabled={busy}
                  onChange={(event) => { patch({ url: event.target.value }) }}
                />
                {errorLine('url', codeOf('url'))}
              </label>
              <label className={css.mcpField}>
                <span className={css.mcpFieldLabel}>{tt('mcp.form.headers')}</span>
                <textarea
                  className={css.mcpTextarea}
                  rows={3}
                  value={draft.headers}
                  disabled={busy}
                  onChange={(event) => { patch({ headers: event.target.value }) }}
                />
                {localLine('headers', ':')}
              </label>
            </>
          )}

        <div className={css.mcpFormRow}>
          <label className={css.mcpField}>
            <span className={css.mcpFieldLabel}>{tt('mcp.form.timeout')}</span>
            <input
              className={css.mcpInput + (codeOf('toolCallTimeoutMs') !== undefined || localError?.field === 'toolCallTimeoutMs' ? ' ' + css.mcpInputError : '')}
              inputMode='numeric'
              value={draft.toolCallTimeoutMs}
              disabled={busy}
              onChange={(event) => { patch({ toolCallTimeoutMs: event.target.value }) }}
            />
            {errorLine('toolCallTimeoutMs', codeOf('toolCallTimeoutMs'))}
            {localError?.field === 'toolCallTimeoutMs' ? <span className={css.mcpFieldError}>{tt('mcp.field.range')}</span> : null}
          </label>
          <label className={css.mcpField}>
            <span className={css.mcpFieldLabel}>{tt('mcp.form.maxInstruction')}</span>
            <input
              className={css.mcpInput + (codeOf('maxInstructionBytes') !== undefined || localError?.field === 'maxInstructionBytes' ? ' ' + css.mcpInputError : '')}
              inputMode='numeric'
              value={draft.maxInstructionBytes}
              disabled={busy}
              onChange={(event) => { patch({ maxInstructionBytes: event.target.value }) }}
            />
            {errorLine('maxInstructionBytes', codeOf('maxInstructionBytes'))}
            {localError?.field === 'maxInstructionBytes' ? <span className={css.mcpFieldError}>{tt('mcp.field.range')}</span> : null}
          </label>
        </div>

        <label className={css.mcpCheck}>
          <input
            type='checkbox'
            checked={draft.failOnStartupError}
            disabled={busy}
            onChange={(event) => { patch({ failOnStartupError: event.target.checked }) }}
          />
          <span>{tt('mcp.form.failFast')}</span>
        </label>

        <div className={css.dialogActions}>
          <button type='button' className={css.button} disabled={busy} onClick={onCancel}>{tt('form.cancel')}</button>
          <button type='submit' className={css.button + ' ' + css.primary} disabled={busy}>
            {busy ? tt('mcp.form.saving') : tt('mcp.form.save')}
          </button>
        </div>
      </form>
    </DialogShell>
  )
}

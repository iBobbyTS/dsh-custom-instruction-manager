/**
 * Shared display helpers for the panel views (skill rows, detail view, and
 * dialogs): dot color styling, relative/absolute time text, and commit-SHA
 * shortening. Kept in one place so the views render identically.
 *
 * The invocation-status dot defaults live here (not in the settings card) so
 * both the panel legend and the chat `/` skill menu draw from one source and
 * so this primitives-free module stays unit-testable.
 */

import type { CSSProperties } from 'react'
import { formatRelativeTime } from '../grouping.ts'
import { panelLocale, tt } from '../helpers.ts'

/** Model-invocable dot color default. Single source for the TS side; the
 *  panel's CSS mirrors it via --hub-model (panel.module.css). */
export const DEFAULT_DOT_MODEL_COLOR = '#2f81f7'
/** User-invocable dot color default. Single source for the TS side; the
 *  panel's CSS mirrors it via --hub-user (panel.module.css). */
export const DEFAULT_DOT_USER_COLOR = '#3fb950'

/** Dot inline style from the user-chosen color (undefined keeps the CSS default). */
export function dotStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) return undefined
  return { background: color, borderColor: color }
}

/** Localized relative-time text for a Unix-ms timestamp. */
export function relativeTimeText(ms: number): string {
  const rt = formatRelativeTime(ms)
  return tt(rt.key, rt.value !== undefined ? { value: rt.value } : undefined)
}

/**
 * Absolute time for the detail meta, formatted in the panel's language
 * ("2026/08/10 20:16:51" / "Aug 10, 2026, 8:16:51 PM"). The locale comes
 * from DSH's UI language, not from `Intl`'s default, which the desktop app
 * pins to en-US via `--lang` (see `panelLocale`).
 *
 * Chinese uses an explicit YYYY/MM/DD HH:mm:ss pattern: ICU's own zh
 * `dateStyle` renders "2026年8月10日 20:16:51", which is noisier than this
 * panel's metadata lines need and was explicitly not wanted.
 */
function dateFormatter(locale: 'zh' | 'en'): Intl.DateTimeFormat {
  if (locale === 'zh') {
    return new Intl.DateTimeFormat('zh', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
  }
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' })
}

let cachedDateFormatter: Intl.DateTimeFormat | undefined
let cachedDateLocale = ''
export function formatDateTime(ms: number): string {
  const locale = panelLocale()
  if (cachedDateFormatter === undefined || cachedDateLocale !== locale) {
    cachedDateFormatter = dateFormatter(locale)
    cachedDateLocale = locale
  }
  return cachedDateFormatter.format(new Date(ms))
}

/** Short form of a commit SHA for display. */
export function shortSha(sha: string): string {
  return sha.length > 7 ? sha.slice(0, 7) : sha
}

/**
 * Human byte size for file metadata ("824 B" / "1.2 KB" / "3.4 MB"). One
 * decimal under 10 units so small instruction files stay readable, no decimal
 * once the number is large enough that it adds noise.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return Math.round(bytes) + ' B'
  const units = ['KB', 'MB', 'GB'] as const
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return (value >= 10 ? value.toFixed(0) : value.toFixed(1)) + ' ' + units[unit]
}

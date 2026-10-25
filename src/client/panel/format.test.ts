/**
 * Date formatting must follow the panel language (`documentElement.lang`),
 * never `Intl`'s default locale: the desktop app launches its renderer with
 * `--lang=en-US`, so an unqualified `toLocaleString()` renders US dates next
 * to Chinese labels.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { formatBytes, formatDateTime } from './format.ts'
import { panelLocale } from '../helpers.ts'

/** Local wall-clock stamp, so the formatted text is timezone independent. */
const stamp = new Date(2026, 7, 10, 20, 16, 51).getTime()

interface StubDocument { documentElement: { lang: string } }
const scope = globalThis as unknown as { document?: StubDocument }

function setLang(lang: string | undefined): void {
  if (lang === undefined) {
    delete scope.document
    return
  }
  scope.document = { documentElement: { lang } }
}

afterEach(() => { setLang(undefined) })

describe('formatDateTime', () => {
  it('uses YYYY/MM/DD and a 24-hour clock for a Chinese UI', () => {
    setLang('zh-CN')
    expect(formatDateTime(stamp)).toBe('2026/08/10 20:16:51')
  })

  it('uses the English pattern for an English UI', () => {
    setLang('en-US')
    expect(formatDateTime(stamp)).toBe('Aug 10, 2026, 8:16:51 PM')
  })

  it('falls back to Chinese for a language the panel does not ship', () => {
    setLang('ja-JP')
    expect(panelLocale()).toBe('zh')
    expect(formatDateTime(stamp)).toBe('2026/08/10 20:16:51')
  })

  it('follows a language switch at render time', () => {
    setLang('en-GB')
    expect(formatDateTime(stamp)).toBe('Aug 10, 2026, 8:16:51 PM')
    setLang('zh')
    expect(formatDateTime(stamp)).toBe('2026/08/10 20:16:51')
  })

  it('defaults to Chinese without a document (SSR/tests)', () => {
    expect(panelLocale()).toBe('zh')
    expect(formatDateTime(stamp)).toBe('2026/08/10 20:16:51')
  })
})

describe('formatBytes', () => {
  it('keeps small files in bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(824)).toBe('824 B')
  })

  it('scales to KB with one decimal under ten', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('drops the decimal once the value is large', () => {
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
  })

  it('never renders a bogus size', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

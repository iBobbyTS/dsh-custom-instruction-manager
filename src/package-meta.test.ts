import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { en, zh } from './client/locales.ts'

const path = (file: string) => new URL(`../${file}`, import.meta.url)
const read = (file: string) => readFileSync(path(file), 'utf8')
const json = (file: string) => JSON.parse(read(file)) as Record<string, unknown>

const pkg = json('package.json') as {
  icon?: string
  exports?: Record<string, unknown>
  files?: string[]
  repository?: { url?: string }
}

describe('plugin display metadata', () => {
  it('ships English and Simplified Chinese names and descriptions', () => {
    for (const locale of ['en', 'zh']) {
      const meta = json(`locale/${locale}.json`).meta as Record<string, string>
      expect(meta.title.trim(), locale).not.toBe('')
      expect(meta.description.trim(), locale).not.toBe('')
    }
    const zhMeta = json('locale/zh.json').meta as Record<string, string>
    const enMeta = json('locale/en.json').meta as Record<string, string>
    expect(zhMeta.title).toMatch(/[\u4e00-\u9fff]/u)
    expect(zhMeta.title).not.toBe(enMeta.title)
  })

  it('exports the locale dictionaries and ships the original icon', () => {
    expect(pkg.icon).toBe('./icon.svg')
    expect(pkg.exports?.['./locale/*.json']).toBe('./locale/*.json')
    expect(pkg.files).toContain('icon.svg')
    expect(pkg.files).toContain('locale/*.json')
    const icon = read('icon.svg')
    expect(icon).toMatch(/^<svg[ >]/u)
    expect(new TextEncoder().encode(icon).byteLength).toBeLessThanOrEqual(256 * 1024)
  })

  it('keeps both panel dictionaries key-aligned', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('uses the same product name in the manifest, settings card, and About page', () => {
    const zhMeta = json('locale/zh.json').meta as Record<string, string>
    const enMeta = json('locale/en.json').meta as Record<string, string>
    expect(zhMeta.title).toBe(zh['settings.title'])
    expect(enMeta.title).toBe(en['settings.title'])
    expect(zh['about.pluginName']).toBe(zh['settings.title'])
    expect(en['about.pluginName']).toBe(en['settings.title'])
  })

  it('points the About page at the declared repository', () => {
    const declared = pkg.repository?.url?.replace(/^git\+/u, '').replace(/\.git$/u, '')
    expect(declared).toBe('https://github.com/iBobbyTS/dsh-custom-instruction-manager')
    expect(read('src/client/panel/AboutView.tsx')).toContain(declared)
  })
})

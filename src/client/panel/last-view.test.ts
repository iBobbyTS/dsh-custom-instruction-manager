/**
 * 「上次离开的页面」的读写必须容错：只要 localStorage 里那条记录不能完整
 * 解释成合法页面，面板就得回到默认页（Skill / 来源），而不是白屏。分类与
 * tab 分开校验，一个字段坏了不连累另一个。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CATEGORY_ORDER, DEFAULT_VIEW, LAST_VIEW_KEY, readLastView, rememberView, type LastView } from './last-view.ts'

/** Minimal in-memory Storage stand-in (the suite runs in node, no DOM). */
function memoryStorage(options: { throwOnGet?: boolean; throwOnSet?: boolean } = {}) {
  const data = new Map<string, string>()
  return {
    data,
    getItem(key: string): string | null {
      if (options.throwOnGet === true) throw new Error('storage disabled')
      return data.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      if (options.throwOnSet === true) throw new Error('quota')
      data.set(key, value)
    },
    removeItem(key: string): void { data.delete(key) },
    clear(): void { data.clear() },
  }
}

const scope = globalThis as unknown as { localStorage?: Storage }

function useStorage(storage: ReturnType<typeof memoryStorage>): void {
  scope.localStorage = storage as unknown as Storage
}

afterEach(() => { delete scope.localStorage })

describe('readLastView', () => {
  beforeEach(() => { useStorage(memoryStorage()) })

  it('returns the default page when nothing was ever stored', () => {
    expect(readLastView()).toEqual(DEFAULT_VIEW)
  })

  it('round-trips every category in the nav order', () => {
    for (const category of CATEGORY_ORDER) {
      rememberView({ category, tab: 'market' })
      expect(readLastView()).toEqual({ category, tab: 'market' })
    }
  })

  it('falls back to the default page on corrupt JSON', () => {
    scope.localStorage!.setItem(LAST_VIEW_KEY, '{oops')
    expect(readLastView()).toEqual(DEFAULT_VIEW)
  })

  it('falls back per field: unknown category keeps a valid tab, bad tab keeps the category', () => {
    scope.localStorage!.setItem(LAST_VIEW_KEY, JSON.stringify({ category: 'removed-category', tab: 'market' }))
    expect(readLastView()).toEqual({ category: 'skills', tab: 'market' })
    scope.localStorage!.setItem(LAST_VIEW_KEY, JSON.stringify({ category: 'agents', tab: 'nope' }))
    expect(readLastView()).toEqual({ category: 'agents', tab: 'sources' })
  })

  it('ignores non-object payloads', () => {
    scope.localStorage!.setItem(LAST_VIEW_KEY, JSON.stringify('agents'))
    expect(readLastView()).toEqual(DEFAULT_VIEW)
    scope.localStorage!.setItem(LAST_VIEW_KEY, 'null')
    expect(readLastView()).toEqual(DEFAULT_VIEW)
  })

  it('survives a storage that refuses to read', () => {
    useStorage(memoryStorage({ throwOnGet: true }))
    expect(readLastView()).toEqual(DEFAULT_VIEW)
  })
})

describe('rememberView', () => {
  it('writes only the two known fields', () => {
    const storage = memoryStorage()
    useStorage(storage)
    rememberView({ category: 'agents', tab: 'sources', extra: 'x' } as LastView)
    expect(JSON.parse(storage.data.get(LAST_VIEW_KEY)!)).toEqual({ category: 'agents', tab: 'sources' })
  })

  it('is a no-op when storage refuses to write', () => {
    useStorage(memoryStorage({ throwOnSet: true }))
    expect(() => { rememberView({ category: 'agents', tab: 'sources' }) }).not.toThrow()
  })
})

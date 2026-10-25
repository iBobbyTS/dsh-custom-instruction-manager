import { describe, expect, it } from 'vitest'
import { applyInterface, buildCollections, readString, readStrings } from './helpers.ts'

describe('readString', () => {
  it('returns the string value, or an empty string for anything else', () => {
    expect(readString({ repo: 'a/b' }, 'repo')).toBe('a/b')
    expect(readString({ repo: 42 }, 'repo')).toBe('')
    expect(readString({}, 'repo')).toBe('')
    expect(readString({ repo: null }, 'repo')).toBe('')
  })
})

describe('readStrings', () => {
  it('keeps strings, drops non-strings and empty strings by default', () => {
    expect(readStrings({ names: ['a', 1, '', 'b', null] }, 'names')).toEqual(['a', 'b'])
    expect(readStrings({ names: 'a' }, 'names')).toEqual([])
    expect(readStrings({}, 'names')).toEqual([])
  })

  it('keeps empty strings when keepEmpty is set (caller owns the semantics)', () => {
    expect(readStrings({ names: ['a', '', 2] }, 'names', { keepEmpty: true })).toEqual(['a', ''])
  })
})

describe('buildCollections', () => {
  it('groups skills by origin, sorts members, and sorts collections by name', () => {
    const origins = { beta: 'z/repo', alpha: 'z/repo', gamma: 'a/repo' }
    expect(buildCollections(origins)).toEqual([
      { name: 'a/repo', skillNames: ['gamma'] },
      { name: 'z/repo', skillNames: ['alpha', 'beta'] },
    ])
  })

  it('sorts collections by name regardless of insertion order', () => {
    const collections = buildCollections({ one: 'b/repo', two: 'a/repo' })
    expect(collections.map((collection) => collection.name)).toEqual(['a/repo', 'b/repo'])
  })

  it('returns an empty list for no origins', () => {
    expect(buildCollections({})).toEqual([])
  })
})

describe('applyInterface', () => {
  it('copies every defined interface field onto the row and leaves the rest alone', () => {
    const row: { displayName?: string; iconSmall?: string } = { displayName: 'old' }
    applyInterface(row, { displayName: 'New Name', iconSmall: 'assets/i.png' })
    expect(row).toEqual({ displayName: 'New Name', iconSmall: 'assets/i.png' })
  })

  it('ignores undefined fields (never clears an existing value)', () => {
    const row: { displayName?: string; shortDescription?: string } = { displayName: 'keep' }
    applyInterface(row, { shortDescription: 'desc' })
    expect(row).toEqual({ displayName: 'keep', shortDescription: 'desc' })
  })
})

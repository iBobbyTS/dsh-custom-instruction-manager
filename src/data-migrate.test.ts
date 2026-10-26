/**
 * 旧数据搬迁：把 0.3.x 散在 `$DSH_HOME` 根下的两样东西（记录文件、词表缓存）
 * 收进插件数据目录。覆盖四条安全规则：搬得走、目标已有就不动、目录里已有词表
 * 就不覆盖、重复执行无副作用。
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateLegacyData } from './data-migrate.ts'
import { legacyStatePath, legacyTokenizerDir, pluginDataDir, statePath, tokenizerCacheDir } from './store/paths.ts'

describe('legacy data migration', () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'dsh-skill-hub-migrate-'))
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it('moves the old record file into the plugin data directory', async () => {
    await writeFile(legacyStatePath(home), '{"version":5,"disabled":[]}')
    const result = migrateLegacyData(home)
    expect(result.state).toBe('moved')
    expect(existsSync(legacyStatePath(home))).toBe(false)
    expect(JSON.parse(await readFile(statePath(home), 'utf8')).version).toBe(5)
  })

  it('moves the old tokenizer directory, merging into a pre-created empty one', async () => {
    await mkdir(legacyTokenizerDir(home), { recursive: true })
    await writeFile(join(legacyTokenizerDir(home), 'glm.json'), '{"model":{"vocab":{}}}')
    // 用户可能先手动建好目标目录（这台机器上就是）
    await mkdir(tokenizerCacheDir(home), { recursive: true })
    const result = migrateLegacyData(home)
    expect(result.tokenizers).toBe('moved')
    expect(await readdir(tokenizerCacheDir(home))).toEqual(['glm.json'])
    // 旧父目录空了就一起回收
    expect(existsSync(join(home, 'skill-hub'))).toBe(false)
  })

  it('leaves the old files alone when the new location already has data', async () => {
    await writeFile(legacyStatePath(home), '{"version":5,"disabled":[]}')
    await mkdir(pluginDataDir(home), { recursive: true })
    await writeFile(statePath(home), '{"version":5,"disabled":[{"name":"kept"}]}')
    await mkdir(legacyTokenizerDir(home), { recursive: true })
    await writeFile(join(legacyTokenizerDir(home), 'old.json'), '{}')
    await mkdir(tokenizerCacheDir(home), { recursive: true })
    await writeFile(join(tokenizerCacheDir(home), 'new.json'), '{}')

    const result = migrateLegacyData(home)
    expect(result.state).toBe('kept')
    expect(result.tokenizers).toBe('kept')
    // 以新位置为准，旧的留在原地（下次启动还会命中 kept 分支）
    expect(JSON.parse(await readFile(statePath(home), 'utf8')).disabled[0].name).toBe('kept')
    expect(existsSync(legacyStatePath(home))).toBe(true)
    expect(await readdir(tokenizerCacheDir(home))).toEqual(['new.json'])
  })

  it('reports nothing to do on a fresh install and is idempotent', () => {
    expect(migrateLegacyData(home)).toMatchObject({ state: 'absent', tokenizers: 'absent' })
    // 第二次执行：旧位置已经空了
    expect(migrateLegacyData(home)).toMatchObject({ state: 'absent', tokenizers: 'absent' })
  })

  it('does nothing when only one of the two exists', async () => {
    await mkdir(legacyTokenizerDir(home), { recursive: true })
    const result = migrateLegacyData(home)
    expect(result.state).toBe('absent')
    expect(result.tokenizers).toBe('moved')
    expect(existsSync(tokenizerCacheDir(home))).toBe(true)
  })
})

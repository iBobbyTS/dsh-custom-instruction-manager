/**
 * 用户文件的读写原语：一次读到「正文 + 磁盘元数据」的快照，以及原子写回。
 *
 * 编辑保存要回答两个问题：写之前磁盘是不是还是我载入的那份（mtime + 大小），
 * 写的时候会不会留下半截文件。前者用 FileSnapshot 比对，后者用同目录临时
 * 文件 + rename —— rename 在同一文件系统上是原子的，dsh 的 watcher 只会看到
 * 旧文件或新文件，不会看到被截断的中间态。
 */

import { randomBytes } from 'node:crypto'
import { chmod, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/** One read: the text plus the metadata a later save compares against. */
export interface FileSnapshot {
  text: string
  /** 文件字节大小（含 BOM，与 stat 一致）。 */
  size: number
  /** 修改时间（epoch ms）。 */
  modifiedAt: number
  /** stat 的 mode（含文件类型位，写回时只取权限位）。 */
  mode: number
}

/**
 * Read one file's text and its on-disk metadata.
 * @param path - absolute path.
 * @returns the snapshot, or undefined when the path is missing / not a regular file.
 */
export async function readFileSnapshot(path: string): Promise<FileSnapshot | undefined> {
  let info
  try {
    info = await stat(path)
  } catch {
    return undefined
  }
  if (!info.isFile()) return undefined
  try {
    return { text: await readFile(path, 'utf8'), size: info.size, modifiedAt: info.mtimeMs, mode: info.mode }
  } catch {
    return undefined
  }
}

/**
 * 原子写回一份文本文件，保留原权限位。
 * @param path - 目标文件（父目录必须存在）。
 * @param text - 完整的新内容。
 * @param mode - 原文件的 stat.mode；缺省按 0o644 新建。
 * @returns 写回后的文件大小与 mtime。
 */
export async function writeTextAtomic(path: string, text: string, mode?: number): Promise<{ size: number; modifiedAt: number }> {
  const permissions = mode === undefined ? 0o644 : mode & 0o777
  // 点前缀 + .tmp 后缀：既不进发现范围（不是 SKILL.md / *.md / AGENTS.md），
  // 也不会被用户当成技能文件看见。
  const temp = join(dirname(path), '.' + basename(path) + '.hub-' + randomBytes(6).toString('hex') + '.tmp')
  try {
    await writeFile(temp, text, { encoding: 'utf8', mode: permissions })
    await chmod(temp, permissions)
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {})
    throw error
  }
  const info = await stat(path)
  return { size: info.size, modifiedAt: info.mtimeMs }
}

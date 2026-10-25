/**
 * AGENTS.md 页的磁盘清单（只读扫描）。
 *
 * 契约：只列「dsh 支持的文件名 ∩ 磁盘上真实存在」的文件，按用户级 + 每个
 * 已知工作区分组。dsh 的候选名是固定的（用户级只有 AGENTS.md；项目级
 * AGENTS.md / CLAUDE.md + AGENTS.local.md / CLAUDE.local.md），页面不改
 * dsh 的加载行为，只是把磁盘现状照出来。
 *
 * 扫描规则（与需求契约一一对应）：
 *   - 项目内递归整棵树，没有深度上限；硬剪 `.git` / `node_modules`，
 *     再剪用户配置的「排除目录」（默认 `.agent-work`，任意层级精确匹配）。
 *   - 隐藏目录照扫；嵌套 git 仓库照扫（它们可能就是你要看的内容）。
 *   - 工作区路径本身经过排除目录的整节跳过；目录已不存在的工作区跳过。
 *   - 父工作区扫描时跳过「本身是已注册工作区」的子目录，避免同一份文件在
 *     父子两个标题下各出现一次。
 *   - 符号链接隐藏链接、显示原始：realpath 落在项目内且仍是候选文件名时按
 *     原始路径计；链接到项目外 / 坏链则保留链接自身的名字。
 *   - 去重只发生在同一目录内（trim 后内容相同），与 dsh 的候选组一致；
 *     跨目录即使内容相同也各自显示。
 */

import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { resolveExcludeDirs, type AgentsResponse, type InstructionFileDetail, type InstructionFileRef, type InstructionGroup } from './protocol.ts'
import { agentsHome, dshHome } from './store.ts'
import { workspaceEntries } from './routes/catalog-data.ts'
import { configOf, type SkillHubRouteDeps } from './routes/deps.ts'

/** dsh 在项目目录里认识的全部指令文件名，顺序即 dsh 的候选顺序。 */
export const PROJECT_INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md'] as const

/** 用户级根目录唯一的候选文件名（dsh 不认 `.local`、也不认 CLAUDE.md）。 */
export const USER_INSTRUCTION_FILE = 'AGENTS.md'

/** 无论配置如何都剪掉的目录：版本库元数据与依赖目录。 */
const ALWAYS_SKIPPED = new Set(['.git', 'node_modules'])

/** 内容去重时单个文件的上限；更大的文件不读内容，按「内容不同」处理。 */
const MAX_DEDUP_BYTES = 1_048_576

/** 候选文件名 → 在 dsh 候选顺序里的下标（去重时据此保留最早的一条）。 */
const CANDIDATE_INDEX = new Map<string, number>(PROJECT_INSTRUCTION_FILES.map((name, index) => [name, index]))

interface CandidateHit {
  absolute: string
  dir: string
  depth: number
  /** 在 dsh 候选顺序里的位置；同一目录内据此排序。 */
  offset: number
}

interface ScannedRow {
  /** 折叠链接后的真实路径。 */
  path: string
  dir: string
}

/** Path segments of an absolute path, used for exclude-name matching. */
function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment !== '')
}

/** Whether `target` is `root` itself or sits beneath it. */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** `~`-relative display for a user-level root (`~/.dsh`, `~/.agents`). */
function homeDisplay(path: string): string {
  const home = homedir()
  if (path === home) return '~'
  if (path.startsWith(home + sep)) return '~/' + relative(home, path).split(sep).join('/')
  return path
}

/** Subtitle for one project directory: `<workspace folder>[/<inner path>]`. */
function projectDisplayPath(workspaceRoot: string, dir: string): string {
  const folder = basename(workspaceRoot)
  const rel = relative(workspaceRoot, dir)
  if (rel === '' || rel === '.') return folder
  return folder + '/' + rel.split(sep).join('/')
}

/** Read one file's trimmed UTF-8 content for duplicate suppression, bounded. */
async function readTrimmed(path: string): Promise<string | undefined> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > MAX_DEDUP_BYTES) return undefined
    return (await readFile(path, 'utf8')).trim()
  } catch {
    return undefined
  }
}

/**
 * Breadth-first walk of one workspace, collecting every supported candidate.
 *
 * Symlinked *directories* are not traversed (a link back to an ancestor would
 * loop, and a linked tree is not part of this project's own layout); symlinked
 * *files* are collected and resolved later. `skipDirs` holds the roots of
 * workspaces nested inside this one — their subtrees belong to their own group.
 * Ordering is depth-then-path (broad to specific), which keeps the list stable
 * across runs.
 */
async function walkInstructionCandidates(
  root: string,
  excluded: ReadonlySet<string>,
  skipDirs: ReadonlySet<string>,
): Promise<CandidateHit[]> {
  const hits: CandidateHit[] = []
  let level: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  while (level.length > 0) {
    const next: Array<{ dir: string; depth: number }> = []
    for (const { dir, depth } of level) {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        // 无权限 / 竞态删除：这一层当作不存在，不打断整次扫描。
        continue
      }
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      for (const entry of entries) {
        const name = entry.name
        if (entry.isDirectory()) {
          if (ALWAYS_SKIPPED.has(name) || excluded.has(name)) continue
          const child = join(dir, name)
          if (skipDirs.has(child)) continue
          next.push({ dir: child, depth: depth + 1 })
          continue
        }
        const offset = CANDIDATE_INDEX.get(name)
        if (offset === undefined) continue
        if (!entry.isFile() && !entry.isSymbolicLink()) continue
        hits.push({ absolute: join(dir, name), dir, depth, offset })
      }
    }
    level = next
  }
  hits.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth
    if (a.dir !== b.dir) return a.dir < b.dir ? -1 : 1
    return a.offset - b.offset
  })
  return hits
}

/**
 * Turn one workspace's candidates into display rows.
 *
 * Two collapses, in order: identity (realpath) and per-directory trimmed
 * content. The earliest candidate in dsh order wins both times, so a link is
 * dropped for its target and a copied sibling for the first real file.
 */
async function projectRows(workspaceRoot: string, hits: readonly CandidateHit[]): Promise<InstructionFileRef[]> {
  const seen = new Set<string>()
  const scanned: ScannedRow[] = []
  for (const hit of hits) {
    let canonical = hit.absolute
    const real = await realpath(hit.absolute).catch(() => undefined)
    if (real !== undefined && isInside(workspaceRoot, real) && CANDIDATE_INDEX.has(basename(real))) canonical = real
    if (seen.has(canonical)) continue
    seen.add(canonical)
    scanned.push({ path: canonical, dir: dirname(canonical) })
  }

  // 只有同目录出现多个候选时才需要读内容（绝大多数目录只有一份）。
  const perDirectory = new Map<string, number>()
  for (const row of scanned) perDirectory.set(row.dir, (perDirectory.get(row.dir) ?? 0) + 1)
  const digestsByDirectory = new Map<string, Set<string>>()
  const rows: InstructionFileRef[] = []
  for (const row of scanned) {
    if ((perDirectory.get(row.dir) ?? 0) > 1) {
      const trimmed = await readTrimmed(row.path)
      if (trimmed !== undefined) {
        let digests = digestsByDirectory.get(row.dir)
        if (digests === undefined) {
          digests = new Set()
          digestsByDirectory.set(row.dir, digests)
        }
        if (digests.has(trimmed)) continue
        digests.add(trimmed)
      }
    }
    rows.push({ name: basename(row.path), path: projectDisplayPath(workspaceRoot, row.dir), absolute: row.path })
  }
  return rows
}

/** User-level rows: the two roots' `AGENTS.md`, identical content collapsed. */
async function userRows(dshRoot: string, agentsRoot: string): Promise<InstructionFileRef[]> {
  const rows: InstructionFileRef[] = []
  const digests = new Set<string>()
  for (const root of [dshRoot, agentsRoot]) {
    const file = join(root, USER_INSTRUCTION_FILE)
    const info = await stat(file).catch(() => undefined)
    if (info === undefined || !info.isFile()) continue
    const trimmed = await readTrimmed(file)
    if (trimmed !== undefined) {
      if (digests.has(trimmed)) continue
      digests.add(trimmed)
    }
    const real = await realpath(file).catch(() => undefined)
    // 链接到别处时显示原始文件；目标不是候选文件名就保留链接自己的名字。
    const canonical = real !== undefined && CANDIDATE_INDEX.has(basename(real)) ? real : file
    rows.push({ name: basename(canonical), path: homeDisplay(root), absolute: canonical })
  }
  return rows
}

/**
 * Scan every scope for supported instruction files.
 * @param deps - route dependencies (home overrides for tests, hub config for the exclude list).
 * @returns the ordered groups plus the exclude list that produced them.
 */
export async function scanInstructionGroups(deps: SkillHubRouteDeps): Promise<AgentsResponse> {
  const dshRoot = deps.home ?? dshHome()
  const agentsRoot = deps.agentsHome ?? agentsHome()
  const excludeDirs = resolveExcludeDirs(configOf(deps).excludeDirs)
  const excluded = new Set(excludeDirs)

  const groups: InstructionGroup[] = [{ kind: 'user', files: await userRows(dshRoot, agentsRoot) }]

  const entries = await workspaceEntries(dshRoot)
  // 工作区根先过 realpath：macOS 的 /var → /private/var 这类平台软链会让
  // 后续 realpath 结果对不上 isInside，链接折叠就会失效。
  const ownOf = async (path: string): Promise<string> => (await realpath(path).catch(() => undefined)) ?? resolve(path)
  const registered: string[] = []
  for (const entry of entries) if (entry.path !== '') registered.push(await ownOf(entry.path))
  for (const entry of entries) {
    if (entry.path === '') continue
    if (pathSegments(entry.path).some((segment) => excluded.has(segment))) continue
    const info = await stat(entry.path).catch(() => undefined)
    if (info === undefined || !info.isDirectory()) continue
    const own = await ownOf(entry.path)
    // 嵌套工作区：父项不扫子工作区的子树，否则同一份文件会出现两次。
    const nested = new Set(registered.filter((other) => other !== own && isInside(own, other)))
    const hits = await walkInstructionCandidates(own, excluded, nested)
    const title = entry.title === entry.path ? basename(entry.path) : entry.title
    groups.push({ kind: 'project', title: title === '' ? basename(entry.path) : title, files: await projectRows(own, hits) })
  }
  return { ok: true, groups, excludeDirs }
}

/** 指令文件正文读取的上限；超过视为不可展示（dsh 自己也会忽略超大文件）。 */
const MAX_DETAIL_BYTES = 1_048_576

/** A refusal from the instruction-file detail reader, carrying its HTTP status. */
export class InstructionFileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'InstructionFileError'
  }
}

/**
 * Read one instruction file that the current scan reports.
 *
 * The lookup goes through a fresh scan on purpose: it validates that the path
 * is actually one of this page's rows (no arbitrary file reads through the
 * route) and reuses the same canonical/realpath rules the list shows — 0.6 s
 * for a typical tree, and the list it compares against is exactly what the
 * user clicked.
 * @param deps - route dependencies (homes + config).
 * @param absolutePath - the row's `absolute`, as sent by the panel.
 * @returns the file body plus its on-disk metadata.
 * @throws {InstructionFileError} 404 when the path is not a current row,
 *  413 when the file is too large to display.
 */
export async function readInstructionFile(deps: SkillHubRouteDeps, absolutePath: string): Promise<InstructionFileDetail> {
  // 清单里存的是 realpath（macOS 的 /var → /private/var 会让字面路径对不上），
  // 所以两边都过一遍 realpath，同时接受调用方原样回传的行值。
  const literal = resolve(absolutePath)
  const canonical = await realpath(absolutePath).catch(() => literal)
  const scan = await scanInstructionGroups(deps)
  const ref = scan.groups
    .flatMap((group) => group.files)
    .find((row) => {
      const own = resolve(row.absolute)
      return own === canonical || own === literal
    })
  if (ref === undefined) throw new InstructionFileError('not an instruction file on this page: ' + absolutePath, 404)
  const info = await stat(ref.absolute).catch(() => undefined)
  if (info === undefined || !info.isFile()) throw new InstructionFileError('cannot read file: ' + absolutePath, 404)
  if (info.size > MAX_DETAIL_BYTES) throw new InstructionFileError('instruction file is too large to display (' + info.size + ' bytes)', 413)
  const content = await readFile(ref.absolute, 'utf8').catch(() => undefined)
  if (content === undefined) throw new InstructionFileError('cannot read file: ' + absolutePath, 404)
  return { ...ref, size: info.size, modifiedAt: info.mtimeMs, content }
}

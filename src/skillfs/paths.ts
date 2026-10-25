import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { agentsHome, dshHome } from '../store.ts'
import type { WritableRoot } from '../protocol.ts'

/** Root ids this module may write to. */
export const WRITABLE_ROOTS: readonly WritableRoot[] = ['user-dsh', 'user-agents']

/** Resolve the absolute directory of one writable root. */
export function rootPath(root: WritableRoot, home = dshHome()): string {
  switch (root) {
    case 'user-dsh': return join(home, 'skills')
    case 'user-agents': return join(agentsHome(), 'skills')
    default: throw new TypeError('unknown root: ' + String(root))
  }
}

/** Root of an absolute skill file path, or undefined when not user-owned. */
export function rootOfPath(path: string, home = dshHome()): WritableRoot | undefined {
  const normalized = resolve(path)
  for (const root of WRITABLE_ROOTS) {
    const base = resolve(rootPath(root, home))
    if (process.platform === 'win32') {
      const n = normalized.toLowerCase()
      const b = base.toLowerCase()
      if (n === b) return root
      if (n.startsWith(b + '/') || n.startsWith(b + '\\') || n.startsWith(b + sep)) return root
      // 兜底：relative 判断（处理盘符、大小写、.. 段，兼容 / 与 \）
      const rel = relative(base, normalized)
      if (rel !== '' && !rel.startsWith('..' + '/') && !rel.startsWith('..' + '\\') && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel)) return root
    } else {
      if (normalized === base) return root
      if (normalized.startsWith(base + sep) || normalized.startsWith(base + '/') || normalized.startsWith(base + '\\')) return root
      const rel = relative(base, normalized)
      if (rel !== '' && !rel.startsWith('..' + sep) && !rel.startsWith('..' + '/') && !rel.startsWith('..' + '\\') && rel !== '..' && !isAbsolute(rel)) return root
    }
  }
  return undefined
}

/** Discovery-file shapes the hub may rewrite: `<name>/SKILL.md` and `<name>.md`, plus the `.disabled` variants. */
function discoveryLeafKind(path: string): 'bundle' | 'flat' | undefined {
  const leaf = basename(resolve(path))
  if (leaf === 'SKILL.md' || leaf === 'SKILL.md.disabled') return 'bundle'
  if (/[^.]\.md(?:\.disabled)?$/.test(leaf)) return 'flat'
  return undefined
}

/**
 * Whether a path is a skill discovery file whose invocation policy the hub may
 * rewrite: a top-level entry of a user root, or
 * `<workspace>/.dsh|.agents/skills/<name>/SKILL.md` (flat and `.disabled`
 * variants included). Nested/arbitrary files are refused — the write lands on
 * real skill files only.
 */
export function editableSkillFile(path: string, home = dshHome()): boolean {
  const absolute = resolve(path)
  const kind = discoveryLeafKind(absolute)
  if (kind === undefined) return false
  const segments = (value: string): string[] => resolve(value).split(/[\\/]+/).filter((segment) => segment !== '')
  const leafSegments = segments(absolute)
  const root = rootOfPath(absolute, home)
  if (root !== undefined) {
    // 用户根：只允许顶层的 <name>/SKILL.md 或 <name>.md，与发现范围一致。
    const relativeSegments = leafSegments.slice(segments(rootPath(root, home)).length)
    return kind === 'bundle' ? relativeSegments.length === 2 : relativeSegments.length === 1
  }
  // 项目根：.dsh/skills 或 .agents/skills 之后紧跟技能条目，再后面不再有目录层级。
  const at = leafSegments.findIndex((segment, index) => (segment === '.dsh' || segment === '.agents') && leafSegments[index + 1] === 'skills')
  if (at < 0) return false
  const tail = leafSegments.length - (at + 2)
  return kind === 'bundle' ? tail === 2 : tail === 1
}

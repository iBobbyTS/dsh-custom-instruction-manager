import { type DiagnosticEntry, type WritableRoot } from '../protocol.ts';
/** One discoverable skill file in a scanned root. */
export interface SkillEntry {
    /** Absolute path of the discovery file (SKILL.md or the flat .md). */
    path: string;
    /** Directory serving as the resource base (bundle dir or the root itself). */
    directory: string;
    kind: 'directory' | 'flat';
}
/**
 * Scan one skills root for discovery files: directory bundles (SKILL.md)
 * and flat <name>.md files. `.disabled` files (legacy renames left on disk by
 * older hub builds) are excluded; dot-prefixed entries (including .trash and
 * .system) are always skipped.
 */
export declare function scanRoot(base: string): Promise<SkillEntry[]>;
/** Scan one writable root. */
export declare function listSkillEntries(root: WritableRoot, home?: string): Promise<SkillEntry[]>;
/** UI metadata from `agents/openai.yaml` beside a directory skill (mirrors codex SkillInterface). */
export interface SkillInterface {
    displayName?: string;
    shortDescription?: string;
    brandColor?: string;
    iconSmall?: string;
    iconLarge?: string;
    defaultPrompt?: string;
}
/** Read UI metadata from `agents/openai.yaml` beside a directory skill (mirrors codex SkillInterface). */
export declare function readSkillInterface(directory: string): Promise<SkillInterface | undefined>;
/**
 * Walk up from cwd (max 32 levels) for a project marker (.dsh or .git);
 * falls back to cwd itself. The provider roots project skills here.
 */
export declare function findProjectRoot(cwd: string): Promise<string>;
/**
 * Scan one writable root for files the provider ignores, so the GUI can show
 * why a skill never appears — a missing frontmatter, a name that disagrees
 * with the discovery path, and the like must be visible, not silent. Legacy
 * `.disabled` files left on disk are skipped: they are not a defect.
 */
export declare function scanDiagnostics(root: WritableRoot, home?: string): Promise<DiagnosticEntry[]>;
/**
 * 一个名字在某个 root 下的全部磁盘占位。技能名是系统里唯一的身份，但同一个名字
 * 可以被两种形态（目录包 `<name>/SKILL.md` / 扁平 `<name>.md`）× 两种状态
 * （启用 / 旧版遗留的 `.disabled` 改名）占据，而且两种形态可以**同时存在** ——
 * 注册表只会给出其中一个，另一个静默不可达。所有按名字操作文件的路径都应该从
 * 这里取值，而不是各自拼一次路径（issue #16 类的根因）。
 *
 * 两个数组都按「目录包优先」排序：目录包是 hub 自己写入的形态（导入、创建、
 * 同步都建目录包），冲突时它是更「权威」的那份。
 *
 * `.disabled` 占位只用于写入前的占位检测（避免新技能与旧文件并存）；开关功能
 * 移除后，插件不再创建或管理它们。
 */
export interface NameOccupancy {
    /** 启用态发现文件（目录包 `<name>/SKILL.md` 在前，扁平 `<name>.md` 在后）。 */
    enabled: string[];
    /** 禁用态发现文件（`<name>/SKILL.md.disabled` 在前，`<name>.md.disabled` 在后）。 */
    disabled: string[];
    /** `<name>/` 存在，但既没有 `SKILL.md` 也没有 `SKILL.md.disabled`（空壳/残留目录）。 */
    bareDir?: string;
}
/** 读一个名字在某个 skills root 下的全部占位。只读，不修改磁盘。 */
export declare function occupancyOf(base: string, name: string): Promise<NameOccupancy>;
//# sourceMappingURL=scan.d.ts.map
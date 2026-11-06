import type { WritableRoot } from '../protocol.ts';
/** Root ids this module may write to. */
export declare const WRITABLE_ROOTS: readonly WritableRoot[];
/** Resolve the absolute directory of one writable root. */
export declare function rootPath(root: WritableRoot, home?: string): string;
/** Root of an absolute skill file path, or undefined when not user-owned. */
export declare function rootOfPath(path: string, home?: string): WritableRoot | undefined;
/**
 * Whether a path is a skill discovery file whose invocation policy the hub may
 * rewrite: a top-level entry of a user root, or
 * `<workspace>/.dsh|.agents/skills/<name>/SKILL.md`. Nested/arbitrary files are
 * refused — the write lands on real skill files only.
 */
export declare function editableSkillFile(path: string, home?: string): boolean;
//# sourceMappingURL=paths.d.ts.map
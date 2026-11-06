/**
 * Skill filesystem operations for the writable roots and the hub provider's
 * discovery. Discovery reads `SKILL.md` inside a directory bundle or the flat
 * `<name>.md`; the preset's official filesystem provider watches the same
 * files.
 *
 * Frontmatter parsing mirrors @deepseek-ai/dsh-skill-filesystem semantics:
 * required name (kebab-case) + description, optional whenToUse, invocation
 * booleans with the same defaults (modelInvocable defaults true,
 * userInvocable defaults true), legacy keys rejected, and the returned
 * content is the body after the frontmatter block, trimmed.
 */
import { type InvocationPolicy } from './skillfs/frontmatter.ts';
import type { TrashEntry, WritableRoot } from './protocol.ts';
export * from './skillfs/body.ts';
export * from './skillfs/frontmatter.ts';
export * from './skillfs/paths.ts';
export * from './skillfs/scan.ts';
export * from './skillfs/write.ts';
/**
 * Scaffold a directory-bundle skill: <root>/<name>/SKILL.md with a frontmatter
 * template. Refuses non-kebab-case names.
 * @returns the created SKILL.md path.
 */
export declare function createSkill(root: WritableRoot, name: string, description: string, home?: string): Promise<string>;
/**
 * Move one already-resolved skill (a bundle directory or a flat .md file) into
 * its root's trash as `<root>/.trash/<name>-<timestamp>`.
 *
 * The layout is the restore contract, not an implementation detail:
 * `restoreSkill` renames the entry back and only proves the parent is `.trash`,
 * and `clearTrash` deletes in place. Every producer of a trash entry must go
 * through here — skill delete, the hub-disabled whole-group delete, and repo
 * import's placeholder replacement all move skills for the same recovery flow.
 *
 * @returns the trashed path plus the original path that was moved.
 */
export declare function moveIntoTrash(source: string): Promise<{
    path: string;
    source: string;
}>;
/**
 * The filesystem entry behind a discovery file: a directory bundle is addressed
 * by its `SKILL.md` and moved as a whole directory, a flat `<name>.md` file is
 * moved as itself. Single definition of that mapping — delete, restore,
 * sync-replace and placeholder retirement must all agree on it, or one of them
 * moves a bundle's discovery file and leaves an empty directory.
 */
export declare function trashSourceOf(discoveryPath: string): string;
/**
 * Move a skill (directory bundle or flat .md file) into the root's trash.
 * The skill stays recoverable: the source is renamed into
 * <root>/.trash/<name>-<timestamp>. A directory bundle is addressed by its
 * SKILL.md (or SKILL.md.disabled) path and moved as a whole directory.
 * @returns the trashed path plus the original path that was moved.
 */
export declare function trashSkill(sourcePath: string): Promise<{
    path: string;
    source: string;
}>;
/**
 * The user's system trash directory: macOS `~/.Trash`, Linux XDG
 * `~/.local/share/Trash/files`. Windows has no filesystem-level Recycle Bin,
 * so the caller gets a TypeError it can surface as a clear refusal.
 */
export declare function systemTrashDir(home?: string): string;
/**
 * Move one skill entry (bundle directory or flat .md) into the system trash.
 * A same-named entry already in the trash gains a timestamp suffix instead of
 * being overwritten — deleting must never destroy an earlier trash item.
 * @returns the path inside the trash.
 */
export declare function trashSkillToSystem(source: string, trashDir?: string): Promise<string>;
/** Whether a path lives inside an asar archive (the app bundle ships these). */
export declare function isBundledPath(path: string): boolean;
/**
 * Show one file or directory in the OS file manager: Finder selects it
 * (`open -R`), Explorer selects it, and Linux desktops open its folder.
 */
export declare function revealInFileManager(path: string): Promise<void>;
/** Restore a trashed skill (directory or flat file) to its original location. */
export declare function restoreSkill(entry: TrashEntry, home?: string): Promise<string>;
/** Permanently delete one trashed skill (directory or flat file). */
export declare function clearTrash(entry: TrashEntry, home?: string): Promise<string>;
/** Repair one file on disk when its frontmatter is auto-fixable. Returns the new text.
 *
 * The write is atomic (sibling temp file + rename), matching the sidecar's
 * persist path: this rewrites a real skill file in place, and a crash midway
 * through a plain write would leave a truncated SKILL.md — exactly the failure
 * the store layer already guards against. The `.tmp` sibling is never picked
 * up by discovery (only `SKILL.md` and `*.md` are scanned).
 */
export declare function fixDiagnosticFile(path: string, home?: string): Promise<string>;
/**
 * Rewrite a skill file's invocation keys (dsh has no registry setter — the
 * frontmatter is the source of truth every provider parses).
 *
 * Refuses anything that is not a top-level discovery file of a user root or a
 * project root (`editableSkillFile`), refuses when the patch would not
 * round-trip, and writes atomically like {@link fixDiagnosticFile}: a torn
 * SKILL.md is invisible to discovery and would read as a deleted skill.
 *
 * @returns the absolute path that was rewritten.
 */
export declare function setInvocationPolicy(path: string, policy: InvocationPolicy, home?: string): Promise<string>;
//# sourceMappingURL=skillfs.d.ts.map
/**
 * The hub's own skill provider, registered into the GLOBAL layer of the
 * official ctx.skills registry.
 *
 * Why: in the dsh web app the base host skill-filesystem row is disabled on
 * purpose — agent presets own local discovery by mounting their own
 * skill-filesystem into their preset scope layers, so a host-plane query
 * against the registry's empty global layer sees nothing. The hub needs a
 * session-independent management view, so it contributes one itself: the
 * user roots always, plus the project roots when the caller names a cwd.
 *
 * Agent views are unaffected: preset layers are nearer than the global
 * layer, so a preset's own filesystem provider wins every duplicate name
 * outright, and this provider only surfaces skills for presets that mount
 * no filesystem row at all.
 */
import type { SkillCandidate, SkillDefinition, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill';
/**
 * Global-layer skill provider for the hub's management catalog.
 * Implements the official SkillProvider contract: list() returns
 * invocation-neutral candidates; get() resolves the winning candidate's
 * body. Both are readonly reads of the local skill roots.
 */
export declare class SkillHubProvider implements SkillProvider {
    readonly name = "skill-hub";
    private readonly home;
    private readonly control;
    private readonly watchTimer;
    private rootStamp;
    /** 上一次 watch 失败的错误文案（同一错误只记一次，避免 5 秒定时器刷屏）。 */
    private lastWatchError;
    constructor(control: SkillProviderControl, home?: string);
    /**
     * checkRoots 的守卫包装：某个根不可读（EACCES/ENOTDIR）时不能抛成未处理
     * 拒绝——构造时一次、之后每 5 秒一次。错误按文案去重，恢复后清零。
     */
    private watch;
    /**
     * Invalidate the registry cache when the discovered skill files changed.
     * The stamp covers the per-skill discovery file's mtime + size (plus the
     * entry set itself), so editing a SKILL.md body — not just adding or
     * renaming directories — refreshes the GUI catalog.
     */
    private checkRoots;
    list(options: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<readonly SkillCandidate[]>;
    get(candidate: SkillCandidate): Promise<SkillDefinition | undefined>;
    /**
     * The roots this provider lists: user roots always, project roots with cwd.
     *
     * Project roots are matched by their base directory against the user roots:
     * a workspace that has no project marker of its own (no `.dsh`/`.git`)
     * resolves upward to `$HOME`, whose `.dsh`/`.agents` ARE the user roots. Listing
     * those again as `project-dsh`/`project-agents` would report one physical
     * SKILL.md twice — once as a user skill, once as a project skill of that
     * workspace — which the panel then shows as duplicated rows.
     */
    private roots;
    /** Public hook for the routes: invalidate after hub-driven mutations. */
    invalidate(): void;
}
//# sourceMappingURL=provider.d.ts.map
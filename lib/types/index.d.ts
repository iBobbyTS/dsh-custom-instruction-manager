/**
 * dsh-skill-hub — host half. Mounts the /api/skill-hub route family (full
 * skill catalog from the official ctx.skills registry, skill detail,
 * new-skill scaffold, market/source management). The browser half (./client)
 * renders the sidebar entry and the skill hub panel. Everything rides
 * official NPM SDK packages — no dsh source changes.
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export declare const name = "skill-hub";
/** Services required before the skill-hub surfaces can mount. `settings` is deliberately NOT here: the plugin reads its own volatile config refs and only reaches for the settings service when it is present (issue #11). */
export declare const inject: string[];
/**
 * Plugin config, validated by the same-named schemastery schema.
 *
 * dsh 0.1.7 replaced the "plugin registers a settings namespace" model with
 * "the Loader entry's Config IS the settings namespace", so this one schema is
 * both the composition config and the settings page. Every field is volatile:
 * the Loader re-resolves volatile values in place and re-enters apply()
 * instead of rebuilding the fiber, and only volatile fields are writable
 * through the settings transport.
 */
export interface Config {
    /** Master switch for the plugin (routes, provider). */
    enabled: Volatile<boolean>;
    /** Show per-skill invocation count chip. Default true. */
    showUseCount: Volatile<boolean>;
    /** Show per-skill last-used relative time. Default true. */
    showUseTime: Volatile<boolean>;
    /** Show group-header usage summaries (count + last used). Default true. */
    showGroupSummary: Volatile<boolean>;
    /** 模型可调圆点颜色（#rrggbb）；缺省用面板默认色。 */
    dotModelColor: Volatile<string | undefined>;
    /** 用户可调圆点颜色（#rrggbb）；缺省用面板默认色。 */
    dotUserColor: Volatile<string | undefined>;
    /** GitHub token；`role('secret')` 让 settings 层统一脱敏，缺省为匿名。 */
    githubToken: Volatile<string | undefined>;
    /** 统计滚动窗口天数：只统计最近 N 天的使用；0 = 全部历史。 */
    statsWindowDays: Volatile<number>;
    /** 自动统计扫描间隔（分钟，最小 1）。 */
    statsScanMinutes: Volatile<number>;
    /** AGENTS.md 页扫描项目时跳过的目录名（默认 `.agent-work`）。 */
    excludeDirs: Volatile<string[]>;
}
/**
 * The live plugin config the settings page edits. Field order here is the row
 * order the auto-generated page renders.
 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    dotModelColor: z<string, string, "volatile">;
    dotUserColor: z<string, string, "volatile">;
    showUseCount: z<boolean, boolean, "volatile-defined">;
    showUseTime: z<boolean, boolean, "volatile-defined">;
    showGroupSummary: z<boolean, boolean, "volatile-defined">;
    statsWindowDays: z<number, number, "volatile-defined">;
    statsScanMinutes: z<number, number, "volatile-defined">;
    excludeDirs: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    githubToken: z<string, string, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    dotModelColor: z<string, string, "volatile">;
    dotUserColor: z<string, string, "volatile">;
    showUseCount: z<boolean, boolean, "volatile-defined">;
    showUseTime: z<boolean, boolean, "volatile-defined">;
    showGroupSummary: z<boolean, boolean, "volatile-defined">;
    statsWindowDays: z<number, number, "volatile-defined">;
    statsScanMinutes: z<number, number, "volatile-defined">;
    excludeDirs: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    githubToken: z<string, string, "volatile">;
}>>, "plain">;
/**
 * The settings namespace this plugin's config lives under, narrowed to the
 * settings package's branded type. The browser half resolves the same form
 * through `ctx.configForms.get(HUB_ENTRY_ID)`.
 */
export declare const ENTRY_ID: SettingsNamespace;
/**
 * Mount the skill hub routes.
 * @param ctx - host plugin context carrying webServer/skills/settings.
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map
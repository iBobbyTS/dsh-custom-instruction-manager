/**
 * routes 共享层 · 依赖视图：路由依赖接口、配置解析与可写技能解析（HTTP
 * 围栏在 ./http.ts）。
 */
import type { ServerResponse } from 'node:http';
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill';
import { type HubConfig, type WritableRoot } from '../protocol.ts';
import { type SkillHubStore } from '../store.ts';
import { type RouteFence } from './http.ts';
/** Sources whose files the hub may write (the user-level filesystem roots). */
export declare function isWritableSource(source: string): source is WritableRoot;
/** Lookup options the hub forwards to the registry (cwd selects project roots). */
export interface SkillLookupLike {
    cwd?: string;
}
/** Route family dependencies (narrow structural view of ctx.skills for tests). */
export interface SkillHubRouteDeps {
    skills: {
        snapshot(options?: SkillLookupLike): Promise<{
            skills: SkillSummary[];
            complete: boolean;
        }>;
        get(name: string, options?: SkillLookupLike): Promise<SkillDefinition | undefined>;
    };
    store: SkillHubStore;
    /**
     * Request fence for the whole family: returns the rejection status (401/403)
     * or `undefined` to proceed. Production passes the host's own `/api` fence
     * (`ctx.connection.requestRejection`); absent falls back to literal loopback.
     */
    fence?: RouteFence;
    /** DSH home override (tests isolate the writable roots; defaults to ~/.dsh). */
    home?: string;
    /**
     * Shared agents root override (tests isolate the user-level AGENTS.md scan;
     * defaults to `DSH_AGENTS_HOME` or `~/.agents`).
     */
    agentsHome?: string;
    /** Invalidate the registry catalog cache after hub-driven mutations. */
    invalidate?: () => void;
    /** Optional invocation-count reader; absent means the stats route reports unavailable. */
    stats?: import('../stats.ts').SkillStatsReader;
    /** Resolves the current plugin config; business routes honour the master switch. */
    config?: () => HubConfig;
    /** Resolves the raw saved config layer (fields the user explicitly overrode). */
    saved?: () => Partial<HubConfig>;
    /** Persist a config patch and re-sync plugin surfaces; resolves with the fresh config. */
    updateConfig?: (patch: Partial<HubConfig>) => Promise<HubConfig>;
    /**
     * MCP 域访问面（列服务器 / 开关）。生产实现读 dsh 的 pluginManager / loader /
     * tools 服务（见 ../mcp-runtime.ts）；测试注入假实现。缺失时 MCP 路由回 503。
     */
    mcp?: import('../mcp.ts').McpAccess;
    /**
     * MCP 写入口（新建/编辑/删除服务器行）。受管行直接重写本插件的 insert
     * 块，其余行转发 dsh 的 config-editor。缺失时保存路由回 503。
     */
    mcpConfig?: import('../mcp.ts').McpConfigurator;
    /**
     * System trash directory override (tests point it at a temp dir). Absent uses
     * the platform trash: macOS ~/.Trash, Linux ~/.local/share/Trash/files.
     */
    trashDir?: string;
    /**
     * Reveal opener override (tests record the path instead of driving Finder).
     * Absent shells out to `open -R` / Explorer / xdg-open.
     */
    reveal?: (path: string) => Promise<void>;
    /**
     * Tokenizer vocabulary cache directory override (tests point it at a temp
     * dir). Absent uses `$DSH_HOME/plugin/data/custom-instruction-manager/tokenizer`.
     */
    tokenCacheDir?: string;
    /**
     * Tokenizer download override (tests serve a fixture instead of reaching
     * Hugging Face). Absent uses the global fetch.
     */
    fetchImpl?: typeof globalThis.fetch;
}
/** The resolved hub config a route sees (the shared resolver fills defaults). */
export declare function configOf(deps: SkillHubRouteDeps): HubConfig;
/**
 * The raw saved config layer as persisted in the sidecar, reported for display
 * only. Since dsh 0.1.7 the settings namespace is the one user layer, so this
 * is legacy data: nothing writes it any more and the effective config above
 * never merges it.
 */
export declare function savedOf(deps: SkillHubRouteDeps): Partial<HubConfig>;
/** Refuse business routes while the master switch is off (the config route stays up). */
export declare function disabledGate(deps: SkillHubRouteDeps, res: ServerResponse): boolean;
/** Resolve the home used for writable-root operations. */
export declare function homeOf(deps: SkillHubRouteDeps): string;
/** A skill resolved as a hub-writable user-level file. */
export interface WritableSkill {
    skill: SkillDefinition;
    /** Absolute discovery-file path (guaranteed present by the resolver). */
    path: string;
    /** The writable root containing the file. */
    root: WritableRoot;
}
/** A refusal with the exact HTTP error the caller should answer with. */
export interface WritableSkillRefusal {
    status: number;
    error: string;
}
export type WritableSkillResult = {
    ok: true;
} & WritableSkill | {
    ok: false;
} & WritableSkillRefusal;
/**
 * Resolve a skill by name as something the hub may write, or the exact
 * refusal the caller should answer with. Owns the guard sequence shared by
 * skill/delete: registry lookup, writable source, writable file, and path
 * containment inside a user root.
 */
export declare function resolveWritableSkill(deps: SkillHubRouteDeps, name: string, cwd?: string): Promise<WritableSkillResult>;
//# sourceMappingURL=deps.d.ts.map
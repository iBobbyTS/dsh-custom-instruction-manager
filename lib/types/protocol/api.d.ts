/**
 * Root path of the skill-hub API family. The host also registers this as its
 * 404 catch-all prefix, so a mistyped path answers with a plain 404 naming the
 * path instead of falling through to the SPA fallback (which answers 401 and
 * reads like an auth problem).
 */
export declare const SKILL_HUB_API_ROOT = "/api/skill-hub";
/**
 * 编辑保存路由的请求体上限。正文本身可能远超默认的 64 KB（指令文件允许
 * 显示到 1 MB，JSON 转义后还会再涨一点），所以保存路由单独抬到 8 MB：
 * 超限按 400 拒绝，绝不截断后落盘。
 */
export declare const MAX_EDIT_BODY_BYTES: number;
/**
 * Browser-facing base paths of the skill-hub API family.
 *
 * Naming rule: a path's segments mirror its scope. Market sources own the
 * `/market/source/*` subtree — add, delete, ref, versions, check, sync — so
 * the update check and the sync that acts on its result sit side by side.
 */
export declare const SKILL_HUB_API: {
    readonly catalog: "/api/skill-hub/catalog";
    readonly mcp: "/api/skill-hub/mcp";
    readonly mcpToggle: "/api/skill-hub/mcp/toggle";
    readonly mcpSave: "/api/skill-hub/mcp/save";
    readonly mcpRemove: "/api/skill-hub/mcp/remove";
    readonly agents: "/api/skill-hub/agents";
    readonly agentsScan: "/api/skill-hub/agents/scan";
    readonly agentsFile: "/api/skill-hub/agents/file";
    readonly agentsFileSave: "/api/skill-hub/agents/file/save";
    readonly skillContent: "/api/skill-hub/skill/content";
    readonly tokens: "/api/skill-hub/tokens";
    readonly tokensModels: "/api/skill-hub/tokens/models";
    readonly tokensSelect: "/api/skill-hub/tokens/select";
    readonly skill: "/api/skill-hub/skill";
    readonly skillDelete: "/api/skill-hub/skill/delete";
    readonly skillReveal: "/api/skill-hub/skill/reveal";
    readonly skillInvocation: "/api/skill-hub/skill/invocation";
    readonly create: "/api/skill-hub/create";
    readonly stats: "/api/skill-hub/stats";
    readonly config: "/api/skill-hub/config";
    readonly market: "/api/skill-hub/market";
    readonly marketSource: "/api/skill-hub/market/source";
    readonly marketSourceDelete: "/api/skill-hub/market/source/delete";
    readonly marketSourceRef: "/api/skill-hub/market/source/ref";
    readonly marketCheck: "/api/skill-hub/market/source/check";
    readonly marketSync: "/api/skill-hub/market/source/sync";
    readonly repo: "/api/skill-hub/repo";
    readonly repoImport: "/api/skill-hub/repo/import";
    readonly repoImportProgress: "/api/skill-hub/repo/import/progress";
    readonly repoImportCancel: "/api/skill-hub/repo/import/cancel";
    readonly update: "/api/skill-hub/update";
    readonly groups: "/api/skill-hub/groups";
    readonly sources: "/api/skill-hub/sources";
    readonly sourceCheck: "/api/skill-hub/sources/check";
    readonly sourceSync: "/api/skill-hub/sources/sync";
    readonly sourceDelete: "/api/skill-hub/sources/delete";
    readonly sourceRestore: "/api/skill-hub/sources/restore";
    readonly sourceTrashClear: "/api/skill-hub/sources/trash/clear";
    readonly diagnosticFix: "/api/skill-hub/diagnostic/fix";
    readonly marketSourceVersions: "/api/skill-hub/market/source/versions";
    readonly marketStats: "/api/skill-hub/market/stats";
};
//# sourceMappingURL=api.d.ts.map
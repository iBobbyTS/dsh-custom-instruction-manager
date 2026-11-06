/**
 * Browser-side API client for the /api/skill-hub route family. The only
 * data access path the panel uses — plain fetch, same origin.
 */
import { type AgentsCacheResponse, type AgentsScanStep, type InstructionFileDetail, type CatalogResponse, type ConfigRequest, type ConfigResponse, type CreateRequest, type CreateResponse, type DiagnosticFixResponse, type GroupsResponse, type InstructionFileSaveRequest, type InstructionFileSaveResponse, type MarketCheckResponse, type MarketSourceAddResponse, type MarketSourcesResponse, type MarketSourceVersionsResponse, type MarketStatsResponse, type MarketSyncResponse, type McpRemoveResponse, type McpResponse, type McpSaveResponse, type McpServerInput, type McpToggleResponse, type RepoDiscoverResponse, type RepoImportCancelResponse, type RepoImportProgressResponse, type RepoImportResponse, type SkillDetail, type SkillContentRequest, type SkillContentResponse, type SkillInvocationRequest, type SkillInvocationResponse, type SkillDeleteResponse, type SkillRevealResponse, type SourceCheckResponse, type SourceDeleteResponse, type SourceRestoreResponse, type SourceTrashClearResponse, type SourcesResponse, type SourceSyncResponse, type StatsResponse, type TokenCountEntry, type TokenModelState, type UpdateCheckResponse } from '../protocol.ts';
/** Error carrying the route's JSON error message. */
export declare class SkillHubApiError extends Error {
    /** 机器可读的错误分类（例如保存冲突的 `stale`）。 */
    readonly code?: string | undefined;
    /** 原始响应体：冲突时带 `latest`，供「复制并重新加载」使用。 */
    readonly body?: unknown | undefined;
    constructor(message: string, 
    /** 机器可读的错误分类（例如保存冲突的 `stale`）。 */
    code?: string | undefined, 
    /** 原始响应体：冲突时带 `latest`，供「复制并重新加载」使用。 */
    body?: unknown | undefined);
}
/**
 * Resolve one route path against the page's base.
 *
 * Every route in this family is registered on the server as a root-absolute
 * path (`/api/skill-hub/...`), which is right there but wrong in a browser
 * behind a reverse proxy that owns a path prefix: the page loads from
 * `https://host/app/dsh/` while a root-absolute URL drops the prefix entirely,
 * so the gateway answers 404 HTML and `readJson` reports "invalid JSON
 * response" (issue #18). Resolving against `document.baseURI` is the host's own
 * convention — `dsh-client-connection` opens its browser carrier with
 * `new URL(path.slice(1), document.baseURI)` — so a root deployment resolves to
 * exactly the same absolute path while a prefixed one keeps its prefix, and the
 * gateway strips it before forwarding: the server still receives
 * `/api/skill-hub/*`.
 *
 * `SKILL_HUB_API_ROOT` must stay absolute (the same constant registers the
 * routes on the server), which is why the prefix is applied here at the single
 * outbound boundary rather than in the constants.
 * @param path - one route path, root-absolute unless it is already a full URL.
 * @returns the URL to fetch.
 */
export declare function resolveApiUrl(path: string): string;
/** The browser half's only data entry point. */
export declare class SkillHubApi {
    /** One GET round trip (query already encoded by the caller). */
    private get;
    /** One POST round trip (body omitted for routes that take none). */
    private post;
    /** Catalog lookup options (cwd selects a workspace's project skills). */
    catalog(options?: {
        cwd?: string;
    }): Promise<CatalogResponse>;
    /** One skill's detail (cwd selects a workspace's project skills). */
    skill(name: string, options?: {
        cwd?: string;
    }): Promise<SkillDetail>;
    /**
     * 改写一个技能文件的调用方式（frontmatter 的 disable-model-invocation /
     * user-invocable）。dsh 注册表没有写入口，值只能落在文件里。
     */
    setInvocation(payload: SkillInvocationRequest): Promise<SkillInvocationResponse>;
    /**
     * Move one writable skill into the system trash (~/.Trash, timestamped on a
     * name clash) so Finder keeps the recovery path. Project skills pass cwd.
     */
    deleteSkill(name: string, cwd?: string): Promise<SkillDeleteResponse>;
    /** Reveal one skill file in the OS file manager (Finder). */
    revealSkill(name: string, cwd?: string): Promise<SkillRevealResponse>;
    create(payload: CreateRequest): Promise<CreateResponse>;
    stats(): Promise<StatsResponse>;
    /** The user's added market sources. */
    market(): Promise<MarketSourcesResponse>;
    /** Add a market source repo; resolves with the fresh list plus the resolved slug. */
    addMarketSource(repo: string): Promise<MarketSourceAddResponse>;
    /** Remove a market source repo; resolves with the fresh list. */
    removeMarketSource(repo: string): Promise<MarketSourcesResponse>;
    /** Stars + downloads per market source (hourly server-side cache; refresh=1 refetches stale entries). */
    marketStats(refresh?: boolean): Promise<MarketStatsResponse>;
    /** Check every market source for updates (throttled server-side). */
    marketCheck(): Promise<MarketCheckResponse>;
    /** Align a market source to its pinned ref; resolves with tracked skills. */
    marketSync(repo: string): Promise<MarketSyncResponse>;
    /** Releases + branches of a market source for the version picker. */
    marketSourceVersions(repo: string): Promise<MarketSourceVersionsResponse>;
    /** Pin a market source to an explicit ref (branch picker). */
    setMarketSourceRef(repo: string, ref: string): Promise<MarketSourcesResponse>;
    /** Check the hub's own latest GitHub release. */
    updateCheck(): Promise<UpdateCheckResponse>;
    /** Discover importable skills in a GitHub repo. */
    repoDiscover(repo: string): Promise<RepoDiscoverResponse>;
    /** Install selected repo skills into the user-dsh root (records the source). Returns jobId for polling. */
    repoImport(repo: string, paths: string[], ref?: string): Promise<RepoImportResponse>;
    /** Poll import job progress (B方案轮询) */
    repoImportProgress(jobId: string): Promise<RepoImportProgressResponse>;
    /** Cancel a running import job (选项2：唯有取消才停) */
    repoImportCancel(jobId: string): Promise<RepoImportCancelResponse>;
    /** Read the hub's runtime config (effective values + saved overrides). */
    config(): Promise<ConfigResponse>;
    /** Persist a config patch (only the fields in the patch change); resolves with the fresh config. */
    updateConfig(patch: ConfigRequest): Promise<ConfigResponse>;
    /**
     * AGENTS.md 页：上一次完成的索引缓存（不触发扫描）。
     *
     * `cached=false` 表示这个 host 进程还没扫过，面板据此跳过「先铺缓存」。
     */
    agentsCache(): Promise<AgentsCacheResponse>;
    /**
     * AGENTS.md 页：分批扫描的一步（一个作用域一步）。
     *
     * 第 0 步不带 scanId；后续步骤带上第 0 步返回的 id，`code='expired'` 时
     * 说明这一轮已被别的扫描顶掉，从第 0 步重来即可。
     */
    agentsScan(scanId: string | undefined, step: number): Promise<AgentsScanStep>;
    /** AGENTS.md 页：按清单里的绝对路径读取一个文件的正文与元数据。 */
    agentsFile(path: string): Promise<InstructionFileDetail>;
    /**
     * 写回一份指令文件的整份原文。
     *
     * 请求带载入时的 mtime/size：磁盘在编辑期间被别处改过时，host 回 409，
     * 这里抛 code='stale' 的 SkillHubApiError（body.latest 是最新内容）。
     */
    saveAgentsFile(payload: InstructionFileSaveRequest): Promise<InstructionFileSaveResponse>;
    /**
     * 写回技能正文（frontmatter 由 host 原样保留）。
     * 冲突语义与 {@link saveAgentsFile} 相同：code='stale' + body.latest。
     */
    saveSkillContent(payload: SkillContentRequest): Promise<SkillContentResponse>;
    /** MCP 分类页：当前进程里配置的 MCP 服务器、它们的工具与可写性。 */
    mcp(): Promise<McpResponse>;
    /** 启用/禁用一台 MCP 服务器；响应里带回刷新后的列表（省一次往返）。 */
    toggleMcp(entryId: string, enabled: boolean): Promise<McpToggleResponse>;
    /**
     * 新建（不传 entryId）或编辑一台 MCP 服务器。
     *
     * 保存落在 profile 补丁里：本页建的行写进本插件的受管块，其余行交给 dsh
     * 的配置编辑服务。字段校验失败时 host 回 400 + `fields`，错误体在
     * SkillHubApiError.body 里。
     */
    saveMcpServer(server: McpServerInput, entryId?: string): Promise<McpSaveResponse>;
    /** 删除本页管理的 MCP 服务器。 */
    removeMcpServer(entryId: string): Promise<McpRemoveResponse>;
    /**
     * 数一段文件原文在各模型词表下的 token 数。
     *
     * 超时给到 150s，而不是其余接口的 10s：第一次计数要先下载词表（DeepSeek
     * 6 MB + GLM 19 MB），用默认超时会让首次进入详情页必然失败。词表落到宿主
     * 本机缓存后，后续计数是毫秒级。
     * @param text - 文件原文，原样传递（不 trim）。
     * @returns 每个模型一条结果（失败项带 error，另一个模型不受影响）。
     */
    countTokens(text: string): Promise<TokenCountEntry[]>;
    /** 可选 token 模型（含选中与已下载状态）——「管理模型」的数据源。 */
    tokenModels(): Promise<TokenModelState[]>;
    /**
     * 勾选/取消一个模型：勾选会先下载词表（19 MB 级），取消则删掉那份文件。
     * 超时同样给到 150s——首次下载 6 MB / 19 MB。
     * @returns 改完之后的完整模型列表。
     */
    selectTokenModel(id: string, selected: boolean): Promise<TokenModelState[]>;
    /** 系统集合组 + origin 映射。 */
    groups(): Promise<GroupsResponse>;
    /** 来源列表 + 派生 origin 映射 + 集合组 + 回收站。 */
    sources(): Promise<SourcesResponse>;
    /** 检查指定（或全部）来源的上游更新。 */
    checkSources(repo?: string): Promise<SourceCheckResponse>;
    /** 同步一个来源的所选（或全部）技能到上游最新版本。 */
    syncSource(repo: string, skills?: string[]): Promise<SourceSyncResponse>;
    /** 跟进上游删除：把所选技能移入回收站。 */
    confirmDeleteSource(repo: string, skills: string[]): Promise<SourceDeleteResponse>;
    /** 从回收站恢复一个技能。 */
    restoreSource(name: string): Promise<SourceRestoreResponse>;
    /** Permanently delete every skill currently in the trash. */
    clearTrash(): Promise<SourceTrashClearResponse>;
    /** Auto-fix a fixable diagnostic (e.g. unquoted colon). */
    fixDiagnostic(path: string): Promise<DiagnosticFixResponse>;
}
//# sourceMappingURL=api.d.ts.map
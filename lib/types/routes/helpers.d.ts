/**
 * routes 共享层：请求栅栏（宿主 /api 信任模型 → 方法 → 总开关 → JSON 体）、
 * 统一错误映射、可写技能解析、目录/分组数据装配。handler 只写业务，从这里 import。
 * 本文件是聚合出口（barrel）：实现按域拆到 ./http.ts（栅栏/错误映射/读体）、
 * ./deps.ts（依赖视图/可写解析）、./collection.ts（集合装配）、
 * ./catalog-data.ts（目录装配）；对外导出面保持不变。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebRoute, WebRouteKind } from '@deepseek-ai/dsh-host-webserver';
import { type SkillHubRouteDeps } from './deps.ts';
export { MAX_JSON_BODY_BYTES, STORE_ERROR_STATUS, isLoopbackRequest, loopbackOnlyFence, pathExists, queryParam, readJsonBody, readNumber, readString, readStrings, writeError, writeFileFailure, writeJson, writeRouteError, } from './http.ts';
export type { RouteFence } from './http.ts';
export { configOf, disabledGate, homeOf, isWritableSource, resolveWritableSkill, savedOf, } from './deps.ts';
export type { SkillHubRouteDeps, SkillLookupLike, WritableSkill, WritableSkillRefusal, WritableSkillResult, } from './deps.ts';
export { buildCollections, buildGroups } from './collection.ts';
export { applyInterface, buildCatalog, knownSkillNames, toDetail, workspaceEntries, } from './catalog-data.ts';
export type { WorkspaceEntry } from './catalog-data.ts';
/** What a route handler receives: fences already passed, URL/body prepared. */
export interface RouteContext {
    req: IncomingMessage;
    res: ServerResponse;
    /** Request URL parsed against a localhost base (query reading for GET). */
    url: URL;
    /** Parsed JSON body; empty object for requests without one. */
    body: Record<string, unknown>;
}
export type RouteHandler = (context: RouteContext) => Promise<void>;
/** One declarative route: path + accepted methods + the business handler. */
export interface RouteSpec {
    path: string;
    /**
     * Match kind: 'exact' (default) matches the pathname verbatim; 'prefix'
     * matches the path and everything beneath it. The webserver consults the
     * exact table first and then resolves prefixes longest-first, so a prefix
     * route is a catch-all that can never shadow a real route.
     */
    kind?: WebRouteKind;
    /** Accepted HTTP methods; anything else answers 405. */
    methods: readonly ('GET' | 'POST')[];
    /** POST requests must carry a JSON body (400 when missing/unparseable). */
    jsonBody?: boolean;
    /**
     * JSON body byte cap for this route; defaults to MAX_JSON_BODY_BYTES.
     * The token-count route carries the file text itself, so it raises this.
     */
    bodyLimit?: number;
    /** Skip the master-switch gate (the config route stays up while disabled). */
    skipGate?: boolean;
    handler: RouteHandler;
}
/**
 * Wrap one handler in the shared request fences. Order matches the
 * original per-handler prologue: trust fence → HTTP method → master
 * switch → JSON body. The outer catch maps errors onto the JSON error
 * body (preserving RepoFetchError status codes).
 *
 * The trust fence is the host's `/api` model (`deps.fence`) whenever the
 * composition mounts Connection, so a reverse-proxied deployment is judged by
 * the same authorities dsh already trusts; without that service the historical
 * literal-loopback check stands in.
 */
export declare function createRoute(deps: SkillHubRouteDeps, spec: RouteSpec): WebRoute;
//# sourceMappingURL=helpers.d.ts.map
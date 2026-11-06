/**
 * routes 共享层 · HTTP 围栏：请求信任栅栏（复用宿主 `/api` 模型，见 RouteFence）、
 * JSON 响应与错误映射、请求体读取、查询/字段读取与文件存在性检查。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** Cap on JSON request bodies (create/config payloads are tiny). */
export declare const MAX_JSON_BODY_BYTES: number;
/** Loopback literal check plus browser same-origin markers. */
export declare function isLoopbackRequest(request: IncomingMessage): boolean;
/**
 * The route family's request fence: the HTTP status a request is rejected
 * with (`401` unauthenticated / `403` untrusted authority), or `undefined`
 * when it may reach the handler.
 *
 * dsh owns **one** browser-trust model for the whole `/api` tree — loopback,
 * the listener's own bind address, every `--trusted-host` authority, then the
 * browser session — and publishes it as `ctx.connection.requestRejection`,
 * whose contract is written for exactly this case ("apply Connection's
 * Host/Origin checks ... to another Web route"). Our paths are exact routes
 * registered beside the shared `/api` prefix, so the host's own fence never
 * sees them; asking its entry point instead of re-deriving the rule keeps a
 * single trust model rather than a second, stricter one. Issue #17 is what the
 * second one cost: behind a reverse proxy the literals checkable in this file
 * are the gateway address and the public domain, so every route answered 403
 * while the rest of the GUI worked.
 */
export type RouteFence = (request: IncomingMessage) => number | undefined;
/**
 * Fallback fence for a host that mounts no Connection service (unit tests, and
 * any composition serving the webserver alone): the historical literal-loopback
 * check, so a missing service degrades to the previous behaviour instead of an
 * open or a dead route family.
 */
export declare function loopbackOnlyFence(request: IncomingMessage): number | undefined;
/** One JSON response. */
export declare function writeJson(res: ServerResponse, status: number, body: unknown): void;
/** One JSON error response. */
export declare function writeError(res: ServerResponse, status: number, error: unknown): void;
/** HTTP status per store business-rule kind (user error, not server fault). */
export declare const STORE_ERROR_STATUS: {
    readonly validation: 400;
    readonly 'not-found': 404;
    readonly conflict: 409;
};
/** Map known error types onto HTTP statuses: repo fetch + store business rules. */
export declare function writeRouteError(res: ServerResponse, error: unknown): void;
/**
 * Read a JSON request body (undefined when too large or unparseable).
 * @param req - inbound request.
 * @param limit - byte cap; a route that carries file text passes its own.
 */
export declare function readJsonBody(req: IncomingMessage, limit?: number): Promise<Record<string, unknown> | undefined>;
/** URL query helper (first value, decoded). */
export declare function queryParam(url: URL, name: string): string | undefined;
/**
 * 读取请求体里的字符串字段（缺失或类型不符返回 ''）。替代各 handler 里
 * `body as unknown as XRequest` 的断言 + 手写 typeof 收窄。
 */
export declare function readString(body: Record<string, unknown>, key: string): string;
/**
 * 读取请求体里的字符串数组：非数组返回 []，丢弃非字符串项；默认同时丢弃
 * 空串（keepEmpty=true 时保留空串，由调用方决定语义）。
 */
export declare function readStrings(body: Record<string, unknown>, key: string, options?: {
    keepEmpty?: boolean;
}): string[];
/** Async existence check (import/sync use it on the user root). */
export declare function pathExists(path: string): Promise<boolean>;
/** 读取请求体里的数字字段（缺失或类型不符返回 undefined）。 */
export declare function readNumber(body: Record<string, unknown>, key: string): number | undefined;
/**
 * 落盘失败的可读回应：文件没了 / 只读 / 目录不可写都是**用户可见的业务
 * 拒绝**（409），不是 500 崩溃。返回 true 表示已经写过响应。
 */
export declare function writeFileFailure(res: ServerResponse, error: unknown, path: string): boolean;
//# sourceMappingURL=http.d.ts.map
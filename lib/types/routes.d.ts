/**
 * The /api/skill-hub route family: full catalog (skills from the official
 * registry + discovery diagnostics), skill detail, new-skill scaffold, origin
 * collections, and upstream source tracking (check/sync/follow upstream
 * deletion into a restorable trash). Every route carries the host's
 * own `/api` trust fence (loopback, the listener's bind address, each
 * `--trusted-host` authority, then the browser session) — these endpoints
 * write files under the user's skill roots, so they must never be laxer than
 * the GUI around them (issue #17).
 *
 * 按域拆分后的聚合入口：各域 handler 在 ./routes/<domain>.ts，共享围栏在
 * ./routes/helpers.ts，节流/任务状态在 ./routes/route-state.ts。
 * 老 `from './routes.ts'`（makeRoutes + SkillHubRouteDeps）保持可用。
 */
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import { type SkillHubRouteDeps } from './routes/helpers.ts';
import { type RouteFence } from './routes/http.ts';
export type { SkillHubRouteDeps, SkillLookupLike } from './routes/helpers.ts';
export type { RouteFence } from './routes/http.ts';
/**
 * Build the family's trust fence from the host's `/api` model.
 *
 * `ctx.connection.requestRejection` is the documented hook for fencing another
 * Web route; with no Connection service (a webserver-only composition, or a
 * unit test) the literal-loopback check stands in, so the fallback is the old
 * behaviour rather than an open route family.
 *
 * The service is read **per request**, not once at mount: plugins start in
 * composition order, so a one-shot read at `apply()` time would latch the
 * fallback whenever this plugin happens to come up before Connection. A
 * persistent absence is almost certainly an upstream composition change rather
 * than a transient startup order, so the first miss fires `onMissing` once —
 * without that signal the fallback would silently reproduce issue #17 after
 * any future upstream rename of the service.
 * @param read - resolves `ctx.connection`, or `undefined` when absent.
 * @param onMissing - called once, the first time the service reads absent.
 * @returns the fence every route in this family runs first.
 */
export declare function hostTrustFence(read: () => HostConnectionHandle | undefined, onMissing?: () => void): RouteFence;
/**
 * Build every /api/skill-hub route.
 * @param deps - skill registry view + sidecar store + trust fence.
 * @returns the exact-path routes plus the family's 404 catch-all.
 */
export declare function makeRoutes(deps: SkillHubRouteDeps): WebRoute[];
//# sourceMappingURL=routes.d.ts.map
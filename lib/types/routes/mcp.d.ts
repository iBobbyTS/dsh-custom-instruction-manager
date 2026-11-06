/**
 * MCP 域路由：服务器列表、启用/禁用、新建/编辑、删除。
 *
 * 读写分工：
 *   - GET  /api/skill-hub/mcp          投影 Loader 行 + 行配置 + 当前工具；
 *   - POST /api/skill-hub/mcp/toggle   转发给 dsh 的插件管理接口；
 *   - POST /api/skill-hub/mcp/save     新建（无 entryId）或编辑（有 entryId）；
 *   - POST /api/skill-hub/mcp/remove   删除本插件受管块里的行。
 *
 * 保存/删除只改 profile 补丁：受管块由本插件重写，其余行交给 dsh 的
 * config-editor（整份校验 + 原子写 + 热应用）。校验错误按字段回 400，冲突
 * （同名服务器、非受管行）回 409，未知行回 404。
 */
import { type RouteSpec, type SkillHubRouteDeps } from './helpers.ts';
/** MCP 域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
export declare function mcpRoutes(deps: SkillHubRouteDeps): RouteSpec[];
//# sourceMappingURL=mcp.d.ts.map
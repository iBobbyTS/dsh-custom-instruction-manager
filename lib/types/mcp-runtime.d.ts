/**
 * Read MCP facts from native manager status views, legacy Loader rows and tools.
 * Existing toggle operations accept only addressable Loader client rows.
 * Manager-owned entries stay read-only and never expose raw configuration.
 */
import { type McpAccess } from './mcp.ts';
/**
 * Build the MCP access surface over a context service reader.
 * @param get - reads one service off the plugin context (`ctx.get`), `undefined` when absent.
 * @returns list/toggle over the MCP rows of this process.
 */
export declare function createMcpAccess(get: (name: string) => unknown): McpAccess;
//# sourceMappingURL=mcp-runtime.d.ts.map
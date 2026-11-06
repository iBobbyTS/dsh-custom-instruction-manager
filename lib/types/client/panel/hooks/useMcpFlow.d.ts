/**
 * useMcpFlow — MCP 分类页的数据域：服务器列表、展开状态、开关、新建/编辑/删除。
 *
 * 只在进入 MCP 分类时拉一次（不参与目录/统计的 5s/60s 轮询）：MCP 的启用态
 * 只在用户动手或 dsh 重启时变化，定时重读只会白跑。
 *
 * 写操作的响应里已经带回刷新后的列表，所以保存/删除后不再补一次 GET。
 */
import type { McpFieldError, McpResponse, McpServerInfo, McpServerInput } from '../../../protocol.ts';
import type { HubKey } from '../../locales.ts';
import { type SkillHubApi } from '../../api.ts';
/** 一次操作的结果提示（存键 + 插值，语言切换后仍然正确）。 */
export interface McpNotice {
    kind: 'ok' | 'warn' | 'error';
    key: HubKey;
    values?: Record<string, string>;
}
/** 打开中的表单：新建，或编辑一台已存在的服务器。 */
export type McpEditorState = {
    mode: 'create';
} | {
    mode: 'edit';
    server: McpServerInfo;
};
/** MCP 页的完整状态与动作面。 */
export interface McpFlow {
    data: McpResponse | null;
    loading: boolean;
    error: string | null;
    /** 正在开关/删除的服务器 entryId（该行整体禁用交互）。 */
    busyEntry: string | null;
    /** 最近一次操作的结果；null = 没有提示。 */
    notice: McpNotice | null;
    /** 展开了工具清单的服务器 entryId 集合。 */
    expanded: ReadonlySet<string>;
    /** 打开中的新建/编辑表单。 */
    editor: McpEditorState | null;
    /** 表单正在保存（禁用字段与按钮）。 */
    editorBusy: boolean;
    /** 字段级校验失败（host 的 400 响应，按字段标红）。 */
    editorErrors: McpFieldError[];
    /** 表单里的非字段错误（网络/409）：显示在对话框内，而不是被遮罩挡住。 */
    editorError: string | null;
    /** 读一次服务器列表。 */
    load: () => Promise<void>;
    /** 启用/禁用一台服务器。 */
    toggle: (entryId: string, enabled: boolean) => Promise<void>;
    /** 展开/收起一台服务器的工具清单。 */
    toggleExpanded: (entryId: string) => void;
    /** 打开新建表单（不传）或编辑表单（传服务器）。 */
    openEditor: (server?: McpServerInfo) => void;
    /** 关闭表单并丢弃草稿。 */
    closeEditor: () => void;
    /** 新建（entryId 缺省）或保存编辑。 */
    saveServer: (input: McpServerInput, entryId?: string) => Promise<void>;
    /** 删除本页管理的服务器。 */
    removeServer: (entryId: string) => Promise<void>;
    dismissNotice: () => void;
}
export declare function useMcpFlow(api: SkillHubApi): McpFlow;
//# sourceMappingURL=useMcpFlow.d.ts.map
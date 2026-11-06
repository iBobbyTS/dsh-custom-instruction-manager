/**
 * MCP 分类页：一行一台 MCP 服务器。
 *
 * 服务器在 dsh 里是 Loader 的一行插件实例，所以这一页没有"新建/导入"这类
 * 动作（增删改是 P2）；这一期只做三件事：把行照出来（名称、传输、状态、
 * 配置摘要）、展开看它注册了哪些工具、按行启用/禁用。
 *
 * 状态词只到「已加载 / 启动中 / 启动失败 / 已禁用」：dsh 不暴露 MCP 会话的
 * 连接状态，写「已连接」就是骗人。
 *
 * `env` / `headers` 的值按行默认遮掩（点「显示值」才展开）：它们经回环 +
 * 会话栅栏返回，但屏幕上的暴露面越小越好。
 */
import type { McpFieldError, McpResponse, McpServerInput, McpServerInfo } from '../../protocol.ts';
import type { McpEditorState, McpNotice } from './hooks/useMcpFlow.ts';
export interface McpViewProps {
    data: McpResponse | null;
    loading: boolean;
    error: string | null;
    /** 正在开关的服务器 entryId（该行禁用交互）。 */
    busyEntry: string | null;
    notice: McpNotice | null;
    expanded: ReadonlySet<string>;
    /** 打开中的新建/编辑表单。 */
    editor: McpEditorState | null;
    editorBusy: boolean;
    editorErrors: readonly McpFieldError[];
    editorError: string | null;
    onRefresh: () => void;
    onToggle: (entryId: string, enabled: boolean) => void;
    onToggleExpanded: (entryId: string) => void;
    onOpenEditor: (server?: McpServerInfo) => void;
    onCloseEditor: () => void;
    onSaveServer: (input: McpServerInput, entryId?: string) => void;
    onRemoveServer: (entryId: string) => void;
    onDismissNotice: () => void;
}
export declare function McpView(props: McpViewProps): React.JSX.Element;
//# sourceMappingURL=McpView.d.ts.map
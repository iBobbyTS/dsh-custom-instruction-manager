/** MCP server list: legacy configuration controls and native manager status/tool views. */
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
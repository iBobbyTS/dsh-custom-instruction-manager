/**
 * McpServerDialog — 新建/编辑一台 MCP 服务器的表单。
 *
 * 字段与 dsh 的 `@deepseek-ai/dsh-mcp-client` 配置对齐；`reconnect` 之类的
 * 高级项不在这里改，但保存时会被原样保留（host 只覆盖表单提交的字段）。
 *
 * env/headers 用「每行一个」的朴素写法：`KEY=VALUE` 与 `KEY: VALUE`。解析
 * 失败在本地就拦住，不把一行坏文本发到 host 再让它 400。
 */
import { type JSX } from 'react';
import type { McpEditorState } from './hooks/useMcpFlow.ts';
import type { McpFieldError, McpServerInput } from '../../protocol.ts';
export interface McpServerDialogProps {
    editor: McpEditorState;
    /** 保存请求在飞行中：禁用字段与按钮。 */
    busy: boolean;
    /** host 返回的字段级错误。 */
    errors: readonly McpFieldError[];
    /** 非字段错误（网络/冲突），显示在对话框内。 */
    error?: string | null;
    onCancel: () => void;
    onSave: (input: McpServerInput) => void;
}
export declare function McpServerDialog(props: McpServerDialogProps): JSX.Element;
//# sourceMappingURL=McpServerDialog.d.ts.map
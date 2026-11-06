/**
 * AGENTS.md 页：只读的指令文件清单。
 *
 * 分组标题是「用户级」+ 每个工作区（没有单独的「项目级」层），组内一行一个
 * 文件：大标题是真实文件名，副标题是从项目文件夹父目录算起的路径
 * （`lmdo-website`、`lmdo-website/docs`）。没有候选文件的分组保留标题，
 * 下面一行灰字「无 AGENTS.md」。
 *
 * 排除目录的编辑入口放在这一页（不放「关于」）：它是本页扫描的剪枝清单，
 * 默认 `.agent-work`，保存走 /config 并立即重扫。
 */
import type { AgentsResponse, InstructionFileRef } from '../../protocol.ts';
import type { AgentsScanProgress } from './hooks/useAgentsFlow.ts';
export interface AgentsViewProps {
    data: AgentsResponse | null;
    /** 扫描进度；null = 没有扫描在跑。有进度时「重新扫描」变成不可点的「扫描中（x%）」。 */
    scan: AgentsScanProgress | null;
    error: string | null;
    /** 排除目录保存中：禁用输入与按钮，避免连点写两次。 */
    saving: boolean;
    onRefresh: () => void;
    /** @param dirs - 完整清单；null = 清除覆盖、回落到默认清单。 */
    onSaveExcludeDirs: (dirs: string[] | null) => void;
    /** 点开一行：进入该文件的正文页（scope = 所属分组标题）。 */
    onOpenFile: (file: InstructionFileRef, scope: string) => void;
}
export declare function AgentsView(props: AgentsViewProps): React.JSX.Element;
//# sourceMappingURL=AgentsView.d.ts.map
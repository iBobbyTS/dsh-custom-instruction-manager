/**
 * useAgentsFlow — AGENTS.md 页的数据域：索引缓存、分步扫描、单个文件正文、排除目录读写。
 *
 * 索引的取法（页面打开 / 手动重新扫描都走它）：
 *   1. 先读 host 的缓存（GET /agents）。命中就整份铺上——页面立即有内容，不再
 *      等一次全树遍历；没有缓存就跳过这一步。
 *   2. 然后按步重扫（GET /agents/scan）：第 0 步用户级，其后每个工作区一步。
 *      每回来一步就把它替换到列表的同一位置，还没扫到的尾部继续沿用缓存内容，
 *      所以扫描期间列表不闪空、内容逐步变成新的。
 *   3. 最后一步落下后列表就是这一轮的完整结果（host 也已把它提升为缓存）。
 *
 * 百分比 = 已完成步数 / 总步数；`scan` 为 null 表示没有扫描在跑。
 *
 * 排除目录保存后立刻重扫，让「改了立即生效」在界面上可见。
 */
import type { AgentsResponse, InstructionFileDetail, InstructionFileRef } from '../../../protocol.ts';
import { type SkillHubApi } from '../../api.ts';
/** 详情页状态：先带着列表行的信息打开（标题/路径立刻可见），正文随后到。 */
export interface AgentsFileState {
    ref: InstructionFileRef;
    /** 所属分组标题（用户级或工作区标题）。 */
    scope: string;
    detail?: InstructionFileDetail;
    loading: boolean;
    error?: string;
}
/** 扫描进度：已完成的步数与总步数（第 0 步之前 total 为 0，按钮按 0% 显示）。 */
export interface AgentsScanProgress {
    done: number;
    total: number;
}
export declare function useAgentsFlow(api: SkillHubApi): {
    agents: AgentsResponse | null;
    scan: AgentsScanProgress | null;
    agentsError: string | null;
    excludeSaving: boolean;
    loadAgents: (fresh?: boolean) => Promise<void>;
    saveExcludeDirs: (dirs: string[] | null) => Promise<void>;
    agentsFile: AgentsFileState | null;
    openAgentsFile: (ref: InstructionFileRef, scope: string) => Promise<void>;
    closeAgentsFile: () => void;
    patchAgentsFile: (next: {
        content: string;
        size: number;
        modifiedAt: number;
    }) => void;
};
//# sourceMappingURL=useAgentsFlow.d.ts.map
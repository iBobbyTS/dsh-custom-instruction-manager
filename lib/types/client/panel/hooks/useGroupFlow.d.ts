/**
 * useGroupFlow — 分组域：groups 加载（集合组 + origin 映射）。组内技能的
 * 启用/禁用不存在之后，这里只剩数据加载。
 */
import type { GroupsResponse } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import type { FlowNotices } from './shared.ts';
export declare function useGroupFlow(api: SkillHubApi, shared: FlowNotices): {
    groupsState: GroupsResponse | null;
    loadGroups: () => Promise<void>;
};
//# sourceMappingURL=useGroupFlow.d.ts.map
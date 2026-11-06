/**
 * useMetaFlow — 自身更新检查 + 调用统计 + 配置：只依赖 api，
 * 不碰其他域。补捞 effect 自包含（uses.size + loadUses）。
 */
import type { HubConfig } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import { type UpdateState } from './shared.ts';
export declare function useMetaFlow(api: SkillHubApi): {
    updateState: UpdateState;
    checkUpdate: () => Promise<void>;
    uses: ReadonlyMap<string, {
        count: number;
        lastUsed?: number;
    }>;
    loadUses: () => Promise<void>;
    hubConfig: HubConfig | null;
    loadConfig: () => Promise<void>;
};
//# sourceMappingURL=useMetaFlow.d.ts.map
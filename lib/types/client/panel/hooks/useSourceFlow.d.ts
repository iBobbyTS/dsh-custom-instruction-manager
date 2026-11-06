/**
 * useSourceFlow — 来源域：来源列表/更新检查/同步确认/跟进删除/回收站恢复/
 * 清空回收站，以及单个技能的删除确认流。目录与分组的刷新经聚合根
 * 传入的 reload 回调，不直接碰其他域的 state。
 */
import type { SourceCheckResult, SourcesResponse } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
import { type FlowNotices } from './shared.ts';
import type { ConfirmDialogState } from '../dialogs.tsx';
export declare function useSourceFlow(api: SkillHubApi, shared: FlowNotices, 
/** 目录重载（技能增删后刷新列表，目录域提供）。 */
reloadCatalog: () => Promise<void>, 
/** 分组重载（来源/成员变化后刷新，分组域提供）。 */
reloadGroups: () => Promise<void>): {
    sourcesState: SourcesResponse | null;
    sourceCheck: Readonly<Record<string, SourceCheckResult>>;
    checkingSource: string | null;
    syncingSource: string | null;
    confirmDialog: ConfirmDialogState | null;
    deleteSkillDialog: string | null;
    confirmClearTrash: boolean;
    setConfirmDialog: import("react").Dispatch<import("react").SetStateAction<ConfirmDialogState | null>>;
    setDeleteSkillDialog: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    setConfirmClearTrash: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    loadSources: () => Promise<void>;
    checkSources: (repo?: string) => Promise<void>;
    requestSync: (repo: string, skills: string[]) => void;
    requestDelete: (repo: string, skills: string[]) => void;
    runConfirmed: () => Promise<void>;
    restoreTrash: (name: string) => Promise<void>;
    clearTrash: () => Promise<void>;
    requestDeleteSkill: (name: string) => void;
    runDeleteSkill: () => Promise<void>;
};
//# sourceMappingURL=useSourceFlow.d.ts.map
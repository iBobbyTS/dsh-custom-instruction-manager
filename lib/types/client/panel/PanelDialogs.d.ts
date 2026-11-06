/**
 * PanelDialogs — SkillHubPanel 底部的对话框接线层（同步/删除确认、分支选择、
 * 版本选择、市场同步、删除技能、清空回收站）。状态与动作仍由 useSkillHub
 * 的 hub 持有；这里只收窄成显式 props，渲染顺序与拆分前完全一致。
 */
import type { JSX } from 'react';
import type { SkillHubState } from './useSkillHub.ts';
export interface PanelDialogsProps {
    /** 来源同步/删除确认。 */
    confirmDialog: SkillHubState['confirmDialog'];
    setConfirmDialog: SkillHubState['setConfirmDialog'];
    runConfirmed: SkillHubState['runConfirmed'];
    /** 无 release 的市场源分支选择。 */
    branchChoice: SkillHubState['branchChoice'];
    branchBusy: SkillHubState['branchBusy'];
    setBranchChoice: SkillHubState['setBranchChoice'];
    confirmBranchChoice: SkillHubState['confirmBranchChoice'];
    /** 市场源版本选择。 */
    versionDialog: SkillHubState['versionDialog'];
    versionBusy: SkillHubState['versionBusy'];
    setVersionDialog: SkillHubState['setVersionDialog'];
    confirmVersionDialog: SkillHubState['confirmVersionDialog'];
    /** 市场源同步后的技能勾选。 */
    marketSyncDialog: SkillHubState['marketSyncDialog'];
    syncBusy: SkillHubState['syncBusy'];
    setMarketSyncDialog: SkillHubState['setMarketSyncDialog'];
    confirmMarketSync: SkillHubState['confirmMarketSync'];
    /** 删除单个技能确认。 */
    deleteSkillDialog: SkillHubState['deleteSkillDialog'];
    setDeleteSkillDialog: SkillHubState['setDeleteSkillDialog'];
    runDeleteSkill: SkillHubState['runDeleteSkill'];
    /** 清空回收站确认。 */
    confirmClearTrash: SkillHubState['confirmClearTrash'];
    setConfirmClearTrash: SkillHubState['setConfirmClearTrash'];
    clearTrash: SkillHubState['clearTrash'];
}
export declare function PanelDialogs(props: PanelDialogsProps): JSX.Element;
//# sourceMappingURL=PanelDialogs.d.ts.map
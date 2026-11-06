/**
 * useGroupView — 分组视图的派生数据：来源过滤后的技能、可见集合、用户级
 * 管理方聚合、项目级成员、顶层顺序，以及「可折叠节点」与「是否已全部折叠」。
 *
 * 抽出来是因为「全部折叠」按钮长在视图切换那一行（「分组」右边），而折叠
 * 键必须和 SourcesView 渲染的节点完全一致：两处共用同一份推导，避免按钮
 * 算到的键与列表里的键对不上（点了只折叠一半）。纯派生，不发起请求。
 */
import type { CatalogSkill, CollectionGroup } from '../../../protocol.ts';
import { type ManagedBucket, type VisibleCollection } from '../../grouping.ts';
import type { SkillHubState } from '../useSkillHub.ts';
export interface GroupView {
    /** 通过来源筛选的技能（含项目级，用于分组；平铺视图自己另取 sorted）。 */
    sourceFiltered: CatalogSkill[];
    /** 通过筛选的项目级技能。 */
    projectSkillsAll: CatalogSkill[];
    hasProject: boolean;
    /** 有可见成员的上游集合。 */
    visible: VisibleCollection[];
    collections: CollectionGroup[];
    /** 未绑定来源、非项目级的技能（用户级）。 */
    uncategorized: CatalogSkill[];
    allPersonalNames: string[];
    hasPersonal: boolean;
    personalBuckets: ManagedBucket[];
    subdividedPersonal: boolean;
    /** 顶层分组顺序：用户级 → 来源集合 → 项目级。 */
    topKeys: string[];
    /** 当前视图里可折叠的节点键（二级分组、集合、管理方桶）。 */
    collapsibleKeys: string[];
    /** 可折叠节点是否已全部折叠。 */
    allCollapsed: boolean;
}
export declare function useGroupView(hub: SkillHubState): GroupView;
//# sourceMappingURL=useGroupView.d.ts.map
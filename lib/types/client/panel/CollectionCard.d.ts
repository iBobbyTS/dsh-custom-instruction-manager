/**
 * CollectionCard — 一个上游来源集合分组：组头（来源链接 + 成员数 + 用量
 * 汇总）、检查/同步/跟删徽章，以及展开后的技能行。
 * 数据与动作均由 SourcesView 传入；顺序由集合名决定。
 */
import type { JSX } from 'react';
import type { CatalogSkill, CollectionGroup, SourceCheckResult } from '../../protocol.ts';
import { type SkillRowProps } from './SkillRow.tsx';
import type { SkillHubState } from './useSkillHub.ts';
export interface CollectionCardProps {
    collection: CollectionGroup;
    /** 该集合内、且通过筛选的技能。 */
    skills: CatalogSkill[];
    /** 该集合分组是否折叠。 */
    collapsed: boolean;
    /** 该来源的上游检查结果。 */
    check: SourceCheckResult | undefined;
    /** 正在检查的来源名。 */
    checkingSource: string | null;
    /** 正在同步的来源名。 */
    syncingSource: string | null;
    /** SkillRow 共用的收窄 props（skill 由行内传入）。 */
    rowProps: Omit<SkillRowProps, 'skill'>;
    toggleGroupCollapse: SkillHubState['toggleGroupCollapse'];
    checkSources: SkillHubState['checkSources'];
    requestSync: SkillHubState['requestSync'];
    requestDelete: SkillHubState['requestDelete'];
}
export declare function CollectionCard(props: CollectionCardProps): JSX.Element;
//# sourceMappingURL=CollectionCard.d.ts.map
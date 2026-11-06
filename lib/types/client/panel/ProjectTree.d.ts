/**
 * ProjectTree — 项目级顶层分组：小标题（照官方 插件 页的「内置插件配置」）+ 按
 * workspace 聚合的二级节点（可折叠），并支持按 .dsh/.agents 细分两层。
 * 分组顺序 = dsh 侧面栏的工作区顺序；不再支持拖动/上移下移重排。
 */
import type { JSX } from 'react';
import type { CatalogSkill } from '../../protocol.ts';
import { type SkillRowProps } from './SkillRow.tsx';
export interface ProjectTreeProps {
    /** 技能来源筛选后的项目技能。 */
    skills: CatalogSkill[];
    /** 折叠的树键（'project:<workspace>' / 'project:<workspace>:<source>'）。 */
    collapsedGroups: ReadonlySet<string>;
    toggleGroupCollapse: (key: string) => void;
    /** 已细分（按 .dsh/.agents）的项目键。 */
    subdividedProjects: ReadonlySet<string>;
    toggleSubdivide: (key: string) => void;
    /** SkillRow 收窄后的 props（skill 由行内传入）；uses / hubConfig 也取自它。 */
    rowProps: Omit<SkillRowProps, 'skill'>;
    /** 已知工作区路径，按 dsh 侧面栏顺序（catalog.workspaces）；空数组即保持原序。 */
    workspaceOrder?: readonly string[];
}
export declare function ProjectTree(props: ProjectTreeProps): JSX.Element;
//# sourceMappingURL=ProjectTree.d.ts.map
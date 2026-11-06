/**
 * 二级分组：缩进 + 发丝引导线 + 披露箭头 + 「标题 · 数量」。
 *
 * 项目级技能（.dsh / .agents 细分）与个人技能（按「管理方」细分）共用这
 * 一套显示，二级不再套卡片面，只有缩进与一条竖线。
 */
import type { JSX, ReactNode } from 'react';
export interface SubGroupProps {
    /** 分组标题（已本地化的来源标签，或管理方名称）。 */
    title: string;
    /** 标题悬停提示（如「管理方」）。 */
    titleHint?: string;
    /** 成员数（已启用 + 已禁用）。 */
    count: number;
    collapsed: boolean;
    onToggle: () => void;
    children: ReactNode;
}
export declare function SubGroup(props: SubGroupProps): JSX.Element;
//# sourceMappingURL=SubGroup.d.ts.map
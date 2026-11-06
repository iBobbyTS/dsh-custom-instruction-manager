/**
 * RowMenu — 技能行右侧的「…」操作菜单，与 dsh 工作区/会话行同款：
 * 16px 的三点图标按钮随行悬停出现（dsh 的 .rowActions / .iconButton），
 * 点击弹出 4px 内边距、12px 圆角、34px 行高的半透明卡片菜单
 * （dsh-client-ui-primitives 的 Menu：--dsw-menu-surface-fill +
 * backdrop blur + --dsw-elevation-prominent）。
 *
 * 菜单用 fixed 定位挂到 body：面板本身在滚动容器里，绝对定位会被裁掉。
 */
import { type JSX, type ReactNode } from 'react';
/** One menu row: id reported to onSelect, visible label, optional leading icon. */
export interface RowMenuItem {
    id: string;
    label: string;
    icon?: ReactNode;
    /** Destructive row: error text + danger hover fill. */
    danger?: boolean;
    disabled?: boolean;
    /** 不可用时的说明（禁用项的原生 title）。 */
    disabledHint?: string;
}
export interface RowMenuProps {
    /** aria-label of the trigger, e.g. "adaptive-debugging 的更多操作". */
    label: string;
    items: readonly RowMenuItem[];
    onSelect: (id: string) => void;
    disabled?: boolean;
}
export declare function RowMenu({ label, items, onSelect, disabled }: RowMenuProps): JSX.Element;
//# sourceMappingURL=RowMenu.d.ts.map
/**
 * 详情页的正文区：没有单独的编辑态——可写文件的正文就是同一个框，直接改；
 * 下面固定一行「保存 / 放弃所有编辑」。
 *
 * 盒子与只读时完全一样（等宽、`.5px` 发丝边、圆角、内边距、最大 62vh 后内部
 * 滚动），高度跟随内容，不设任何编辑专用的高度或拖拽手柄。状态由面板持有，
 * 这里只收 props，所以每一种状态都能用 renderToStaticMarkup 直接断言。
 * ⌘S / Ctrl+S 在框里等同「保存」。
 */
import { type JSX } from 'react';
/** 正文区的展示与动作（两个详情页共用的 prop 形状）。 */
export interface EditModeProps {
    /** 可写文件才给可编辑的框；内置/插件技能没有文件，保持只读 <pre>。 */
    editable: boolean;
    draft: string;
    /** 保存中（按钮禁用，避免连点写两次）。 */
    busy: boolean;
    /** 草稿与磁盘内容不同（没有改动时保存/放弃都是禁用的）。 */
    dirty: boolean;
    /** 上一次保存失败的原因。 */
    error?: string;
    onDraft: (value: string) => void;
    onSave: () => void;
    /** 放弃所有编辑 = 恢复成载入时的磁盘内容；二次确认由面板/hook 负责。 */
    onDiscard: () => void;
}
export interface EditBodyProps {
    /** 只读态显示的正文（可写时用 draft，这里只在不可写时用到）。 */
    content: string;
    edit: EditModeProps;
    /** 文本域的无障碍名称。 */
    label: string;
}
export declare function EditBody(props: EditBodyProps): JSX.Element;
//# sourceMappingURL=EditBody.d.ts.map
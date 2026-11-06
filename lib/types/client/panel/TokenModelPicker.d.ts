/**
 * 「管理模型」展开后的多选列表：原生 checkbox + 名称 + 状态（已下载 / 大小 /
 * 下载中 / 删除中）。
 *
 * dsh 没有给插件用的多选组件（schema-form 那套没有在 profile 里安装，也不属于
 * 客户端模块表），所以就用三个 checkbox：勾选下载、取消删除，语义和浏览器的
 * 表单控件完全一致，键盘与读屏器都能直接用。
 *
 * 一个模型都不选是合法状态（表格只剩「管理模型」一行），所以这里没有"至少选
 * 一个"的约束，也不禁用最后一个勾。
 */
import type { JSX } from 'react';
import type { TokenModelState } from '../../protocol.ts';
export interface TokenModelPickerProps {
    models: TokenModelState[];
    /** 正在下载/删除的模型 id。 */
    busyModel: string | null;
    onSelect: (id: string, selected: boolean) => void;
    /** 最近一次改选失败的原因。 */
    error?: string;
}
export declare function TokenModelPicker(props: TokenModelPickerProps): JSX.Element;
//# sourceMappingURL=TokenModelPicker.d.ts.map
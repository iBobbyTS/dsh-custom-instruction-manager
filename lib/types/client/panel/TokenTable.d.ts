/**
 * Token 统计表：模型 / Tokens，最后一行是「管理模型」。
 *
 * 行的来源是宿主的选中集合（`models`），不是协议常量的全集：Kimi K3 默认不选，
 * 勾上才会出现在表格里。服务器列表还没回来时先按协议层的默认集合画行，避免
 * 打开详情页先空一下再跳。
 *
 * 没有状态列：没数出来就是 `-`；失败的那一行用红色，原因由 title 带出。
 * 「管理模型」展开后是原生 checkbox 列表（dsh 没有给插件用的多选组件），
 * 勾选即下载、取消即删除词表——由宿主执行，这里只发起与回填。
 *
 * 纯展示：数据与动作都由 useTokenCount / useTokenModels 给。
 */
import { type JSX } from 'react';
import { type TokenModelState } from '../../protocol.ts';
import type { TokenCountState } from './hooks/useTokenCount.ts';
export interface TokenTableProps {
    state: TokenCountState;
    /** 宿主返回的可选模型（含选中状态）；`null` = 还没拿到。 */
    models: TokenModelState[] | null;
    /** 正在下载/删除的模型 id。 */
    busyModel: string | null;
    /** 勾选/取消一个模型。 */
    onSelectModel: (id: string, selected: boolean) => void;
    /** 「管理模型」最近一次失败的原因。 */
    modelError?: string;
}
export declare function TokenTable(props: TokenTableProps): JSX.Element;
//# sourceMappingURL=TokenTable.d.ts.map
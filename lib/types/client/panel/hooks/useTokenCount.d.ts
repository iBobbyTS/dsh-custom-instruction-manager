/**
 * useTokenCount — 打开详情页时异步数一次当前文件原文的 token。
 *
 * 触发时机：原文出现或换成另一份（进入详情页、在列表里点开另一行、保存
 * 正文后回填新正文）。不轮询、不防抖，也不跟随编辑态里的草稿——数字永远
 * 是磁盘上那份正文的数字；返回列表再点回来会重新数一次（宿主侧没有结果
 * 缓存，只有常驻的 tokenizer）。
 *
 * 状态是互斥的四档而不是几个并列布尔：表格要区分「还没开始（正文没到）」
 * 「在算」「算完了」「整个请求失败」，这四件事在 UI 上是四种文案，用布尔
 * 组合迟早会拼出`loading=false && entries=null`这种说不清的状态。
 */
import type { TokenCountEntry } from '../../../protocol.ts';
import type { SkillHubApi } from '../../api.ts';
/** 一次计数请求的生命周期。 */
export type TokenCountState = {
    status: 'idle';
} | {
    status: 'loading';
} | {
    status: 'ready';
    entries: TokenCountEntry[];
} | {
    status: 'failed';
    error: string;
};
/**
 * @param api - panel 的 API 客户端。
 * @param text - 被计数的文件原文；`undefined` 表示正文还没到（详情页先渲染
 *   标题与元数据，正文随后到），此时不发请求。
 * @param revision - 额外的重算信号：用户在「管理模型」里改了选中集合，原文没变
 *   但行变了，靠这个自增值再数一次。
 * @returns 当前这次计数的状态。
 */
export declare function useTokenCount(api: SkillHubApi, text: string | undefined, revision?: number): TokenCountState;
//# sourceMappingURL=useTokenCount.d.ts.map
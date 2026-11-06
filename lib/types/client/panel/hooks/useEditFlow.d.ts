/**
 * useEditFlow — 正文编辑的草稿状态：正文框始终可写，草稿与磁盘内容分居两侧。
 *
 * 没有「编辑态」开关：详情页一到达就把当前正文放进来，用户直接改；下面固定
 * 是「保存 / 放弃所有编辑」。保存成功后草稿与基准都换成落盘的那份（按钮随之
 * 变灰），放弃则二次确认后回到载入时的磁盘内容。
 *
 * 冲突语义（需求契约）：保存时带上载入时的 mtime + 大小，host 发现磁盘上的
 * 文件已经变过就回 409 + 最新内容，这里弹三选——
 *   复制并重新加载：草稿复制到剪贴板，正文换成磁盘上的最新版本；
 *   继续编辑：关掉弹窗，草稿原样保留，不写盘；
 *   仍然覆盖：不带指纹再存一次，用草稿覆盖磁盘。
 */
import type { EditSnapshot } from '../../../protocol.ts';
import { type SkillHubApi } from '../../api.ts';
/** 保存成功后交给面板的事件：面板据此刷新提示与 token 表。 */
export type EditSavedEvent = {
    kind: 'skill';
    name: string;
    cwd?: string;
    path: string;
    snapshot: EditSnapshot;
} | {
    kind: 'agents';
    path: string;
    snapshot: EditSnapshot;
};
/** 一次编辑的目标（技能名或指令文件绝对路径 + 当前磁盘指纹）。 */
export interface EditTarget {
    kind: 'skill' | 'agents';
    /** 技能名，或指令文件的绝对路径。 */
    key: string;
    /** 项目技能所属工作区。 */
    cwd?: string;
    /** 最终写入的文件（详情页已知时传，用于提示）。 */
    path?: string;
    /** 载入时的 mtime/size；缺省表示不做冲突检查。 */
    modifiedAt?: number;
    size?: number;
}
/** 冲突弹窗的三个选择。 */
export type EditChoice = 'copy-reload' | 'continue' | 'overwrite';
interface EditSession {
    target: EditTarget;
    /** 载入（或上次保存/放弃）时的磁盘正文。 */
    base: string;
    draft: string;
    busy: boolean;
    error?: string;
    /** 磁盘上的最新状态；非空 = 弹三选框。 */
    conflict?: EditSnapshot;
}
export declare function useEditFlow(api: SkillHubApi, onSaved: (event: EditSavedEvent) => void): {
    session: EditSession | null;
    /** 当前有未保存改动。 */
    dirty: boolean;
    begin: (target: EditTarget, content: string) => void;
    clear: () => void;
    setDraft: (value: string) => void;
    save: () => void;
    discard: () => void;
    confirmDiscard: () => boolean;
    resolveConflict: (choice: EditChoice) => void;
};
export {};
//# sourceMappingURL=useEditFlow.d.ts.map
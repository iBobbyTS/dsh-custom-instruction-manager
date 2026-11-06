/**
 * Full-page skill detail view: metadata, upstream source card with
 * check/sync/follow-delete actions, and the raw SKILL.md body. Pure
 * presentation — every state value and action arrives as a prop, so the
 * panel stays the single owner of state.
 *
 * The source card is the only place update information appears, and it is
 * rendered solely for skills recorded against an upstream repo (imported
 * from a market source or a direct repo address). Built-in, plugin-provided,
 * hand-placed and project skills have no upstream, so they get no update UI
 * at all rather than a "no update checks" note — an empty slot is honest,
 * a label turning every skill into a "personal skill" is not.
 */
import { type JSX } from 'react';
import type { HubConfig, SkillDetail, SourceCheckResult, SourcesResponse } from '../../protocol.ts';
import { type EditModeProps } from './EditBody.tsx';
import { type TokenTableProps } from './TokenTable.tsx';
export interface SkillDetailViewProps {
    detail: SkillDetail;
    hubConfig: HubConfig | null;
    /** skillName → usage stat (count + last used). */
    uses: ReadonlyMap<string, {
        count: number;
        lastUsed?: number;
    }>;
    sourcesState: SourcesResponse | null;
    sourceCheck: Readonly<Record<string, SourceCheckResult>>;
    checkingSource: string | null;
    syncingSource: string | null;
    /**
     * 调用方式是否可写（host 按文件位置判定：用户根/项目根可写，内置/插件
     * provider 没有可写文件）。不可写时两个 checkbox 置灰；`undefined` 表示
     * host 还是旧版本（没有这个字段），整块调用方式直接不渲染，避免把
     * 「宿主不支持」误显示成「该技能只读」。
     */
    editable?: boolean;
    /** 写入进行中（checkbox 禁用，避免连点写两次）。 */
    invocationBusy: boolean;
    /** Token 统计表（计数状态 + 可选模型，SKILL.md 正文到达后异步算）。 */
    tokenTable: TokenTableProps;
    /** 正文区：可写文件直接可改，不可写时 EditBody 退回只读 <pre>。 */
    edit: EditModeProps;
    /** 保存成功后的一行提示（例如「跟随上游，同步会覆盖」）。 */
    notice?: string;
    /** 写入调用方式（两个布尔是期望的「可调」状态，不是 frontmatter 的键值）。 */
    onInvocationChange: (modelInvocable: boolean, userInvocable: boolean) => void;
    onBack: () => void;
    /** Check one source repo for upstream updates. */
    onCheck: (repo: string) => void;
    /** Request syncing the skill (overwrites local edits; opens a confirm). */
    onSync: (repo: string, skills: string[]) => void;
    /** Request following the upstream deletion (moves into the trash). */
    onFollowDelete: (repo: string, skills: string[]) => void;
}
export declare function SkillDetailView(props: SkillDetailViewProps): JSX.Element;
//# sourceMappingURL=SkillDetailView.d.ts.map
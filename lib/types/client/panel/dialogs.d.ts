/**
 * Shared dialog family for the panel: one overlay shell plus the specific
 * dialogs (group-close conflict, sync/delete confirm, branch picker, and
 * market sync selection). Every dialog closes on outside click and keeps
 * the same role/aria shell; the panel owns all dialog state.
 */
import { type JSX, type ReactNode } from 'react';
import type { EditChoice } from './hooks/useEditFlow.ts';
/** A destructive/sync confirmation waiting for the user's decision. */
export interface ConfirmDialogState {
    kind: 'sync' | 'delete';
    repo: string;
    /** Skills the action applies to. */
    skills: string[];
}
/** Branch picker shown when a repo has no release and no pinned ref. */
export interface BranchChoiceState {
    repo: string;
    branches: string[];
    selected: string;
}
/** Version picker for a market source: releases + branches + custom ref. */
export interface VersionChoiceState {
    repo: string;
    current?: string;
    releases: string[];
    branches: string[];
    selected: string;
    custom: string;
    loading: boolean;
}
/** Post-sync skill update dialog: which tracked skills to refresh. */
export interface MarketSyncDialogState {
    repo: string;
    ref: string;
    skills: string[];
    selected: ReadonlySet<string>;
}
/**
 * Overlay + centered alert-dialog shell; outside click or Escape cancels.
 * `wide` 给带表单的对话框用（380px 放不下字段）。
 */
export declare function DialogShell(props: {
    onClose: () => void;
    children: ReactNode;
    wide?: boolean;
}): JSX.Element;
/**
 * 保存冲突：磁盘上的文件在编辑期间被改过。三个选择都由面板执行——
 * 「复制并重新加载」把草稿放进剪贴板再换最新版本，「继续编辑」什么都不做，
 * 「仍然覆盖」不带指纹再存一次。Esc / 点遮罩等同「继续编辑」（不写盘）。
 */
export declare function EditConflictDialog(props: {
    onChoose: (choice: EditChoice) => void;
}): JSX.Element;
/** Simple confirm dialog: title + text + optional skill list + cancel/confirm. */
export declare function ConfirmDialog(props: {
    title: string;
    text: string;
    /** Optional skill names listed between the text and the buttons. */
    items?: readonly string[];
    confirmLabel: string;
    /** Danger-styled confirm button (destructive actions). */
    danger?: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
/** Branch picker for a repo without releases (pins the ref, then rescans). */
export declare function BranchChoiceDialog(props: {
    choice: BranchChoiceState;
    busy: boolean;
    onSelect: (branch: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
/** Version picker: switch a market source's tracked ref (release / branch / custom). */
export declare function VersionChoiceDialog(props: {
    choice: VersionChoiceState;
    busy: boolean;
    onSelect: (ref: string) => void;
    onCustom: (custom: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
/** Post-sync selection: which tracked skills to batch-update to the new version. */
export declare function MarketSyncDialog(props: {
    dialog: MarketSyncDialogState;
    busy: boolean;
    onToggle: (name: string, checked: boolean) => void;
    onCancel: () => void;
    onConfirm: () => void;
}): JSX.Element;
//# sourceMappingURL=dialogs.d.ts.map
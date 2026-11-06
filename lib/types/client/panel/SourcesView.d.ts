/**
 * Sources tab: the flat skill list or the grouped view — a project-level
 * three-tier tree (workspaces from workspace.json, each optionally split by
 * .dsh/.agents), one group per upstream collection with check/sync/
 * follow-delete actions, plus the uncategorized "personal" group (project
 * skills never count as personal).
 *
 * Top-level groups follow the official 插件 page: a plain 14/500 section
 * heading ("用户级" / "项目级"), not a collapsible header. Only nested nodes
 * (collections, project workspaces, managed-by buckets) keep their disclosure.
 * Ordering is derived — user-level first, then collections by name, then the
 * project tree (workspaces follow the dsh sidebar) — because the hub no longer
 * offers manual reordering.
 *
 * The grouping derivation lives in useGroupView (shared with the toolbar's
 * collapse-all button, which sits next to the view switcher); this component
 * only renders it.
 */
import { type JSX } from 'react';
import type { GroupView } from './hooks/useGroupView.ts';
import type { SkillHubState } from './useSkillHub.ts';
export declare function SourcesView(props: {
    hub: SkillHubState;
    view: GroupView;
}): JSX.Element;
//# sourceMappingURL=SourcesView.d.ts.map
/**
 * The skill hub panel: catalog grouped by source collections, search and
 * filter in one row, upstream source tracking (check / sync / follow upstream
 * deletion into a restorable trash), market sources, detail inspection, and
 * the new-skill scaffold form.
 *
 * Thin shell: state and flows live in useSkillHub, the tab contents live in
 * SourcesView / MarketView, the dialog family lives in dialogs.tsx, and their
 * wiring lives in PanelDialogs.tsx. This component owns only the shared chrome
 * (header, banners, filter bar, shared sections), the view routing and the
 * scroll position across list ↔ detail; every hook runs above the detail early
 * return, so that return stays safe.
 */
import type { SkillHubApi } from '../api.ts';
export interface SkillHubPanelProps {
    api: SkillHubApi;
}
export declare function SkillHubPanel(props: SkillHubPanelProps): React.JSX.Element;
//# sourceMappingURL=SkillHubPanel.d.ts.map
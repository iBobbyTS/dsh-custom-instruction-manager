/**
 * PanelWidthControls — reusable transcript-width mechanism for the skill-hub
 * panel, adapted from dsh's official ConversationWidthControls
 * (packages/client/ui-conversation/src/client/skeleton/
 * ConversationWidthControls.tsx, MIT License, Copyright (c) 2026 DeepSeek —
 * see THIRD_PARTY_NOTICES.md).
 *
 * Differences from the original:
 *  - no factory-slot coupling: plain props (container ref + always active);
 *  - its own localStorage key, so the chat page's preference is untouched;
 *  - the wheel-forward target is our own [data-hub-scroll] scroller;
 *  - the min width is 480 (denser panel content than the chat column).
 *
 * Mechanism (mirrors the original): two invisible absolute strips flanking
 * the centered content column; pointer capture + rAF-throttled drag reports
 * outward dx * 2 (drag one side, the centered column widens on both), the
 * resolved width is published as --hub-user-width on the shell, persisted to
 * localStorage on commit, and a ResizeObserver re-publishes on window
 * resizes. A hover/drag glow bar follows the pointer's Y.
 */
import { type ReactElement } from 'react';
/**
 * Install the panel width axis and render its drag handles.
 * @param props - Mounted shell element (the scroll container's parent).
 * @returns two width handles.
 */
export declare function PanelWidthControls(props: {
    container: HTMLDivElement | null;
}): ReactElement[] | null;
//# sourceMappingURL=PanelWidthControls.d.ts.map
/**
 * One skill row: name + invocation dots + usage meta and the row menu
 * (在 Finder 中显示 / 删除). Shared by the flat list and both grouped views.
 */
import type { JSX } from 'react';
import type { CatalogSkill, HubConfig } from '../../protocol.ts';
/** The narrowed hub surface one skill row consumes. */
export interface SkillRowProps {
    skill: CatalogSkill;
    /** skillName → usage stats. */
    uses: ReadonlyMap<string, {
        count: number;
        lastUsed?: number;
    }>;
    /** Effective hub config; null while it has not loaded. */
    hubConfig: HubConfig | null;
    /** Names with an in-flight delete. */
    busyNames: ReadonlySet<string>;
    /** True while a list operation runs (also blocks row deletes). */
    listBusy: boolean;
    /** Names that collide with another skill (duplicate badge). */
    duplicateNames: ReadonlySet<string>;
    openDetail: (name: string) => Promise<void>;
    /** 打开删除确认（移入系统废纸篓）。 */
    requestDeleteSkill: (name: string) => void;
    /** 在 Finder 中显示该技能文件（cwd 用于定位项目技能）。 */
    reveal: (name: string, cwd?: string) => void;
}
export declare function SkillRow(props: SkillRowProps): JSX.Element;
//# sourceMappingURL=SkillRow.d.ts.map
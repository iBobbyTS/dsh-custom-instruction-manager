/**
 * 「关于」页：这一页自己的身份信息 —— 插件名与仓库、版本、检查更新。
 * 版本与更新检查从标题行搬到这里：标题行只留页面标题与列表级动作，
 * 版本这类一次性信息收进单独的页签，日常浏览时不再占位。
 */
import type { JSX } from 'react';
export interface AboutViewProps {
    /** 插件版本；目录还没读到时为 null。 */
    version: string | null;
    /** 更新状态的一句话（检查中 / 已是最新 / 有新版本 / 失败）；空闲时 undefined。 */
    status: string | undefined;
    /** 是否有一次更新检查正在进行。 */
    checking: boolean;
    /** 新版本发布页；仅「发现新版本」时非空。 */
    releaseUrl: string | null;
    /** 新版本号；仅「发现新版本」时非空。 */
    latestVersion: string | null;
    /** 触发一次更新检查。 */
    onCheck: () => void;
}
export declare function AboutView(props: AboutViewProps): JSX.Element;
//# sourceMappingURL=AboutView.d.ts.map
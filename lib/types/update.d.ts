/**
 * Self-update check for dsh-skill-hub
 * query GitHub's latest release and compare it to the installed version.
 *
 * This stays dependency-free: Node's global fetch is used and the version
 * comparison is a small semver-subset parser (the plugin only publishes
 * plain x.y.z tags, optionally prefixed with `v`).
 */
import type { UpdateCheckResponse } from './protocol.ts';
/** Repository checked for releases. Keep in sync with package.json. */
export declare const UPDATE_REPO = "iBobbyTS/dsh-custom-instruction-manager";
export declare const CURRENT_VERSION: string;
/** Normalize a release tag (`v1.2.3` → `1.2.3`) and parse it numerically. */
export declare function parseVersion(tag: string): [number, number, number] | null;
/** Compare two dotted version strings: negative when a < b, 0 equal, positive when a > b. */
export declare function compareVersions(a: string, b: string): number;
/** True when latest is strictly newer than current. */
export declare function isUpdateAvailable(currentVersion: string, latestVersion: string): boolean;
/** Best-effort GitHub latest-release lookup. Always resolves with ok:true. */
export declare function checkLatestRelease(repo?: string, fetchImpl?: typeof fetch): Promise<UpdateCheckResponse>;
//# sourceMappingURL=update.d.ts.map
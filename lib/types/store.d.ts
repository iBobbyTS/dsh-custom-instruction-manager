/**
 * Hub sidecar store: the user's organization/tracking records. It persists
 * upstream source records (repo + commit snapshot for update checks), the
 * market source list, the trash (skills removed after upstream deletion), and
 * usage/market stats snapshots.
 *
 * State file: $DSH_HOME/plugin/data/custom-instruction-manager/state.json — a
 * small JSON document written atomically (tmp file + rename).
 *
 * 按职责拆分后的重导出入口：老 `from './store.ts'` 写法保持可用，
 * 新代码可按需直引 `from './store/<module>.ts'`。
 */
export { PLUGIN_DATA_SLUG, STORE_VERSION, agentsHome, dshHome, legacyStatePath, legacyTokenizerDir, pluginDataDir, statePath, tokenizerCacheDir, type StoreFile, } from './store/paths.ts';
export { StoreError } from './store/errors.ts';
export { migrateStore, hydrateMigratedState, type MigratedStore, type HydratedState } from './store/migrate.ts';
export { SkillHubStore } from './store/store.ts';
//# sourceMappingURL=store.d.ts.map
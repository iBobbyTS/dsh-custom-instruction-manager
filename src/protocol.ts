/**
 * Shared API contract for dsh-skill-hub: the route paths and payload shapes
 * both the host half and the browser half import. The browser half must never
 * depend on host SDK packages, so registry types are re-spelled here as
 * plain JSON-safe interfaces.
 *
 * 按域拆分后的重导出入口：老 `from './protocol.ts'` 写法保持可用，
 * 新代码可按需直引 `from './protocol/<domain>.ts'`。
 */

export { SKILL_HUB_API, SKILL_HUB_API_ROOT } from './protocol/api.ts'
export type {
  WritableRoot,
  HubInvocation,
  CatalogSkill,
  DisabledSkill,
  DiagnosticEntry,
  DiagnosticFixRequest,
  DiagnosticFixResponse,
  CatalogResponse,
  SkillDetail,
  SkillDetailResponse,
  SkillDeleteRequest,
  SkillDeleteResponse,
  SkillRevealRequest,
  SkillRevealResponse,
  SkillInvocationRequest,
  SkillInvocationResponse,
  ToggleRequest,
  ToggleResponse,
  ToggleBatchRequest,
  ToggleBatchResponse,
  CreateRequest,
  CreateResponse,
} from './protocol/catalog.ts'
export type { SkillStat, StatsResponse, SkillStatsCheckpoint } from './protocol/stats.ts'
export type { ErrorResponse, HubConfig, HubSettingsValue, RedactedHubConfig, ConfigResponse, ConfigRequest } from './protocol/config.ts'
export { HUB_CONFIG_DEFAULTS, HUB_ENTRY_ID, HEX_COLOR_RE, GITHUB_TOKEN_RE, resolveExcludeDirs, resolveHubConfig, redactGithubToken } from './protocol/config.ts'
export type { InstructionFileRef, InstructionGroup, AgentsResponse, InstructionFileDetail, InstructionFileResponse } from './protocol/instructions.ts'
export { TOKEN_COUNT_MAX_BYTES, TOKEN_MODELS } from './protocol/tokens.ts'
export type { TokenModelSpec, TokenCountRequest, TokenCountEntry, TokenCountResponse } from './protocol/tokens.ts'
export type {
  MarketSourceRecord,
  MarketSourcesResponse,
  MarketSourceRequest,
  MarketSourceAddResponse,
  MarketSourceResponse,
  MarketSourceRefRequest,
  MarketSourceVersionsResponse,
  MarketStatsSnapshot,
  MarketStatsResponse,
  MarketCheckResponse,
  MarketSyncResponse,
} from './protocol/market.ts'
export type {
  RepoSkillEntry,
  RepoRoot,
  RepoDiscoverResponse,
  RepoImportRequest,
  RepoImportResponse,
  RepoImportProgressResponse,
  RepoImportCancelRequest,
  RepoImportCancelResponse,
  UpdateCheckResponse,
} from './protocol/repo.ts'
export type {
  CollectionGroup,
  GroupsResponse,
} from './protocol/groups.ts'
export type {
  SourceRecord,
  TrashEntry,
  SourcesResponse,
  SourceCheckRequest,
  SourceCheckResult,
  SourceCheckResponse,
  SourceSyncRequest,
  SourceSyncResponse,
  SourceDeleteRequest,
  SourceDeleteResponse,
  SourceRestoreRequest,
  SourceRestoreResponse,
  SourceTrashClearResponse,
} from './protocol/sources.ts'
export { isProjectSource } from './protocol/sources.ts'

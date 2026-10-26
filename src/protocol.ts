/**
 * Shared API contract for dsh-skill-hub: the route paths and payload shapes
 * both the host half and the browser half import. The browser half must never
 * depend on host SDK packages, so registry types are re-spelled here as
 * plain JSON-safe interfaces.
 *
 * 按域拆分后的重导出入口：老 `from './protocol.ts'` 写法保持可用，
 * 新代码可按需直引 `from './protocol/<domain>.ts'`。
 */

export { MAX_EDIT_BODY_BYTES, SKILL_HUB_API, SKILL_HUB_API_ROOT } from './protocol/api.ts'
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
  EditSnapshot,
  EditConflictResponse,
  SkillContentRequest,
  SkillContentResponse,
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
export type {
  InstructionFileRef,
  InstructionGroup,
  AgentsResponse,
  InstructionFileDetail,
  InstructionFileResponse,
  InstructionFileSaveRequest,
  InstructionFileSaveResponse,
  InstructionFileSaveFailure,
} from './protocol/instructions.ts'
export { DEFAULT_TOKEN_MODEL_IDS, TOKEN_COUNT_MAX_BYTES, TOKEN_MODELS, resolveTokenSelection } from './protocol/tokens.ts'
export type {
  TokenModelSpec,
  TokenModelState,
  TokenModelsResponse,
  TokenSelectRequest,
  TokenSelectResponse,
  TokenCountRequest,
  TokenCountEntry,
  TokenCountResponse,
} from './protocol/tokens.ts'
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

/**
 * Root path of the skill-hub API family. The host also registers this as its
 * 404 catch-all prefix, so a mistyped path answers with a plain 404 naming the
 * path instead of falling through to the SPA fallback (which answers 401 and
 * reads like an auth problem).
 */
export const SKILL_HUB_API_ROOT = '/api/skill-hub'

/**
 * 编辑保存路由的请求体上限。正文本身可能远超默认的 64 KB（指令文件允许
 * 显示到 1 MB，JSON 转义后还会再涨一点），所以保存路由单独抬到 8 MB：
 * 超限按 400 拒绝，绝不截断后落盘。
 */
export const MAX_EDIT_BODY_BYTES = 8 * 1024 * 1024

/**
 * Browser-facing base paths of the skill-hub API family.
 *
 * Naming rule: a path's segments mirror its scope. Market sources own the
 * `/market/source/*` subtree — add, delete, ref, versions, check, sync — so
 * the update check and the sync that acts on its result sit side by side.
 */
export const SKILL_HUB_API = {
  catalog: '/api/skill-hub/catalog',
  agents: '/api/skill-hub/agents',
  agentsFile: '/api/skill-hub/agents/file',
  agentsFileSave: '/api/skill-hub/agents/file/save',
  skillContent: '/api/skill-hub/skill/content',
  tokens: '/api/skill-hub/tokens',
  tokensModels: '/api/skill-hub/tokens/models',
  tokensSelect: '/api/skill-hub/tokens/select',
  skill: '/api/skill-hub/skill',
  skillDelete: '/api/skill-hub/skill/delete',
  skillReveal: '/api/skill-hub/skill/reveal',
  skillInvocation: '/api/skill-hub/skill/invocation',
  toggle: '/api/skill-hub/toggle',
  toggleBatch: '/api/skill-hub/toggle-batch',
  create: '/api/skill-hub/create',
  stats: '/api/skill-hub/stats',
  config: '/api/skill-hub/config',
  market: '/api/skill-hub/market',
  marketSource: '/api/skill-hub/market/source',
  marketSourceDelete: '/api/skill-hub/market/source/delete',
  marketSourceRef: '/api/skill-hub/market/source/ref',
  marketCheck: '/api/skill-hub/market/source/check',
  marketSync: '/api/skill-hub/market/source/sync',
  repo: '/api/skill-hub/repo',
  repoImport: '/api/skill-hub/repo/import',
  repoImportProgress: '/api/skill-hub/repo/import/progress',
  repoImportCancel: '/api/skill-hub/repo/import/cancel',
  update: '/api/skill-hub/update',
  groups: '/api/skill-hub/groups',
  sources: '/api/skill-hub/sources',
  sourceCheck: '/api/skill-hub/sources/check',
  sourceSync: '/api/skill-hub/sources/sync',
  sourceDelete: '/api/skill-hub/sources/delete',
  sourceRestore: '/api/skill-hub/sources/restore',
  sourceTrashClear: '/api/skill-hub/sources/trash/clear',
  diagnosticFix: '/api/skill-hub/diagnostic/fix',
  marketSourceVersions: '/api/skill-hub/market/source/versions',
  marketStats: '/api/skill-hub/market/stats',
} as const

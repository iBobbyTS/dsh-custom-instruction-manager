import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DisabledSkill, HubConfig, MarketSourceRecord, MarketStatsSnapshot, SkillStatsCheckpoint, SourceRecord, TrashEntry } from '../protocol.ts'

/** Wire shape persisted on disk. */
export interface StoreFile {
  version: number
  disabled: DisabledSkill[]
  /** Runtime configuration edited from the web settings card (hub-owned, not settings-service). */
  config?: Partial<HubConfig>
  /** Upstream source tracking records (repo + commit snapshot). */
  sources?: SourceRecord[]
  /** User-added market sources (owner/repo slugs + optional pinned ref). */
  marketSources?: MarketSourceRecord[]
  /** Trashed skills (removed after upstream deletion, restorable). */
  trash?: TrashEntry[]
  /** Usage-statistics incremental-scan checkpoint (frozen watermark + totals). */
  skillStats?: SkillStatsCheckpoint
  /** Market-stats snapshot (stars/downloads per repo, hourly TTL). */
  marketStats?: MarketStatsSnapshot
}

/** Resolve the DSH home directory (the filesystem provider's user-dsh root base). */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Resolve the shared agents root (`DSH_AGENTS_HOME`, else `~/.agents`). */
export function agentsHome(): string {
  return process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')
}

/**
 * 插件自有数据的目录名（`$DSH_HOME/plugin/data/<slug>`）。
 *
 * 用仓库新名字而不是包名：这台机器上这个目录是用户按仓库名建的，卸载插件
 * 后 dsh 不会清它——数据和插件包解耦，重装（哪怕换包名）能接着读。
 */
export const PLUGIN_DATA_SLUG = 'custom-instruction-manager'

/** 插件数据根目录：记录文件与词表缓存都在这下面。 */
export function pluginDataDir(home = dshHome()): string {
  return join(home, 'plugin', 'data', PLUGIN_DATA_SLUG)
}

/** 记录文件路径（技能开关、来源、市场源、回收站、统计快照）。 */
export function statePath(home = dshHome()): string {
  return join(pluginDataDir(home), 'state.json')
}

/** 旧记录文件位置（0.3.x）：`$DSH_HOME/dsh-skill-hub.json`。启动时迁走。 */
export function legacyStatePath(home = dshHome()): string {
  return join(home, 'dsh-skill-hub.json')
}

/** 词表缓存目录（每个模型一份 tokenizer.json）。 */
export function tokenizerCacheDir(home = dshHome()): string {
  return join(pluginDataDir(home), 'tokenizer')
}

/** 旧词表缓存位置（0.3.26）：`$DSH_HOME/skill-hub/tokenizers`。启动时迁走。 */
export function legacyTokenizerDir(home = dshHome()): string {
  return join(home, 'skill-hub', 'tokenizers')
}

/** Current sidecar schema version. Bump on breaking shape changes and add a migration below. */
export const STORE_VERSION = 5

/**
 * dsh-skill-hub — host half. Mounts the /api/skill-hub route family (full
 * skill catalog from the official ctx.skills registry, skill detail,
 * new-skill scaffold, market/source management). The browser half (./client)
 * renders the sidebar entry and the skill hub panel. Everything rides
 * official NPM SDK packages — no dsh source changes.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'
import type { SettingsForms, SettingsNamespace, SettingsPathOp } from '@deepseek-ai/dsh-settings'
// dsh's own fork, NOT the plain `schemastery` package: `.volatile()` (and the
// loader's `fiber.runtime.Config` handling) only exist here. Every official
// plugin imports it under this name.
import z from '@deepseek-ai/schemastery'
// Type-only, for the `ctx.connection` augmentation (the `/api` trust fence).
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-settings'
import { HUB_CONFIG_DEFAULTS, HUB_ENTRY_ID, HEX_COLOR_RE, resolveHubConfig, type HubConfig } from './protocol.ts'
import { hydrateAgentsRoster } from './agents-index.ts'
import { createMcpAccess } from './mcp-runtime.ts'
import { SkillHubProvider } from './provider.ts'
import { hostTrustFence, makeRoutes, type SkillHubRouteDeps } from './routes.ts'
import { createSkillStatsReader, asPersistenceSeam, type SessionPersistenceLike, type SessionQueryLike, type SkillStatsReader } from './stats.ts'
import { migrateLegacyData } from './data-migrate.ts'
import { SkillHubStore } from './store.ts'
import { cleanupLeftoverImportDirs, setGithubToken } from './repo.ts'
import { dshHome } from './store.ts'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'skill-hub'

/** Services required before the skill-hub surfaces can mount. `settings` is deliberately NOT here: the plugin reads its own volatile config refs and only reaches for the settings service when it is present (issue #11). */
export const inject = ['webServer', 'skills']

/**
 * Plugin config, validated by the same-named schemastery schema.
 *
 * dsh 0.1.7 replaced the "plugin registers a settings namespace" model with
 * "the Loader entry's Config IS the settings namespace", so this one schema is
 * both the composition config and the settings page. Every field is volatile:
 * the Loader re-resolves volatile values in place and re-enters apply()
 * instead of rebuilding the fiber, and only volatile fields are writable
 * through the settings transport.
 */
export interface Config {
  /** Master switch for the plugin (routes, provider). */
  enabled: Volatile<boolean>
  /** Show per-skill invocation count chip. Default true. */
  showUseCount: Volatile<boolean>
  /** Show per-skill last-used relative time. Default true. */
  showUseTime: Volatile<boolean>
  /** Show group-header usage summaries (count + last used). Default true. */
  showGroupSummary: Volatile<boolean>
  /** 模型可调圆点颜色（#rrggbb）；缺省用面板默认色。 */
  dotModelColor: Volatile<string | undefined>
  /** 用户可调圆点颜色（#rrggbb）；缺省用面板默认色。 */
  dotUserColor: Volatile<string | undefined>
  /** GitHub token；`role('secret')` 让 settings 层统一脱敏，缺省为匿名。 */
  githubToken: Volatile<string | undefined>
  /** 统计滚动窗口天数：只统计最近 N 天的使用；0 = 全部历史。 */
  statsWindowDays: Volatile<number>
  /** 自动统计扫描间隔（分钟，最小 1）。 */
  statsScanMinutes: Volatile<number>
  /** AGENTS.md 页扫描项目时跳过的目录名（默认 `.agent-work`）。 */
  excludeDirs: Volatile<string[]>
}

/**
 * The durable field schemas, plain (non-volatile) so the same definitions can
 * back both the live view below and the wire form the settings page renders
 * from `.toJSON()`. `description` is what the auto-generated page shows with
 * each row; `role('secret')` makes the settings layer redact the value on
 * every wire read.
 */
const ConfigFields = {
  enabled: z.boolean().default(HUB_CONFIG_DEFAULTS.enabled).description('关闭后技能中枢的路由与入口全部下线。'),
  dotModelColor: z.string().pattern(HEX_COLOR_RE).description('技能行与聊天「/」菜单中「模型可调」圆点的颜色（#rrggbb）。'),
  dotUserColor: z.string().pattern(HEX_COLOR_RE).description('技能行与聊天「/」菜单中「仅用户可调」圆点的颜色（#rrggbb）。'),
  showUseCount: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseCount).description('在技能名旁显示调用次数。'),
  showUseTime: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseTime).description('在技能名行显示最近调用时间。'),
  showGroupSummary: z.boolean().default(HUB_CONFIG_DEFAULTS.showGroupSummary).description('在分组标题后汇总调用次数与最近调用时间。'),
  statsWindowDays: z.number().min(0).max(3650).default(HUB_CONFIG_DEFAULTS.statsWindowDays).description('只统计最近 N 天的使用次数；0 = 全部历史。'),
  statsScanMinutes: z.number().min(1).max(1440).default(HUB_CONFIG_DEFAULTS.statsScanMinutes).description('后台扫描会话日志的间隔（分钟，最小 1）。'),
  excludeDirs: z.array(z.string()).default([...HUB_CONFIG_DEFAULTS.excludeDirs]).description('AGENTS.md 页扫描项目时跳过的目录名（任意层级）；默认跳过 .agent-work。'),
  githubToken: z.string().role('secret').description('市场/来源走 GitHub API：匿名每小时 60 次，填 token 后 5000 次。留空即匿名（或跟随 GITHUB_TOKEN 环境变量）。'),
}

/**
 * The live plugin config the settings page edits. Field order here is the row
 * order the auto-generated page renders.
 */
export const Config = z.object({
  enabled: ConfigFields.enabled.volatile(),
  dotModelColor: ConfigFields.dotModelColor.volatile(),
  dotUserColor: ConfigFields.dotUserColor.volatile(),
  showUseCount: ConfigFields.showUseCount.volatile(),
  showUseTime: ConfigFields.showUseTime.volatile(),
  showGroupSummary: ConfigFields.showGroupSummary.volatile(),
  statsWindowDays: ConfigFields.statsWindowDays.volatile(),
  statsScanMinutes: ConfigFields.statsScanMinutes.volatile(),
  excludeDirs: ConfigFields.excludeDirs.volatile(),
  githubToken: ConfigFields.githubToken.volatile(),
})

/**
 * The settings namespace this plugin's config lives under, narrowed to the
 * settings package's branded type. The browser half resolves the same form
 * through `ctx.configForms.get(HUB_ENTRY_ID)`.
 */
export const ENTRY_ID = HUB_ENTRY_ID as SettingsNamespace

/** Every config field, in the order the settings page renders them (used to walk the volatile refs). */
const CONFIG_FIELDS = [
  'enabled',
  'dotModelColor',
  'dotUserColor',
  'showUseCount',
  'showUseTime',
  'showGroupSummary',
  'statsWindowDays',
  'statsScanMinutes',
  'excludeDirs',
  'githubToken',
] as const

/**
 * Mount the skill hub routes.
 * @param ctx - host plugin context carrying webServer/skills/settings.
 */
export function apply(ctx: Context, config?: Config): void {
  /**
   * Read the runtime config out of our own volatile config refs.
   *
   * This is the whole point of `volatile()`: the Loader updates those values
   * **in place** (`ConfigEditor.edit` → `resolveConfig(fiber.runtime, next)` →
   * `updateVolatile`) without rebuilding the fiber, so a held reference always
   * answers `.get()` with the current value. Consequences worth remembering:
   *   - no `settings.describe()` per request (it walks and projects every entry
   *     in the profile — the reason this used to be slow);
   *   - no subscription or watcher is needed for *reading*;
   *   - the plugin keeps working when the Settings service is absent
   *     (issue #11: business logic must not depend on Settings).
   */
  const readConfig = (): Partial<HubConfig> => {
    const out: Record<string, unknown> = {}
    for (const field of CONFIG_FIELDS) {
      const ref = (config as unknown as Record<string, { get?: () => unknown } | undefined> | undefined)?.[field]
      const value = ref !== undefined && typeof ref.get === 'function' ? ref.get() : ref
      if (value !== undefined) out[field] = value
    }
    return out as Partial<HubConfig>
  }
  const current = (): HubConfig => resolveHubConfig(readConfig())

  /** The Settings service, when this deployment mounts it. Absent ⇒ no user layer to read or write. */
  const settingsOf = (): SettingsForms | undefined => ctx.get('settings') as SettingsForms | undefined

  // 0.3.x 的数据散在 $DSH_HOME 根下（dsh-skill-hub.json 与 skill-hub/tokenizers），
  // 现在统一收进 $DSH_HOME/plugin/data/custom-instruction-manager。同步搬完再建
  // store：记录文件是懒加载的，异步搬会留出「先读到空状态」的窗口。日志在
  // logInfo/logWarn 定义之后补打（apply 全程同步，中间没有别的代码能读 store）。
  const migration = migrateLegacyData()
  const store = new SkillHubStore()
  let disposeRoutes: (() => void) | undefined
  // The hub's own provider contributes user/project skills to the registry's
  // GLOBAL layer — the web app deliberately keeps that layer empty (presets
  // own per-scope discovery), and the GUI needs a session-independent view.
  let disposeProvider: (() => void) | undefined
  let providerControl: SkillProviderControl | undefined
  // Optional invocation-count source; only set once a session-query service
  // is present (see the soft inject below). Absent deployments just omit the
  // stats route's data rather than failing to load.
  let stats: SkillStatsReader | undefined

  // The raw saved config layer (fields the user explicitly overrode); the
  // config route reports it so callers can mark overridden fields. Empty when
  // the deployment has no Settings service — the plugin still runs.
  const saved = (): Partial<HubConfig> => {
    const descriptor = settingsOf()?.describe().find((entry) => entry.ns === ENTRY_ID)
    return (descriptor?.user as Partial<HubConfig> | undefined) ?? {}
  }

  // Persist a config patch through the settings transport. A patch value of
  // undefined clears the saved override — expressed as a path `unset`, which
  // makes the field fall back to its inherited value instead of writing a
  // literal undefined (the old sidecar's reset semantics). The write reloads
  // this Loader entry, so apply() re-runs and re-syncs every surface below.
  const updateConfig = async (patch: Partial<HubConfig>): Promise<HubConfig> => {
    const ops: SettingsPathOp[] = []
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) ops.push({ op: 'unset', path: [field] })
      else ops.push({ op: 'set', path: [field], value })
    }
    const settings = settingsOf()
    if (settings === undefined) throw new Error('this deployment does not mount the settings service; config is read-only')
    if (ops.length > 0) {
      await settings.mutate(ENTRY_ID, ops)
      // A settings write updates this entry's values in place WITHOUT
      // re-entering apply() (see `current`), so the provider / routes
      // registered from the old values would otherwise keep serving them until
      // a restart. Re-evaluate here, where we know the write landed.
      sync()
    }
    return current()
  }

  // Register (or drop) every surface to match the current config. Each
  // group is kept under one disposer: re-registering first tears the old
  // one down so duplicate-name registrations never throw. The route family
  // (including the config route) stays mounted even with the master switch
  // off so the settings card can always read and re-enable the hub; the
  // business routes answer 503 while disabled.
  /**
   * Whether this plugin's fiber is still mounted.
   *
   * Async work started from `apply()` — the stats wiring and the persistence
   * probe — can settle after the fiber unloaded: a config rewrite reloads the
   * plugin, and disable/enable tears it down. Service reads on an inactive
   * context throw instead of returning undefined, so every continuation
   * re-checks this before touching `ctx` (issue #19: a cold-start abort with
   * `cannot get required service "webServer" in inactive context`).
   *
   * The generation counters cannot cover this: they only invalidate a build
   * superseded by a *newer* build, and teardown does not bump them.
   */
  const mounted = (): boolean => {
    // `fiber` has always been public on a Cordis context, but stay tolerant of
    // a host whose Cordis predates it: absent means "we cannot tell", and the
    // pre-#19 behaviour is the safer answer there.
    const fiber = (ctx as { fiber?: { uid: number | null } }).fiber
    return fiber === undefined || fiber.uid !== null
  }

  /** Logger for continuations that may outlive the fiber (#19). */
  const logInfo = (message: string): void => {
    if (mounted()) ctx.logger.info(message)
  }
  const logWarn = (message: string, error?: unknown): void => {
    if (!mounted()) return
    if (error === undefined) ctx.logger.warn(message)
    else ctx.logger.warn(message, error)
  }

  if (migration.state === 'moved' || migration.tokenizers === 'moved') {
    logInfo(`[dsh-skill-hub] moved legacy data into ${migration.dir} (state: ${migration.state}, tokenizers: ${migration.tokenizers})`)
  }
  if (migration.error !== undefined) {
    logWarn('[dsh-skill-hub] legacy data migration failed; the old files stay where they are', migration.error)
  }

  const sync = (): void => {
    // A late stats continuation may still reach here after teardown (#19).
    if (!mounted()) return
    if (disposeProvider !== undefined) {
      disposeProvider()
      disposeProvider = undefined
    }
    const value = current()
    // GitHub auth for market/source API calls: env GITHUB_TOKEN/GH_TOKEN is the
    // fallback (read at module load); an explicit settings value wins and is
    // applied by re-running this sync from updateConfig after the write lands.
    setGithubToken(value.githubToken)
    if (value.enabled) {
      // registerProvider returns the exact cordis effect disposer: the fiber
      // unregisters the provider and invalidates catalog caches on teardown.
      providerControl = undefined
      disposeProvider = ctx.effect(
        () => ctx.skills.registerProvider((control) => {
          providerControl = control
          return new SkillHubProvider(control)
        }),
        'dsh-skill-hub: provider',
      )
    }
    ctx.logger.info(`[dsh-skill-hub] surfaces synced: enabled=${value.enabled}`)
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    disposeRoutes = ctx.effect(
      () => {
        const deps: SkillHubRouteDeps = {
          skills: ctx.skills,
          store,
          // The host's own `/api` trust fence (loopback ∪ bind address ∪
          // --trusted-host ∪ browser session). Read per request: Connection
          // may be provided after this plugin starts, and a one-shot read here
          // would latch the literal-loopback fallback for the whole process.
          // A *persistent* absence means the upstream composition changed —
          // say so once instead of silently re-creating issue #17.
          fence: hostTrustFence(
            () => ctx.get('connection'),
            () => ctx.logger.warn('[dsh-skill-hub] Connection service absent: routes fall back to literal-loopback; reverse-proxy deployments will 403 until it mounts'),
          ),
          invalidate: () => { providerControl?.invalidate() },
          // MCP 域：只读 dsh 的 pluginManager / loader / tools 服务，缺服务时页面
          // 降级（不阻塞本插件其余部分）。每次请求现读，服务晚挂载也能自愈。
          mcp: createMcpAccess((name) => (ctx as unknown as { get(key: string): unknown }).get(name)),
          stats,
          config: current,
          saved,
          updateConfig,
        }
        // 插件加载（含每次打开 dsh）先把上一份 AGENTS.md 索引读进内存：面板
        // 打开页面可以立即铺出来，随后的分步重扫再刷新它。读盘失败就是没有
        // 缓存，页面照常从第一轮扫描开始。
        void hydrateAgentsRoster(deps)
        const disposers = makeRoutes(deps).map((route) => ctx.webServer.register(route))
        return () => {
          for (const dispose of disposers) dispose()
        }
      },
      'dsh-skill-hub: routes',
    )
  }

  // Initial registration from the composition entry. Later changes — the
  // settings page, the config route, the Host document editor — rewrite this
  // Loader entry, which re-enters apply(), so no in-process watcher is needed.
  sync()

  // One-time migration: an install upgraded from the sidecar-configured
  // build seeds the settings namespace from the saved sidecar config when the
  // namespace has no user section yet. Later edits live only in the settings
  // document; the sidecar keeps its (now-stale) copy untouched.
  // Startup: 清理 Issue #3 遗留的 .*.import-* 临时目录（尽早回收，不阻塞）
  void (async () => {
    const home = dshHome()
    const agentsHome = process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')
    for (const root of [join(home, 'skills'), join(agentsHome, 'skills')]) {
      try {
        const c = await cleanupLeftoverImportDirs(root)
        if (c > 0) logInfo(`[dsh-skill-hub] startup cleaned ${c} leftover import temp dir(s) in ${root}`)
      } catch (error) {
        logWarn('[dsh-skill-hub] startup cleanup failed', error)
      }
    }
  })()

  void (async () => {
    try {
      const legacy = await store.getConfig()
      // The read is awaited; the plugin may have unloaded meanwhile (#19).
      if (!mounted()) return
      if (Object.keys(legacy).length > 0 && Object.keys(saved()).length === 0) {
        const settings = settingsOf()
        if (settings !== undefined) await settings.update(ENTRY_ID, legacy as Record<string, unknown>)
      }
    } catch (error) {
      logWarn('[dsh-skill-hub] sidecar config migration into the settings namespace failed', error)
    }
  })()

  // Optional trigger statistics: while a session-query service exists, wire a
  // cached invocation-count reader into the stats route. Re-running sync()
  // re-registers the routes with the reader attached (mirrors the optional
  // stats wiring — no sessionQuery service ever mounted means none of this
  // runs).
  //
  // Read-path preference: the host's sessionPersistence seam serves raw stored
  // logs (decompress + parse only — no Session restore/validation, the host
  // cost that OOMed large histories, see issue #7), with the query seam
  // covering live sessions. Without a persistence service the reader falls
  // back to sequential query reads. Scans are strictly lazy: the first one
  // starts on the panel's first /stats poll, never at plugin startup (a
  // headless boot with no browser must not pay for statistics nobody reads).
  //
  // Mount ordering between the two host services is not guaranteed, so the
  // reader is (re-)built generation-guarded: a query-only reader wires
  // immediately, and a later-arriving persistence service upgrades it to the
  // cold path. A superseded build never assigns.
  let statsQuery: SessionQueryLike | undefined
  let statsPersistence: SessionPersistenceLike | undefined
  let statsGeneration = 0
  const wireStats = (): void => {
    const query = statsQuery
    if (query === undefined) return
    const generation = ++statsGeneration
    const cold = statsPersistence
    void (async () => {
      // 恢复 sidecar 里的增量扫描检查点后再建 reader（异步、不阻塞）：
      // 重启后无需重新解压全部历史日志；每次扫描完都落盘（含上次总数），所以
      // 重启后面板秒出旧数、后台重扫。扫描间隔与滚动窗口都从设置命名空间
      // 实时读取——卡片里改完即生效，无需重启。
      const checkpoint = await store.getSkillStatsState().catch(() => undefined)
      if (generation !== statsGeneration || !mounted()) return
      const scanMinutes = (): number => {
        const value = current().statsScanMinutes
        return typeof value === 'number' && value >= 1 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsScanMinutes
      }
      const windowDays = (): number => {
        const value = current().statsWindowDays
        return typeof value === 'number' && value >= 0 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsWindowDays
      }
      const reader = createSkillStatsReader(query, () => scanMinutes() * 60_000, {
        checkpoint,
        windowDays,
        ...(cold === undefined ? {} : {
          persistence: cold,
          listLiveIds: async () => {
            try {
              const records = await query.listSessions()
              return records.filter((record) => (record as { live?: unknown }).live === true).map((record) => record.header.id)
            } catch {
              return []
            }
          },
          readLiveSession: async (id) => {
            try {
              return { events: (await query.readSession(id)).events }
            } catch {
              return undefined
            }
          },
        }),
        onCheckpoint: (next) => {
          void store.saveSkillStatsState(next).catch((error) => {
            if (mounted()) ctx.logger.warn('[dsh-skill-hub] persisting skill-stats checkpoint failed', error)
          })
        },
      })
      if (generation !== statsGeneration || !mounted()) return
      ctx.logger.info(`[dsh-skill-hub] stats seam: ${cold === undefined ? 'session-query (fallback)' : 'session-persistence (cold)'}`)
      stats = reader
      sync()
    })()
  }
  ctx.inject(['sessionQuery'], (sctx) => {
    statsQuery = sctx.sessionQuery
    wireStats()
    // The persistence service may mount after the query service: upgrade the
    // reader when it arrives (no-op when it never does).
    sctx.inject(['sessionPersistence'] as unknown as ['sessionQuery'], (pctx) => {
      void (async () => {
        const raw = (pctx as unknown as { sessionPersistence?: unknown }).sessionPersistence
        const seam = asPersistenceSeam(raw)
        if (seam === undefined) {
          if (mounted()) ctx.logger.warn('[dsh-skill-hub] sessionPersistence shape mismatch, staying on query fallback')
          return
        }
        try {
          await seam.list() // probe: headers only, must succeed before trusting the cold path
        } catch (error) {
          if (mounted()) ctx.logger.warn('[dsh-skill-hub] persistence seam probe failed, staying on query fallback', error)
          return
        }
        // The probe is awaited, so the plugin may have unloaded meanwhile (#19).
        if (!mounted()) return
        statsPersistence = seam
        wireStats()
      })()
    })
  })
}

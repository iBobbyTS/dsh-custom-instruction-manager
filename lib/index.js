import { createRequire } from "node:module";
import z from "@deepseek-ai/schemastery";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { isSkillName } from "@deepseek-ai/dsh-skill";
import { execFile } from "node:child_process";
import { isDeepStrictEqual, promisify } from "node:util";
import yaml, { dump, load } from "js-yaml";
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync } from "node:fs";
import { Tokenizer } from "@huggingface/tokenizers";
// src/protocol/api.ts
/**
* Root path of the skill-hub API family. The host also registers this as its
* 404 catch-all prefix, so a mistyped path answers with a plain 404 naming the
* path instead of falling through to the SPA fallback (which answers 401 and
* reads like an auth problem).
*/
const SKILL_HUB_API_ROOT = "/api/skill-hub";
/**
* 编辑保存路由的请求体上限。正文本身可能远超默认的 64 KB（指令文件允许
* 显示到 1 MB，JSON 转义后还会再涨一点），所以保存路由单独抬到 8 MB：
* 超限按 400 拒绝，绝不截断后落盘。
*/
const MAX_EDIT_BODY_BYTES = 8388608;
/**
* Browser-facing base paths of the skill-hub API family.
*
* Naming rule: a path's segments mirror its scope. Market sources own the
* `/market/source/*` subtree — add, delete, ref, versions, check, sync — so
* the update check and the sync that acts on its result sit side by side.
*/
const SKILL_HUB_API = {
	catalog: "/api/skill-hub/catalog",
	mcp: "/api/skill-hub/mcp",
	mcpToggle: "/api/skill-hub/mcp/toggle",
	mcpSave: "/api/skill-hub/mcp/save",
	mcpRemove: "/api/skill-hub/mcp/remove",
	agents: "/api/skill-hub/agents",
	agentsScan: "/api/skill-hub/agents/scan",
	agentsFile: "/api/skill-hub/agents/file",
	agentsFileSave: "/api/skill-hub/agents/file/save",
	skillContent: "/api/skill-hub/skill/content",
	tokens: "/api/skill-hub/tokens",
	tokensModels: "/api/skill-hub/tokens/models",
	tokensSelect: "/api/skill-hub/tokens/select",
	skill: "/api/skill-hub/skill",
	skillDelete: "/api/skill-hub/skill/delete",
	skillReveal: "/api/skill-hub/skill/reveal",
	skillInvocation: "/api/skill-hub/skill/invocation",
	create: "/api/skill-hub/create",
	stats: "/api/skill-hub/stats",
	config: "/api/skill-hub/config",
	market: "/api/skill-hub/market",
	marketSource: "/api/skill-hub/market/source",
	marketSourceDelete: "/api/skill-hub/market/source/delete",
	marketSourceRef: "/api/skill-hub/market/source/ref",
	marketCheck: "/api/skill-hub/market/source/check",
	marketSync: "/api/skill-hub/market/source/sync",
	repo: "/api/skill-hub/repo",
	repoImport: "/api/skill-hub/repo/import",
	repoImportProgress: "/api/skill-hub/repo/import/progress",
	repoImportCancel: "/api/skill-hub/repo/import/cancel",
	update: "/api/skill-hub/update",
	groups: "/api/skill-hub/groups",
	sources: "/api/skill-hub/sources",
	sourceCheck: "/api/skill-hub/sources/check",
	sourceSync: "/api/skill-hub/sources/sync",
	sourceDelete: "/api/skill-hub/sources/delete",
	sourceRestore: "/api/skill-hub/sources/restore",
	sourceTrashClear: "/api/skill-hub/sources/trash/clear",
	diagnosticFix: "/api/skill-hub/diagnostic/fix",
	marketSourceVersions: "/api/skill-hub/market/source/versions",
	marketStats: "/api/skill-hub/market/stats"
};
// src/protocol/config.ts
/**
* This plugin's Loader entry id — the settings namespace dsh serves its config
* under. It is cordis.patch.yml's insert id, NOT the package name, and it is
* shared by contract because the browser half addresses the same form through
* `ctx.configForms.get(HUB_ENTRY_ID)` while the host half writes through
* `ctx.settings.update(HUB_ENTRY_ID, …)`.
*/
const HUB_ENTRY_ID = "skill-hub";
/**
* Hub config defaults — the single source every layer reads: the cordis
* schema (index.ts), the host's saved-override merge, and the routes'
* fallback view. Changing a default here changes all three.
*/
const HUB_CONFIG_DEFAULTS = {
	enabled: true,
	showUseCount: true,
	showUseTime: true,
	showGroupSummary: true,
	statsWindowDays: 14,
	statsScanMinutes: 5,
	/** AGENTS.md 页默认跳过的目录名；工作产物目录不属于任何项目。 */
	excludeDirs: [".agent-work"]
};
/**
* Normalize one exclude-directory list: trim, drop empties/duplicates, preserve
* order. The values are matched as directory names at any depth, so a path with
* a separator in it simply never matches — validation stays permissive here and
* the panel rejects separators at the input.
* @param value - candidate list from any config layer.
* @param fallback - list used when the value is absent (defaults).
* @returns a fresh array safe to hand to callers.
*/
function resolveExcludeDirs(value, fallback = HUB_CONFIG_DEFAULTS.excludeDirs) {
	if (!Array.isArray(value)) return [...fallback];
	const out = [];
	for (const entry of value) {
		if (typeof entry !== "string") continue;
		const name = entry.trim();
		if (name === "" || out.includes(name)) continue;
		out.push(name);
	}
	return out;
}
/**
* Fill a raw settings value into the effective hub config: schema defaults for
* anything missing, and the numeric stats knobs clamped to sane ranges
* (window ≥ 0, scan interval ≥ 1 minute).
*
* There is deliberately no "saved sidecar layer" parameter. Until dsh 0.1.7 the
* hub kept its own runtime overrides in the sidecar and merged them here; the
* settings namespace is now the only user layer (`updateConfig` writes through
* `ctx.settings.mutate`), so a merge against a sidecar layer could never
* observe anything but `{}` — see the git history of `resolveHubConfig`.
*/
function resolveHubConfig(base = {}) {
	const windowDays = clampNumber(base.statsWindowDays, 0) ?? HUB_CONFIG_DEFAULTS.statsWindowDays;
	const scanMinutes = clampNumber(base.statsScanMinutes, 1) ?? HUB_CONFIG_DEFAULTS.statsScanMinutes;
	return {
		enabled: base.enabled ?? HUB_CONFIG_DEFAULTS.enabled,
		showUseCount: base.showUseCount ?? HUB_CONFIG_DEFAULTS.showUseCount,
		showUseTime: base.showUseTime ?? HUB_CONFIG_DEFAULTS.showUseTime,
		showGroupSummary: base.showGroupSummary ?? HUB_CONFIG_DEFAULTS.showGroupSummary,
		statsWindowDays: windowDays,
		statsScanMinutes: scanMinutes,
		excludeDirs: resolveExcludeDirs(base.excludeDirs),
		...base.dotModelColor !== void 0 ? { dotModelColor: base.dotModelColor } : {},
		...base.dotUserColor !== void 0 ? { dotUserColor: base.dotUserColor } : {},
		...base.githubToken !== void 0 ? { githubToken: base.githubToken } : {}
	};
}
/** Clamp a numeric override into a valid value; undefined/invalid stays undefined. */
function clampNumber(value, min) {
	if (typeof value !== "number" || !Number.isFinite(value) || value < min) return void 0;
	return Math.floor(value);
}
/**
* Drop the GitHub token from a config-shaped object. Returns a copy, so the
* caller's own config layer keeps the token. Shared by the config route's GET
* and POST responses — neither may echo it back.
*/
function redactGithubToken(value) {
	const copy = { ...value };
	delete copy.githubToken;
	return copy;
}
/** HEX color validation shared by host routes and the settings card. */
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
/** GitHub token validation shared by host routes and the settings card. */
const GITHUB_TOKEN_RE = /^[A-Za-z0-9_\-]{8,255}$/;
// src/protocol/tokens.ts
/**
* 参与计数的模型（本步固定两个）。
*
* 数字来自真 tokenizer，不是字符数/字节数估算。DeepSeek 用官方
* DeepSeek-V4.1-Flash 词表，GLM 用 zai-org/GLM-5.3 词表，两者都是
* `tokenizer.json`（BPE），宿主用 @huggingface/tokenizers 解码运行，
* 与 Rust 版 tokenizers 的结果逐位一致。
*/
const TOKEN_MODELS = [
	{
		id: "deepseek-v4.1-flash",
		label: "DeepSeek V4.1 Flash",
		repo: "deepseek-ai/DeepSeek-V4.1-Flash",
		revision: "314113f8a7dadb388215396ba5fbee2c610a04d6",
		preset: true,
		vocabMb: 6
	},
	{
		id: "glm-5.3",
		label: "GLM-5.3",
		repo: "zai-org/GLM-5.3",
		revision: "ba32f8c19c8738e2c57c71798c601d477a7bf844",
		preset: true,
		vocabMb: 19
	},
	{
		id: "kimi-k3",
		label: "Kimi K3",
		repo: "Xenova/Kimi-K3-tokenizer",
		revision: "4537b5bc42f0bd74b4409517ca647e8d723f4d0f",
		preset: false,
		vocabMb: 19
	}
];
/** 首次使用时的选中集合（协议层定义，host 与面板看到的是同一份）。 */
const DEFAULT_TOKEN_MODEL_IDS = TOKEN_MODELS.filter((model) => model.preset).map((model) => model.id);
/**
* 把保存的选中集合规整成可用集合。
*
* 没有保存过（`undefined`）= 默认集合；保存过就**以保存的为准**，包括空数组
* （用户把三个都取消就是这个状态，不能回落到默认）。未知 id 丢掉（模型下线
* 的残留），顺序始终按 TOKEN_MODELS，避免面板列顺序随点击顺序漂移。
*
* @param saved - 持久化的 id 列表；`undefined` 表示从未保存。
* @returns 规整后的 id 列表。
*/
function resolveTokenSelection(saved) {
	if (saved === void 0) return [...DEFAULT_TOKEN_MODEL_IDS];
	const wanted = new Set(saved);
	return TOKEN_MODELS.filter((model) => wanted.has(model.id)).map((model) => model.id);
}
/**
* 一次计数受理的正文上限（8 MB，字节）。
*
* 典型的 AGENTS.md / SKILL.md 是几 KB 到几十 KB；上限只用来挡住「把整个
* 仓库塞进一次请求」这类误用，不参与常规路径。超限按 400 拒绝，而不是
* 静默截断——截断后的 token 数会是错的，错数字比报错更糟。
*/
const TOKEN_COUNT_MAX_BYTES = 8388608;
// src/protocol/sources.ts
/** 项目级技能来源（它们有 workspace 归属，不属于「个人」组）。 */
function isProjectSource(source) {
	return source === "project-dsh" || source === "project-agents";
}
// src/skillfs/write.ts
/**
* 用户文件的读写原语：一次读到「正文 + 磁盘元数据」的快照，以及原子写回。
*
* 编辑保存要回答两个问题：写之前磁盘是不是还是我载入的那份（mtime + 大小），
* 写的时候会不会留下半截文件。前者用 FileSnapshot 比对，后者用同目录临时
* 文件 + rename —— rename 在同一文件系统上是原子的，dsh 的 watcher 只会看到
* 旧文件或新文件，不会看到被截断的中间态。
*/
/**
* Read one file's text and its on-disk metadata.
* @param path - absolute path.
* @returns the snapshot, or undefined when the path is missing / not a regular file.
*/
async function readFileSnapshot(path) {
	let info;
	try {
		info = await stat(path);
	} catch {
		return;
	}
	if (!info.isFile()) return void 0;
	try {
		return {
			text: await readFile(path, "utf8"),
			size: info.size,
			modifiedAt: info.mtimeMs,
			mode: info.mode
		};
	} catch {
		return;
	}
}
/**
* 原子写回一份文本文件，保留原权限位。
* @param path - 目标文件（父目录必须存在）。
* @param text - 完整的新内容。
* @param mode - 原文件的 stat.mode；缺省按 0o644 新建。
* @returns 写回后的文件大小与 mtime。
*/
async function writeTextAtomic(path, text, mode) {
	const permissions = mode === void 0 ? 420 : mode & 511;
	const temp = join(dirname(path), "." + basename(path) + ".hub-" + randomBytes(6).toString("hex") + ".tmp");
	try {
		await writeFile(temp, text, {
			encoding: "utf8",
			mode: permissions
		});
		await chmod(temp, permissions);
		await rename(temp, path);
	} catch (error) {
		await rm(temp, { force: true }).catch(() => {});
		throw error;
	}
	const info = await stat(path);
	return {
		size: info.size,
		modifiedAt: info.mtimeMs
	};
}
// src/store/paths.ts
/** Resolve the DSH home directory (the filesystem provider's user-dsh root base). */
function dshHome() {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
/** Resolve the shared agents root (`DSH_AGENTS_HOME`, else `~/.agents`). */
function agentsHome() {
	return process.env.DSH_AGENTS_HOME ?? join(homedir(), ".agents");
}
/**
* 插件自有数据的目录名（`$DSH_HOME/plugin/data/<slug>`）。
*
* 用仓库新名字而不是包名：这台机器上这个目录是用户按仓库名建的，卸载插件
* 后 dsh 不会清它——数据和插件包解耦，重装（哪怕换包名）能接着读。
*/
const PLUGIN_DATA_SLUG = "custom-instruction-manager";
/** 插件数据根目录：记录文件与词表缓存都在这下面。 */
function pluginDataDir(home = dshHome()) {
	return join(home, "plugin", "data", PLUGIN_DATA_SLUG);
}
/** 记录文件路径（来源、市场源、回收站、统计快照）。 */
function statePath(home = dshHome()) {
	return join(pluginDataDir(home), "state.json");
}
/** 旧记录文件位置（0.3.x）：`$DSH_HOME/dsh-skill-hub.json`。启动时迁走。 */
function legacyStatePath(home = dshHome()) {
	return join(home, "dsh-skill-hub.json");
}
/** 词表缓存目录（每个模型一份 tokenizer.json）。 */
function tokenizerCacheDir(home = dshHome()) {
	return join(pluginDataDir(home), "tokenizer");
}
/** 旧词表缓存位置（0.3.26）：`$DSH_HOME/skill-hub/tokenizers`。启动时迁走。 */
function legacyTokenizerDir(home = dshHome()) {
	return join(home, "skill-hub", "tokenizers");
}
// src/store/errors.ts
/**
* Business-rule failure the routes layer can map onto a 4xx status instead
* of a blanket 500: user input is invalid (validation → 400), the target
* does not exist (not-found → 404), or the operation conflicts with an
* invariant (conflict → 409).
*/
var StoreError = class extends Error {
	kind;
	constructor(kind, message) {
		super(message);
		this.name = "StoreError";
		this.kind = kind;
	}
};
// src/protocol/repo.ts
/** Top-level directory pattern for a skill root: visible, non-dot, safe chars. First char must be alphanum. */
const REPO_ROOT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
/**
* True when a value is a usable root: a visible safe top-level directory name,
* or the empty string for the repo root. Guards the persisted store against
* corrupt roots without rewriting the repo-root sentinel.
*/
function isValidRepoRoot(value) {
	return typeof value === "string" && (value === "" || REPO_ROOT_RE.test(value));
}
// src/store/migrate.ts
/**
* Normalize an arbitrary parsed sidecar document to the current schema.
* v1 to v2: scenes are dropped (the one-click role merged into group
* switches), and origins are migrated into source records (repo = origin
* value, commit snapshot empty — the first update check backfills it).
* v2 to v3: market sources become records ({ repo, ref?, commitSha? })
* instead of bare repo slugs, so a source can pin a release/branch version.
* v4 to v5: the scene system is gone — `tags` and trash `tagIds` are simply
* not read any more, so a loaded v4 file is rewritten without them.
* v5 to v6: the skill enable/disable toggle is gone — the `disabled` bucket and
* the saved `announceToAgent` config field are no longer read, so a loaded
* older file is rewritten without them.
* Returns null when the file claims a newer schema than this plugin
* understands, so the caller starts empty instead of risking data loss.
*/
function migrateStore(parsed) {
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
	const record = parsed;
	const version = typeof record.version === "number" ? record.version : 0;
	if (version > 6) return null;
	const config = typeof record.config === "object" && record.config !== null && !Array.isArray(record.config) ? record.config : void 0;
	const trash = Array.isArray(record.trash) ? record.trash : void 0;
	const marketSources = Array.isArray(record.marketSources) ? record.marketSources.map((entry) => typeof entry === "string" ? { repo: entry } : entry) : void 0;
	let sources;
	if (Array.isArray(record.sources)) sources = record.sources;
	else if (version < 2 && typeof record.origins === "object" && record.origins !== null && !Array.isArray(record.origins)) {
		const byOrigin = /* @__PURE__ */ new Map();
		for (const [name, origin] of Object.entries(record.origins)) {
			if (typeof origin !== "string" || origin === "") continue;
			const list = byOrigin.get(origin);
			if (list === void 0) byOrigin.set(origin, [name]);
			else list.push(name);
		}
		sources = [...byOrigin.entries()].map(([repo, skillNames]) => ({
			repo,
			root: "skills",
			commitSha: "",
			skills: skillNames.sort((a, b) => a.localeCompare(b))
		}));
	}
	return {
		version: 6,
		...config !== void 0 ? { config } : {},
		...sources !== void 0 ? { sources } : {},
		...marketSources !== void 0 ? { marketSources } : {},
		...trash !== void 0 ? { trash } : {},
		...record.skillStats !== void 0 ? { skillStats: record.skillStats } : {},
		...record.marketStats !== void 0 ? { marketStats: record.marketStats } : {},
		...Array.isArray(record.tokenModels) ? { tokenModels: record.tokenModels } : {}
	};
}
/**
* 把迁移后的原始文档校验为内存状态：坏条目丢弃、坏桶降级为空，
* 绝不因一条脏数据丢掉整个 sidecar（与原 ensureLoaded 内联逻辑一致）。
*/
function hydrateMigratedState(migrated) {
	const config = {};
	const saved = migrated.config;
	if (typeof saved === "object" && saved !== null) {
		if (typeof saved.enabled === "boolean") config.enabled = saved.enabled;
		if (typeof saved.dotModelColor === "string" && saved.dotModelColor !== "") config.dotModelColor = saved.dotModelColor;
		if (typeof saved.dotUserColor === "string" && saved.dotUserColor !== "") config.dotUserColor = saved.dotUserColor;
		if (typeof saved.showUseCount === "boolean") config.showUseCount = saved.showUseCount;
		if (typeof saved.showUseTime === "boolean") config.showUseTime = saved.showUseTime;
		if (typeof saved.showGroupSummary === "boolean") config.showGroupSummary = saved.showGroupSummary;
	}
	const sourcesByRepo = /* @__PURE__ */ new Map();
	if (Array.isArray(migrated.sources)) for (const entry of migrated.sources) {
		const source = entry;
		if (source !== null && typeof source === "object" && typeof source.repo === "string" && source.repo !== "" && Array.isArray(source.skills)) {
			const manifest = source.manifest;
			const rawRoot = isValidRepoRoot(source.root) ? source.root : "skills";
			sourcesByRepo.set(source.repo, {
				repo: source.repo,
				...typeof source.ref === "string" && source.ref !== "" ? { ref: source.ref } : {},
				root: rawRoot,
				commitSha: typeof source.commitSha === "string" ? source.commitSha : "",
				skills: source.skills.filter((n) => typeof n === "string"),
				...manifest !== null && typeof manifest === "object" && !Array.isArray(manifest) ? { manifest: Object.fromEntries(Object.entries(manifest).filter(([, size]) => typeof size === "number")) } : {}
			});
		}
	}
	const marketSources = [];
	if (Array.isArray(migrated.marketSources)) for (const entry of migrated.marketSources) {
		const item = entry;
		if (item !== null && typeof item === "object" && typeof item.repo === "string" && item.repo !== "" && !marketSources.some((s) => s.repo === item.repo)) marketSources.push({
			repo: item.repo,
			...typeof item.ref === "string" && item.ref !== "" ? { ref: item.ref } : {},
			...typeof item.commitSha === "string" && item.commitSha !== "" ? { commitSha: item.commitSha } : {}
		});
	}
	const trashByPath = /* @__PURE__ */ new Map();
	if (Array.isArray(migrated.trash)) for (const entry of migrated.trash) {
		const item = entry;
		if (item !== null && typeof item === "object" && typeof item.name === "string" && typeof item.path === "string") {
			const origin = item.origin;
			trashByPath.set(item.path, {
				name: item.name,
				path: item.path,
				movedAt: typeof item.movedAt === "number" ? item.movedAt : 0,
				...typeof item.sourcePath === "string" && item.sourcePath !== "" ? { sourcePath: item.sourcePath } : {},
				...origin !== null && typeof origin === "object" && typeof origin.repo === "string" && origin.repo !== "" && isValidRepoRoot(origin.root) ? { origin: {
					repo: origin.repo,
					root: origin.root,
					...typeof origin.ref === "string" && origin.ref !== "" ? { ref: origin.ref } : {},
					commitSha: typeof origin.commitSha === "string" ? origin.commitSha : ""
				} } : {}
			});
		}
	}
	/** Invalid derived invocation identities trigger a re-read, never a guessed count. */
	function cleanInvocations(raw) {
		if (!Array.isArray(raw)) return void 0;
		const calls = [];
		for (const item of raw) {
			if (item === null || typeof item !== "object") return void 0;
			const { key, name, time, inherited } = item;
			if (typeof key !== "string" || typeof name !== "string" || typeof time !== "number" || !Number.isFinite(time) || typeof inherited !== "boolean") return void 0;
			calls.push({
				key,
				name,
				time,
				inherited
			});
		}
		return calls;
	}
	let skillStats;
	const savedStats = migrated.skillStats;
	if (savedStats !== null && typeof savedStats === "object" && savedStats.identityVersion === 1 && typeof savedStats.frozenBefore === "number" && typeof savedStats.lastFullReconcile === "number" && typeof savedStats.windowDays === "number" && typeof savedStats.frozenSessions === "object" && savedStats.frozenSessions !== null) {
		const sessions = {};
		const revisions = {};
		for (const [id, entry] of Object.entries(savedStats.frozenSessions)) {
			if (entry === null || typeof entry !== "object") continue;
			const invocations = cleanInvocations(entry.invocations);
			if (typeof entry.createdAt === "number" && invocations !== void 0) sessions[id] = {
				createdAt: entry.createdAt,
				invocations
			};
		}
		for (const [id, entry] of Object.entries(savedStats.coldRevisions ?? {})) {
			if (entry === null || typeof entry !== "object") continue;
			const invocations = cleanInvocations(entry.invocations);
			if (typeof entry.rev === "string" && typeof entry.createdAt === "number" && invocations !== void 0) revisions[id] = {
				rev: entry.rev,
				createdAt: entry.createdAt,
				invocations
			};
		}
		const rawTotals = savedStats.lastTotals;
		const lastTotals = Array.isArray(rawTotals) ? rawTotals.filter((entry) => entry !== null && typeof entry === "object" && typeof entry.name === "string" && typeof entry.count === "number").map(({ name, count, lastUsed }) => ({
			name,
			count,
			...typeof lastUsed === "number" ? { lastUsed } : {}
		})) : void 0;
		skillStats = {
			identityVersion: 1,
			windowDays: savedStats.windowDays,
			frozenBefore: savedStats.frozenBefore,
			frozenSessions: sessions,
			lastFullReconcile: savedStats.lastFullReconcile,
			...lastTotals === void 0 ? {} : { lastTotals },
			...savedStats.coldRevisions === void 0 ? {} : { coldRevisions: revisions }
		};
	}
	let marketStats = void 0;
	const savedMarketStats = migrated.marketStats;
	if (savedMarketStats !== null && typeof savedMarketStats === "object" && typeof savedMarketStats.fetchedAt === "number" && typeof savedMarketStats.stats === "object" && savedMarketStats.stats !== null) {
		const stats = {};
		for (const [repo, entry] of Object.entries(savedMarketStats.stats)) if (entry !== null && typeof entry === "object" && typeof entry.stars === "number" && typeof entry.downloads === "number") stats[repo] = {
			stars: entry.stars,
			downloads: entry.downloads
		};
		marketStats = {
			fetchedAt: savedMarketStats.fetchedAt,
			stats
		};
	}
	const tokenModels = Array.isArray(migrated.tokenModels) ? migrated.tokenModels.filter((id) => typeof id === "string" && id !== "") : void 0;
	return {
		config,
		sourcesByRepo,
		marketSources,
		trashByPath,
		skillStats,
		marketStats,
		tokenModels
	};
}
/** True when a root denotes the repo root itself (the repo is the skill dir). */
function isRepoRoot(root) {
	return root === "";
}
/**
* The tree prefix delimiting a skill directory: empty for the repo-root skill
* (it owns the whole tree), otherwise `<dir>/`. Single source for collect,
* manifest, diff and the store's baseline cleanup, so they can never disagree.
*/
function skillDirPrefix(dir) {
	return isRepoRoot(dir) ? "" : dir + "/";
}
/**
* A path inside a skill directory, as it appears in the repo tree. Both
* directions of this mapping matter: repo paths are always '/'-joined (never
* node:path's OS separator, these are GitHub paths shown in the UI), and the
* repo-root case must not grow a leading slash.
*/
function skillPathIn(dir, relative) {
	return skillDirPrefix(dir) + relative;
}
/** The SKILL.md path inside a skill directory. */
function skillFileAt(dir) {
	return skillPathIn(dir, "SKILL.md");
}
/**
* Top-level dot entries are repo tooling, never part of a skill: `.github/`,
* `.claude-plugin/`, `.gitignore`. Only the repo-root skill can reach them,
* since its prefix is empty and would otherwise sweep in the whole repo.
* Nested skill dirs cannot start with a dot (ROOT_RE), so this is a no-op
* for them.
*/
function isRepoTooling(path) {
	return path.startsWith(".");
}
/** Every tree blob belonging to a skill directory, sorted by path. */
function skillTreeFiles(tree, dir) {
	const prefix = skillDirPrefix(dir);
	return tree.filter((item) => item.type === "blob" && item.path.startsWith(prefix) && !isRepoTooling(item.path)).map((item) => ({
		path: item.path,
		size: typeof item.size === "number" ? item.size : 0
	})).sort((a, b) => a.path.localeCompare(b.path));
}
/**
* A repo file's path relative to its skill directory — the path it is written
* to under the skill's own directory. `dir === ''` means the repo file path
* *is* the relative path; slicing `dir.length + 1` would eat its first
* character.
*/
function relativeToSkillDir(dir, path) {
	return isRepoRoot(dir) ? path : path.slice(dir.length + 1);
}
/** `owner/repo` slug for a parsed reference. */
function repoSlug(ref) {
	return `${ref.owner}/${ref.repo}`;
}
/**
* Normalize a GitHub URL or `owner/repo`/`owner/repo@ref` input.
* Only github.com URLs are accepted in v1.
*/
function normalizeRepoInput(input) {
	let value = input.trim();
	if (value === "") return null;
	let ref;
	const urlMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/#?@]+)(?:\/tree\/([^/?#]+))?/.exec(value);
	if (urlMatch !== null) {
		value = `${urlMatch[1]}/${urlMatch[2]}`;
		ref = urlMatch[3];
	} else {
		if (/^https?:\/\//.test(value)) return null;
		const at = value.indexOf("@");
		if (at !== -1) {
			ref = value.slice(at + 1).trim();
			value = value.slice(0, at).trim();
		}
	}
	value = value.replace(/\.git$/, "").replace(/\/+$/, "");
	const parts = value.split("/").filter(Boolean);
	if (parts.length < 2) return null;
	const owner = parts[0];
	const repo = parts[1];
	if (owner === "" || repo === "" || owner.includes("..") || repo.includes("..")) return null;
	return {
		owner,
		repo,
		...ref !== void 0 && ref !== "" ? { ref } : {}
	};
}
/** Collect every file inside a skill directory, including SKILL.md itself. */
function collectRepoSkillFiles(tree, dir) {
	return skillTreeFiles(tree, dir);
}
/**
* Compute an origin collection name. Multiple roots split by root, one root
* keeps the repo slug. The repo-root skill's name *is* the repo slug, so it
* never gets a trailing-slash suffix (`owner/repo/`).
*/
function originForRoot(repo, rootsPresent, root) {
	if (rootsPresent.size <= 1) return repo;
	return isRepoRoot(root) ? repo : `${repo}/${root}`;
}
/** Discover importable skills from a repo tree. Invalid names are ignored. Roots are auto-derived from the top-level directory of each SKILL.md. */
function discoverRepoEntries(tree, repo, existingNames = /* @__PURE__ */ new Set()) {
	const candidates = [];
	const rootsPresent = /* @__PURE__ */ new Set();
	const repoName = repo.slice(repo.lastIndexOf("/") + 1);
	if (isSkillName(repoName) && tree.some((item) => item.type === "blob" && item.path === "SKILL.md")) {
		rootsPresent.add("");
		candidates.push({
			root: "",
			dir: "",
			name: repoName,
			path: "SKILL.md"
		});
	}
	for (const item of tree) {
		if (item.type !== "blob") continue;
		const slash = item.path.indexOf("/");
		if (slash === -1) continue;
		if (!item.path.endsWith("/SKILL.md")) continue;
		const root = item.path.slice(0, slash);
		if (!REPO_ROOT_RE.test(root)) continue;
		const dir = item.path.slice(0, -9);
		if (dir === root || dir.length <= root.length + 1) continue;
		const name = dir.slice(dir.lastIndexOf("/") + 1);
		if (!isSkillName(name)) continue;
		rootsPresent.add(root);
		candidates.push({
			root,
			dir,
			name,
			path: item.path
		});
	}
	return candidates.map((candidate) => {
		const files = collectRepoSkillFiles(tree, candidate.dir);
		return {
			name: candidate.name,
			dir: candidate.dir,
			path: candidate.path,
			root: candidate.root,
			origin: originForRoot(repo, rootsPresent, candidate.root),
			fileCount: files.length,
			totalBytes: files.reduce((sum, file) => sum + file.size, 0),
			existing: existingNames.has(candidate.name)
		};
	}).sort((a, b) => a.name.localeCompare(b.name));
}
/**
* Build a path→size manifest for one skill directory from a repo tree.
* Shares `skillTreeFiles` with collectRepoSkillFiles: a manifest that
* disagreed with the collected file set would make every update diff report
* "changed" forever.
*/
function skillManifest(tree, dir) {
	const manifest = {};
	for (const file of skillTreeFiles(tree, dir)) manifest[file.path] = file.size;
	return manifest;
}
/**
* The real upstream directory of one tracked skill. Source records keep only
* the short name and top-level root (e.g. root "skills", name "ask-matt"),
* but upstream repos may nest skills under category directories
* (skills/engineering/ask-matt/) or move them between categories. Resolution
* order: exact match under the top-level root in the upstream tree, then the
* manifest's recorded blob path, then any same-name skill in the tree, then
* the flat root/name fallback. Passing the tree paths makes the lookup
* resilient to incomplete manifests and upstream moves.
*
* A repo-root record (root '') has no directory to resolve: its SKILL.md is a
* bare top-level path, so every nested lookup below would miss and the final
* fallback would hand back a bogus '/name'. Answer before them — including
* when the upstream SKILL.md is gone, so diffRemoteSkills reports a deletion
* instead of hunting for a skill that was never nested.
*/
function skillDirOf(source, name, treePaths) {
	if (isRepoRoot(source.root)) return "";
	if (treePaths !== void 0) {
		const rootPrefix = source.root + "/";
		const found = treePaths.find((path) => path.startsWith(rootPrefix) && path.endsWith("/" + name + "/SKILL.md"));
		if (found !== void 0) return found.slice(0, found.lastIndexOf("/"));
	}
	const manifest = source.manifest ?? {};
	const fromManifest = Object.keys(manifest).find((path) => path.endsWith("/" + name + "/SKILL.md"));
	if (fromManifest !== void 0) return fromManifest.slice(0, fromManifest.lastIndexOf("/"));
	if (treePaths !== void 0) {
		const found = treePaths.find((path) => path.endsWith("/" + name + "/SKILL.md"));
		if (found !== void 0) return found.slice(0, found.lastIndexOf("/"));
	}
	return source.root + "/" + name;
}
/**
* Diff one source record against an upstream tree at treeSha: which tracked
* skills disappeared (no SKILL.md blob) and which changed (manifest baseline
* differs, or no baseline exists — treated as changed). Pure over the tree.
* The remote side is read through skillManifest, so the diff compares like
* with like against the baseline recorded at import time.
*/
function diffRemoteSkills(tree, source) {
	const treePaths = tree.filter((item) => item.type === "blob").map((item) => item.path);
	const updated = [];
	const deleted = [];
	const baseline = source.manifest ?? {};
	for (const name of source.skills) {
		const dir = skillDirOf(source, name, treePaths);
		const prefix = skillDirPrefix(dir);
		const remote = skillManifest(tree, dir);
		if (!Object.hasOwn(remote, skillFileAt(dir))) {
			deleted.push(name);
			continue;
		}
		const baselineEntries = Object.entries(baseline).filter(([path]) => path.startsWith(prefix));
		if (baselineEntries.length === 0) {
			updated.push(name);
			continue;
		}
		let differs = baselineEntries.length !== Object.keys(remote).length;
		if (!differs) {
			for (const [path, size] of baselineEntries) if (remote[path] !== size) {
				differs = true;
				break;
			}
		}
		if (differs) updated.push(name);
	}
	return {
		updated,
		deleted
	};
}
/** Minimal RepoSkillEntry for a tracked skill name (sync re-downloads by name). */
function repoSkillEntry(name, root, repo) {
	const dir = isRepoRoot(root) ? "" : root + "/" + name;
	return {
		name,
		dir,
		path: skillFileAt(dir),
		root,
		origin: repo,
		fileCount: 0,
		totalBytes: 0,
		existing: false
	};
}
// src/store/store.ts
/** Sidecar state owner. */
var SkillHubStore = class {
	file;
	config = {};
	sourcesByRepo = /* @__PURE__ */ new Map();
	marketSources = [];
	trashByPath = /* @__PURE__ */ new Map();
	skillStats = void 0;
	marketStats = void 0;
	/** 选中的 token 计数模型；undefined = 从未保存（协议层默认集合）。 */
	tokenModels = void 0;
	loaded = false;
	/** Serializes persist runs: concurrent mutators must not let an earlier
	*  snapshot overwrite a later one (rename is atomic, ordering is not). */
	writeChain = Promise.resolve();
	constructor(file = statePath()) {
		this.file = file;
	}
	async ensureLoaded() {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const raw = await readFile(this.file, "utf8");
			const parsed = JSON.parse(raw);
			const fileVersion = typeof parsed.version === "number" ? parsed.version : 0;
			const migrated = migrateStore(parsed);
			if (migrated === null) console.warn("[dsh-skill-hub] sidecar state uses a newer schema than this plugin supports; starting empty");
			else {
				const state = hydrateMigratedState(migrated);
				this.config = state.config;
				this.sourcesByRepo = state.sourcesByRepo;
				this.marketSources = state.marketSources;
				this.trashByPath = state.trashByPath;
				this.skillStats = state.skillStats;
				this.marketStats = state.marketStats;
				this.tokenModels = state.tokenModels;
				if (fileVersion < 6) await this.persist();
			}
		} catch (error) {
			if (error.code !== "ENOENT") console.warn("[dsh-skill-hub] sidecar state unreadable, starting empty:", error instanceof Error ? error.message : error);
		}
	}
	/** The hub's saved runtime configuration (fields absent here mean "not overridden"). */
	async getConfig() {
		await this.ensureLoaded();
		return { ...this.config };
	}
	/**
	* Persist a runtime-config patch, merged over the saved values. A field
	* whose patch value is undefined is removed from the saved layer, so the
	* setting re-inherits its default (the web card's "reset" path).
	*/
	async setConfig(config) {
		await this.ensureLoaded();
		const next = { ...this.config };
		for (const [key, value] of Object.entries(config)) if (value === void 0) delete next[key];
		else next[key] = value;
		this.config = next;
		await this.persist();
	}
	/** All source records, sorted by repo. */
	async listSources() {
		await this.ensureLoaded();
		return [...this.sourcesByRepo.values()].sort((a, b) => a.repo.localeCompare(b.repo));
	}
	/** One source record by repo (undefined when absent). */
	async getSource(repo) {
		await this.ensureLoaded();
		return this.sourcesByRepo.get(repo);
	}
	/** The source record that tracks a skill name (undefined when untracked). */
	async getSourceForSkill(name) {
		await this.ensureLoaded();
		for (const source of this.sourcesByRepo.values()) if (source.skills.includes(name)) return source;
	}
	/** Remove a source record entirely (no-op when absent). */
	async deleteSource(repo) {
		await this.ensureLoaded();
		if (!this.sourcesByRepo.delete(repo)) return;
		await this.persist();
	}
	/**
	* Upsert one skill into a source record. When the repo has no record yet a
	* new one is created (root + commit snapshot from the caller).
	*/
	/**
	* Record one imported skill in its repo-level source row.
	*
	* A repo owns exactly one source row, hence one pinned ref, so a later import
	* must re-pin it: keeping the first import's `ref` / `commitSha` makes
	* `sources/check` compare against a stale sha and `sources/sync` re-download
	* the old ref over content that was imported from a tag — the "pinning a tag
	* means nothing" failure of issue #15, reached through the bookkeeping
	* instead of the download. An absent `ref` means the import ran on the
	* default branch, which clears the pin rather than silently keeping it.
	*/
	async addSourceSkill(repo, root, commitSha, ref, skillName) {
		await this.ensureLoaded();
		const existing = this.sourcesByRepo.get(repo);
		if (existing === void 0) this.sourcesByRepo.set(repo, {
			repo,
			...ref !== void 0 && ref !== "" ? { ref } : {},
			root,
			commitSha,
			skills: [skillName]
		});
		else {
			const skills = existing.skills.includes(skillName) ? existing.skills : [...existing.skills, skillName].sort((a, b) => a.localeCompare(b));
			const next = {
				...existing,
				skills
			};
			if (ref !== void 0 && ref !== "") next.ref = ref;
			else delete next.ref;
			if (commitSha !== "") next.commitSha = commitSha;
			this.sourcesByRepo.set(repo, next);
		}
		await this.persist();
	}
	/** Replace a source's skill list (used after sync/confirm-delete). */
	async setSourceSkills(repo, skills) {
		await this.ensureLoaded();
		const existing = this.sourcesByRepo.get(repo);
		if (existing === void 0) return void 0;
		const names = [...new Set(skills.filter((n) => n.trim() !== ""))].sort((a, b) => a.localeCompare(b));
		if (names.length === 0) this.sourcesByRepo.delete(repo);
		else this.sourcesByRepo.set(repo, {
			...existing,
			skills: names
		});
		await this.persist();
		return this.sourcesByRepo.get(repo);
	}
	/** Remove one skill from every source record (used when the skill is deleted). */
	async removeSkillFromSources(name) {
		await this.ensureLoaded();
		let changed = false;
		for (const [repo, source] of this.sourcesByRepo) {
			if (!source.skills.includes(name)) continue;
			const skills = source.skills.filter((n) => n !== name);
			if (skills.length === 0) this.sourcesByRepo.delete(repo);
			else this.sourcesByRepo.set(repo, {
				...source,
				skills
			});
			changed = true;
		}
		if (changed) await this.persist();
	}
	/** Update a source's commit snapshot. */
	async setSourceCommit(repo, commitSha) {
		await this.ensureLoaded();
		const existing = this.sourcesByRepo.get(repo);
		if (existing === void 0) return;
		this.sourcesByRepo.set(repo, {
			...existing,
			commitSha
		});
		await this.persist();
	}
	/** Update a source's pinned ref (release tag / branch) when the market syncs. */
	async setSourceRef(repo, ref) {
		await this.ensureLoaded();
		const existing = this.sourcesByRepo.get(repo);
		if (existing === void 0 || ref.trim() === "") return;
		this.sourcesByRepo.set(repo, {
			...existing,
			ref: ref.trim()
		});
		await this.persist();
	}
	/**
	* Merge per-path manifest entries into a source (incremental imports).
	* When `dir` is given, every baseline path under that skill directory is
	* dropped first, so files the upstream removed never linger in the
	* baseline and skew later update diffs.
	*
	* `dir` may be '' — a skill whose SKILL.md sits at the repo root. Its prefix
	* is empty, so the whole baseline is replaced: that skill owns the tree, and
	* keeping stale paths would make every later diff report "changed" forever.
	*/
	async mergeSourceManifest(repo, manifest, dir) {
		await this.ensureLoaded();
		const existing = this.sourcesByRepo.get(repo);
		if (existing === void 0 || Object.keys(manifest).length === 0) return;
		const base = { ...existing.manifest ?? {} };
		if (dir !== void 0) {
			const prefix = skillDirPrefix(dir);
			for (const path of Object.keys(base)) if (path.startsWith(prefix)) delete base[path];
		}
		this.sourcesByRepo.set(repo, {
			...existing,
			manifest: {
				...base,
				...manifest
			}
		});
		await this.persist();
	}
	/** skillName → collection name for every recorded origin (derived from sources). */
	async listOrigins() {
		await this.ensureLoaded();
		const origins = {};
		for (const source of this.sourcesByRepo.values()) for (const name of source.skills) origins[name] = source.repo;
		return origins;
	}
	/** The user's market sources, in addition order. */
	async listMarketSources() {
		await this.ensureLoaded();
		return [...this.marketSources];
	}
	/** One market source by repo (undefined when absent). */
	async getMarketSource(repo) {
		await this.ensureLoaded();
		return this.marketSources.find((entry) => entry.repo === repo);
	}
	/** Add a repo (deduplicated), optionally with a pinned ref. Returns the fresh list. */
	async addMarketSource(repo, ref) {
		await this.ensureLoaded();
		const existing = this.marketSources.find((entry) => entry.repo === repo);
		if (existing === void 0) this.marketSources.push(ref !== void 0 && ref !== "" ? {
			repo,
			ref
		} : { repo });
		else if (ref !== void 0 && ref !== "" && existing.ref !== ref) existing.ref = ref;
		await this.persist();
		return [...this.marketSources];
	}
	/** Remove a repo (no-op when absent). Returns the fresh list. */
	async removeMarketSource(repo) {
		await this.ensureLoaded();
		const index = this.marketSources.findIndex((entry) => entry.repo === repo);
		if (index === -1) return [...this.marketSources];
		this.marketSources.splice(index, 1);
		await this.persist();
		return [...this.marketSources];
	}
	/** Pin a market source to an explicit ref (branch/tag). Returns the record. */
	async setMarketSourceRef(repo, ref) {
		await this.ensureLoaded();
		const entry = this.marketSources.find((item) => item.repo === repo);
		if (entry === void 0 || ref.trim() === "") return entry;
		entry.ref = ref.trim();
		delete entry.commitSha;
		await this.persist();
		return entry;
	}
	/** Record the commit a market source's pinned ref resolved to (update baseline). */
	async setMarketSourceCommit(repo, commitSha) {
		await this.ensureLoaded();
		const entry = this.marketSources.find((item) => item.repo === repo);
		if (entry === void 0 || commitSha === "") return;
		entry.commitSha = commitSha;
		await this.persist();
	}
	/** 选中的 token 计数模型（`undefined` = 从未保存，调用方回落到默认集合）。 */
	async getTokenModels() {
		await this.ensureLoaded();
		return this.tokenModels === void 0 ? void 0 : [...this.tokenModels];
	}
	/** 保存选中集合（空数组合法：用户一个模型都不选）。 */
	async setTokenModels(ids) {
		await this.ensureLoaded();
		const next = [...new Set(ids)];
		if (this.tokenModels !== void 0 && next.length === this.tokenModels.length && next.every((id, index) => id === this.tokenModels?.[index])) return;
		this.tokenModels = next;
		await this.persist();
	}
	/** All trashed skills, newest first. */
	async listTrash() {
		await this.ensureLoaded();
		return [...this.trashByPath.values()].sort((a, b) => b.movedAt - a.movedAt);
	}
	/** One trash entry by skill name — the newest when a name has several. */
	async getTrash(name) {
		await this.ensureLoaded();
		let newest;
		for (const entry of this.trashByPath.values()) {
			if (entry.name !== name) continue;
			if (newest === void 0 || entry.movedAt > newest.movedAt) newest = entry;
		}
		return newest;
	}
	/**
	* Record a trashed skill, keyed by its trashed path. Keying by name used to
	* silently drop the previous record when the same name landed in the trash
	* twice (a re-delete, or the two on-disk discovery forms), orphaning its
	* directory with nothing left pointing at it.
	*/
	async addTrash(entry) {
		await this.ensureLoaded();
		this.trashByPath.set(entry.path, entry);
		await this.persist();
	}
	/** Remove a trash record by its trashed path (after restore or permanent clear). */
	async removeTrash(path) {
		await this.ensureLoaded();
		if (!this.trashByPath.delete(path)) return;
		await this.persist();
	}
	/** The persisted usage-statistics checkpoint (undefined until first saved). */
	async getSkillStatsState() {
		await this.ensureLoaded();
		return this.skillStats !== void 0 ? {
			...this.skillStats,
			frozenSessions: { ...this.skillStats.frozenSessions },
			...this.skillStats.lastTotals !== void 0 ? { lastTotals: [...this.skillStats.lastTotals] } : {},
			...this.skillStats.coldRevisions !== void 0 ? { coldRevisions: { ...this.skillStats.coldRevisions } } : {}
		} : void 0;
	}
	/** Persist a usage-statistics checkpoint (after every completed scan; cadence follows the scan TTL). */
	async saveSkillStatsState(state) {
		await this.ensureLoaded();
		this.skillStats = {
			identityVersion: 1,
			windowDays: state.windowDays,
			frozenBefore: state.frozenBefore,
			frozenSessions: { ...state.frozenSessions },
			lastFullReconcile: state.lastFullReconcile,
			...state.lastTotals !== void 0 ? { lastTotals: [...state.lastTotals] } : {},
			...state.coldRevisions !== void 0 ? { coldRevisions: { ...state.coldRevisions } } : {}
		};
		await this.persist();
	}
	/** The persisted market-stats snapshot (undefined until first saved). */
	async getMarketStatsState() {
		await this.ensureLoaded();
		return this.marketStats !== void 0 ? {
			fetchedAt: this.marketStats.fetchedAt,
			stats: { ...this.marketStats.stats }
		} : void 0;
	}
	/** Persist a market-stats snapshot (written when a refresh fetched anything new). */
	async saveMarketStatsState(state) {
		await this.ensureLoaded();
		this.marketStats = {
			fetchedAt: state.fetchedAt,
			stats: { ...state.stats }
		};
		await this.persist();
	}
	persist() {
		const run = this.writeChain.then(async () => {
			const payload = {
				version: 6,
				config: this.config,
				...this.sourcesByRepo.size > 0 ? { sources: [...this.sourcesByRepo.values()] } : {},
				...this.marketSources.length > 0 ? { marketSources: [...this.marketSources] } : {},
				...this.trashByPath.size > 0 ? { trash: [...this.trashByPath.values()] } : {},
				...this.skillStats !== void 0 ? { skillStats: this.skillStats } : {},
				...this.marketStats !== void 0 ? { marketStats: this.marketStats } : {},
				...this.tokenModels !== void 0 ? { tokenModels: [...this.tokenModels] } : {}
			};
			const tmp = this.file + ".tmp";
			await mkdir(dirname(this.file), { recursive: true });
			await writeFile(tmp, JSON.stringify(payload, null, 2) + "\n", "utf8");
			await rename(tmp, this.file);
		});
		this.writeChain = run.catch(() => {});
		return run;
	}
};
// src/error-text.ts
/**
* 错误文案收敛：宿主各处把 unknown 异常转成一行可读文字。原先这条表达式
* 在宿主侧内联了 22 次（`error instanceof Error ? error.message : String(error)`），
* 现在统一走这里。浏览器半有自己的 `helpers.errorMessage`，两半互不引用。
*
* Error 的 `cause` 链（undici 的 `fetch failed`、AggregateError 的多地址
* 失败、TLS 证书错误等）以括号附录带出，避免只剩笼统的顶层 message。
*/
/** cause 链最大展开深度，防自引用/超深链。 */
const MAX_CAUSE_DEPTH = 4;
/** 合成一条 cause 细节；code 已在 message 里则不重复。 */
function causeDetail(message, code) {
	const text = message.trim();
	if (code === "") return text;
	if (text === "") return "[" + code + "]";
	return text.includes(code) ? text : text + " [" + code + "]";
}
/** 深度受限地收集 cause 链细节（AggregateError 展开其 errors）。 */
function collectCauseDetails(cause, depth, seen, out) {
	if (depth > MAX_CAUSE_DEPTH || cause === null || cause === void 0 || seen.has(cause)) return;
	seen.add(cause);
	if (cause instanceof Error) {
		const errors = cause.errors;
		if (Array.isArray(errors)) for (const item of errors) collectCauseDetails(item, depth + 1, seen, out);
		const rawCode = cause.code;
		const code = typeof rawCode === "string" ? rawCode : "";
		const detail = causeDetail(cause.message, code);
		if (detail !== "") out.push(detail);
		collectCauseDetails(cause.cause, depth + 1, seen, out);
		return;
	}
	const detail = causeDetail(String(cause), "");
	if (detail !== "") out.push(detail);
}
/** 从 unknown 异常取出可读文案；非 Error 值用 String 兜底，cause 附在括号里。 */
function errorText(error) {
	if (!(error instanceof Error)) return String(error);
	const details = [];
	collectCauseDetails(error.cause, 1, /* @__PURE__ */ new Set(), details);
	for (let index = details.length - 1; index >= 0; index -= 1) if (details[index] === error.message || details.indexOf(details[index]) !== index) details.splice(index, 1);
	if (details.length === 0) return error.message;
	const suffix = details.join("; ");
	return error.message === "" ? suffix : error.message + " (" + suffix + ")";
}
// src/skillfs/frontmatter.ts
/** Parse a SKILL.md the way the official filesystem provider does. */
function parseFrontmatter(text) {
	const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/.exec(text);
	if (match === null) return { error: "missing YAML frontmatter (--- block)" };
	let data;
	let rawFrontmatter = match[1];
	try {
		data = load(rawFrontmatter);
	} catch (error) {
		const repaired = repairFrontmatterScalarFields(rawFrontmatter);
		if (repaired !== null) try {
			data = load(repaired);
			rawFrontmatter = repaired;
		} catch {
			return { error: "invalid YAML frontmatter: " + errorText(error) };
		}
		else return { error: "invalid YAML frontmatter: " + errorText(error) };
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) return { error: "frontmatter must be a YAML mapping" };
	const record = data;
	const name = typeof record.name === "string" ? record.name.trim() : "";
	if (name === "") return { error: "frontmatter requires a name field" };
	if (!isSkillName(name)) return { error: "invalid skill name \"" + name + "\" (must be kebab-case)" };
	const description = typeof record.description === "string" ? record.description.trim() : "";
	if (description === "") return { error: "frontmatter requires a description field" };
	const whenToUse = typeof record.whenToUse === "string" && record.whenToUse.trim() !== "" ? record.whenToUse.trim() : void 0;
	if (Object.hasOwn(record, "disableModelInvocation")) return { error: "frontmatter field \"disableModelInvocation\" is unsupported; use \"disable-model-invocation\"" };
	if (Object.hasOwn(record, "modelInvocable")) return { error: "frontmatter field \"modelInvocable\" is unsupported; use \"disable-model-invocation\"" };
	if (Object.hasOwn(record, "userInvocable")) return { error: "frontmatter field \"userInvocable\" is unsupported; use \"user-invocable\"" };
	let invocation;
	try {
		const disableModel = frontmatterBoolean(record, "disable-model-invocation");
		const userInvocable = frontmatterBoolean(record, "user-invocable");
		invocation = {
			modelInvocable: disableModel !== true,
			userInvocable: userInvocable !== false
		};
	} catch (error) {
		return { error: errorText(error) };
	}
	return { value: {
		name,
		description,
		...whenToUse !== void 0 ? { whenToUse } : {},
		invocation,
		content: (match[2] ?? "").trim()
	} };
}
/**
* Repair bare scalar fields that contain an unquoted colon (e.g. `description: Build for AWS: ECS`)
* or an invalid flow-like scalar (`@`, `` ` ``, `[`, `{`). Mirrors codex `repair_frontmatter_scalar_fields`:
* line-oriented, only touches lines where quoting makes the YAML valid, and preserves block scalars.
* Returns the repaired frontmatter string when at least one line was quoted, otherwise null.
*/
function repairFrontmatterScalarFields(frontmatter) {
	let changed = false;
	let blockScalarIndent = null;
	const repairedLines = [];
	for (const line of frontmatter.split("\n")) {
		const indent = line.search(/[^ ]/);
		const effectiveIndent = indent === -1 ? line.length : indent;
		if (blockScalarIndent !== null) {
			if (line.trim() === "" || effectiveIndent > blockScalarIndent) {
				repairedLines.push(line);
				continue;
			}
			blockScalarIndent = null;
		}
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) {
			repairedLines.push(line);
			continue;
		}
		const key = line.slice(0, colonIndex);
		const value = line.slice(colonIndex + 1);
		if (key.trim() === "" || value.length === 0 || !/^\s/.test(value)) {
			repairedLines.push(line);
			continue;
		}
		const trimmedStart = value.trimStart();
		const leadingWhitespace = value.slice(0, value.length - trimmedStart.length);
		let scalar = trimmedStart;
		let comment = "";
		for (let idx = 0; idx < trimmedStart.length; idx += 1) if (trimmedStart[idx] === "#") {
			const prev = idx === 0 ? " " : trimmedStart[idx - 1];
			const next = idx + 1 < trimmedStart.length ? trimmedStart[idx + 1] : " ";
			if (/\s/.test(prev) && /\s/.test(next)) {
				const commentStart = trimmedStart.slice(0, idx).trimEnd().length;
				scalar = trimmedStart.slice(0, commentStart);
				comment = trimmedStart.slice(commentStart);
				break;
			}
		}
		scalar = scalar.trimEnd();
		if (scalar === "") {
			repairedLines.push(line);
			continue;
		}
		const firstChar = scalar[0];
		if (firstChar === "|" || firstChar === ">") {
			blockScalarIndent = effectiveIndent;
			repairedLines.push(line);
			continue;
		}
		if (firstChar === "'" || firstChar === "\"") {
			repairedLines.push(line);
			continue;
		}
		let hasColonSeparator = false;
		for (let i = 0; i < scalar.length - 1; i += 1) if (scalar[i] === ":" && /\s/.test(scalar[i + 1])) {
			hasColonSeparator = true;
			break;
		}
		let invalidFlowLike = false;
		if (firstChar === "[" || firstChar === "{" || firstChar === "@" || firstChar === "`") try {
			load(scalar);
		} catch {
			invalidFlowLike = true;
		}
		if (!hasColonSeparator && !invalidFlowLike) {
			repairedLines.push(line);
			continue;
		}
		const quotedScalar = "'" + scalar.replace(/'/g, "''") + "'";
		repairedLines.push(key + ":" + leadingWhitespace + quotedScalar + comment);
		changed = true;
	}
	return changed ? repairedLines.join("\n") : null;
}
/** Try to repair a SKILL.md's frontmatter in place (unquoted colon etc.). Returns the new file text or null when not fixable. */
function repairFrontmatterFileText(text) {
	const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/.exec(text);
	if (match === null) return null;
	const repaired = repairFrontmatterScalarFields(match[1]);
	if (repaired === null) return null;
	try {
		load(repaired);
	} catch {
		return null;
	}
	const body = match[2] ?? "";
	return "---\n" + repaired + "\n---" + (body !== "" ? "\n" + body : "");
}
/** Official boolean grammar: true/false, 1/0, and the common string spellings. */
function frontmatterBoolean(data, key) {
	if (!Object.hasOwn(data, key)) return void 0;
	const value = data[key];
	if (typeof value === "boolean") return value;
	if (value === 1 || value === "1") return true;
	if (value === 0 || value === "0") return false;
	if (typeof value === "string") switch (value.toLowerCase()) {
		case "true":
		case "yes":
		case "on": return true;
		case "false":
		case "no":
		case "off": return false;
	}
	throw new TypeError("frontmatter field \"" + key + "\" must be a boolean");
}
/**
* Rewrite the two invocation keys in a SKILL.md text.
*
* Only the two line-level keys change; every other frontmatter byte keeps its
* position, comments, quoting and block scalars, and the body is untouched.
* Defaults are written as "key absent" so a file toggled back keeps a clean
* header:
*  - modelInvocable=true  → drop `disable-model-invocation`; false → `disable-model-invocation: true`
*  - userInvocable=true   → drop `user-invocable`; false → `user-invocable: false`
*
* A key that is not a top-level mapping key (inside a block scalar, indented,
* etc.) is never touched: the pattern anchors at column 0, and a column-0 key
* always terminates any preceding block scalar, so appending is safe.
*
* @returns the rewritten text (validated by re-parsing), or the reason it was refused.
*/
function setInvocationInText(text, policy) {
	const match = /^(---[^\S\r\n]*\r?\n)([\s\S]*?)(\r?\n---[^\S\r\n]*)([\s\S]*)$/.exec(text);
	if (match === null) return { error: "missing YAML frontmatter (--- block)" };
	const [, open, inner, close, body] = match;
	const eol = inner.includes("\r\n") || open.endsWith("\r\n") ? "\r\n" : "\n";
	let lines = inner.split(/\r?\n/);
	lines = applyInvocationKey(lines, "disable-model-invocation", policy.modelInvocable ? void 0 : true);
	lines = applyInvocationKey(lines, "user-invocable", policy.userInvocable ? void 0 : false);
	const next = open + lines.join(eol) + close + body;
	const parsed = parseFrontmatter(next);
	if ("error" in parsed) return { error: "rewritten frontmatter is invalid: " + parsed.error };
	if (parsed.value.invocation.modelInvocable !== policy.modelInvocable || parsed.value.invocation.userInvocable !== policy.userInvocable) return { error: "rewritten frontmatter does not round-trip to the requested invocation policy" };
	return { text: next };
}
/**
* Set (boolean) or remove (undefined) one top-level frontmatter key.
* Duplicate keys collapse to a single line; a missing key is appended after
* the last non-blank line, so the file keeps its trailing blank-line style.
*/
function applyInvocationKey(lines, key, value) {
	const pattern = new RegExp("^" + key.replace(/-/g, "\\-") + "[ \\t]*:");
	const kept = [];
	let seen = false;
	for (const line of lines) {
		if (!pattern.test(line)) {
			kept.push(line);
			continue;
		}
		if (value !== void 0 && !seen) kept.push(key + ": " + String(value));
		seen = true;
	}
	if (value !== void 0 && !seen) {
		let at = kept.length;
		while (at > 0 && kept[at - 1].trim() === "") at -= 1;
		kept.splice(at, 0, key + ": " + String(value));
	}
	return kept;
}
// src/skillfs/paths.ts
/** Root ids this module may write to. */
const WRITABLE_ROOTS = ["user-dsh", "user-agents"];
/** Resolve the absolute directory of one writable root. */
function rootPath(root, home = dshHome()) {
	switch (root) {
		case "user-dsh": return join(home, "skills");
		case "user-agents": return join(agentsHome(), "skills");
		default: throw new TypeError("unknown root: " + String(root));
	}
}
/** Root of an absolute skill file path, or undefined when not user-owned. */
function rootOfPath(path, home = dshHome()) {
	const normalized = resolve(path);
	for (const root of WRITABLE_ROOTS) {
		const base = resolve(rootPath(root, home));
		if (process.platform === "win32") {
			const n = normalized.toLowerCase();
			const b = base.toLowerCase();
			if (n === b) return root;
			if (n.startsWith(b + "/") || n.startsWith(b + "\\") || n.startsWith(b + sep)) return root;
			const rel = relative(base, normalized);
			if (rel !== "" && !rel.startsWith("../") && !rel.startsWith("..\\") && !rel.startsWith(".." + sep) && rel !== ".." && !isAbsolute(rel)) return root;
		} else {
			if (normalized === base) return root;
			if (normalized.startsWith(base + sep) || normalized.startsWith(base + "/") || normalized.startsWith(base + "\\")) return root;
			const rel = relative(base, normalized);
			if (rel !== "" && !rel.startsWith(".." + sep) && !rel.startsWith("../") && !rel.startsWith("..\\") && rel !== ".." && !isAbsolute(rel)) return root;
		}
	}
}
/** Discovery-file shapes the hub may rewrite: `<name>/SKILL.md` and `<name>.md`. */
function discoveryLeafKind(path) {
	const leaf = basename(resolve(path));
	if (leaf === "SKILL.md") return "bundle";
	if (/[^.]\.md$/.test(leaf)) return "flat";
}
/**
* Whether a path is a skill discovery file whose invocation policy the hub may
* rewrite: a top-level entry of a user root, or
* `<workspace>/.dsh|.agents/skills/<name>/SKILL.md`. Nested/arbitrary files are
* refused — the write lands on real skill files only.
*/
function editableSkillFile(path, home = dshHome()) {
	const absolute = resolve(path);
	const kind = discoveryLeafKind(absolute);
	if (kind === void 0) return false;
	const segments = (value) => resolve(value).split(/[\\/]+/).filter((segment) => segment !== "");
	const leafSegments = segments(absolute);
	const root = rootOfPath(absolute, home);
	if (root !== void 0) {
		const relativeSegments = leafSegments.slice(segments(rootPath(root, home)).length);
		return kind === "bundle" ? relativeSegments.length === 2 : relativeSegments.length === 1;
	}
	const at = leafSegments.findIndex((segment, index) => (segment === ".dsh" || segment === ".agents") && leafSegments[index + 1] === "skills");
	if (at < 0) return false;
	const tail = leafSegments.length - (at + 2);
	return kind === "bundle" ? tail === 2 : tail === 1;
}
// src/skillfs/body.ts
/**
* 技能正文的拆分与写回：SKILL.md = frontmatter + 正文。
*
* 面板只编辑正文——frontmatter（name / description / 调用键）原样留在文件里，
* 由详情页的调用方式 checkbox 与新建模板负责。这里的两个纯函数就是那条边界
* 的全部实现：保存时把文件切成 head + rest，写回 head + 新正文。
*
* 换行风格跟随原文件：CRLF 文件写回 CRLF，LF 文件写回 LF；正文按行尾 trim，
* 末尾统一收一个换行（原文是「正文 + 换行」的常规形态）。
*/
/** closing `---` 行的结束位置（不含其后的换行）。 */
const FRONTMATTER_END = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/;
/** 把 SKILL.md 切成 frontmatter 与它后面的正文；没有 frontmatter 时 undefined。 */
function splitSkillFile(text) {
	const match = FRONTMATTER_END.exec(text);
	if (match === null) return void 0;
	return {
		head: match[0],
		rest: text.slice(match[0].length)
	};
}
/**
* 用新正文替换 SKILL.md 的正文，frontmatter 逐字节保留。
* @param text - 磁盘上的原文件内容。
* @param body - 编辑器里的正文（允许带尾部换行）。
* @returns 写回用的整份文本 + 实际落盘的正文（已按行尾 trim、换行统一）；
*  原文件没有 frontmatter 时返回错误（不猜、不整份重写）。
*
* frontmatter 与正文之间的空行跟随原文件：原来隔一个空行就还隔一个空行，
* 原来紧贴就还紧贴——保存不该顺手改掉用户没碰的排版。
*/
function replaceSkillBody(text, body) {
	const parts = splitSkillFile(text);
	if (parts === void 0) return { error: "skill file has no YAML frontmatter to preserve" };
	const eol = parts.head.includes("\r\n") ? "\r\n" : "\n";
	const gap = parts.rest.startsWith(eol + eol) ? eol + eol : eol;
	const trimmed = body.replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
	return {
		text: trimmed === "" ? parts.head + eol : parts.head + gap + trimmed.split("\n").join(eol) + eol,
		body: trimmed
	};
}
// src/concurrency.ts
/**
* 并发工具：有界并发的 map。原先 repo.ts 与 stats.ts 各有一份实现，
* 这里统一为一份（采用 stats 版本的 limit 夹取，调用点 limit≥1 行为不变）。
*/
/** Run an async worker over items with a bounded concurrency, preserving index order. */
async function mapConcurrent(items, limit, worker) {
	const results = new Array(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await worker(items[index], index);
		}
	});
	await Promise.all(runners);
	return results;
}
// src/skillfs/scan.ts
/**
* Scan one skills root for discovery files: directory bundles (SKILL.md)
* and flat <name>.md files. `.disabled` files (legacy renames left on disk by
* older hub builds) are excluded; dot-prefixed entries (including .trash and
* .system) are always skipped.
*/
async function scanRoot(base) {
	const entries = [];
	let names;
	try {
		names = await readdir(base);
	} catch (error) {
		if (error.code === "ENOENT") return entries;
		throw error;
	}
	for (const name of names) {
		if (name.startsWith(".")) continue;
		const absolute = join(base, name);
		let stats;
		try {
			stats = await stat(absolute);
		} catch {
			continue;
		}
		if (stats.isDirectory()) entries.push({
			path: join(absolute, "SKILL.md"),
			directory: absolute,
			kind: "directory"
		});
		else if (name.endsWith(".md") && !name.endsWith(".md.disabled")) entries.push({
			path: absolute,
			directory: base,
			kind: "flat"
		});
	}
	return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
/** Scan one writable root. */
function listSkillEntries(root, home = dshHome()) {
	return scanRoot(rootPath(root, home));
}
/** Read UI metadata from `agents/openai.yaml` beside a directory skill (mirrors codex SkillInterface). */
async function readSkillInterface(directory) {
	const yamlPath = join(directory, "agents", "openai.yaml");
	let text;
	try {
		text = await readFile(yamlPath, "utf8");
	} catch {
		return;
	}
	let data;
	try {
		data = load(text);
	} catch {
		return;
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) return void 0;
	const record = data;
	const iface = record.interface ?? record;
	const ifaceObj = typeof record.interface === "object" && record.interface !== null && !Array.isArray(record.interface) ? record.interface : iface;
	const cleanStr = (value, maxLen) => {
		if (typeof value !== "string") return void 0;
		const cleaned = value.split(/\s+/).join(" ").trim();
		if (cleaned === "" || cleaned.length > maxLen) return void 0;
		return cleaned;
	};
	const hexColor = (value) => {
		if (typeof value !== "string") return void 0;
		const trimmed = value.trim();
		return HEX_COLOR_RE.test(trimmed) ? trimmed : void 0;
	};
	const iconPath = (value) => {
		if (typeof value !== "string" || value.trim() === "") return void 0;
		const trimmed = value.trim().replace(/\\/g, "/");
		if (trimmed.startsWith("/") || trimmed.includes("..")) return void 0;
		if (!trimmed.startsWith("assets/")) return void 0;
		return trimmed;
	};
	const displayName = cleanStr(ifaceObj.display_name, 64);
	const shortDescription = cleanStr(ifaceObj.short_description, 1024);
	const brandColor = hexColor(ifaceObj.brand_color);
	const defaultPrompt = cleanStr(ifaceObj.default_prompt, 1024);
	const iconSmall = iconPath(ifaceObj.icon_small);
	const iconLarge = iconPath(ifaceObj.icon_large);
	if (!(displayName !== void 0 || shortDescription !== void 0 || brandColor !== void 0 || iconSmall !== void 0 || iconLarge !== void 0 || defaultPrompt !== void 0)) return void 0;
	return {
		...displayName !== void 0 ? { displayName } : {},
		...shortDescription !== void 0 ? { shortDescription } : {},
		...brandColor !== void 0 ? { brandColor } : {},
		...iconSmall !== void 0 ? { iconSmall } : {},
		...iconLarge !== void 0 ? { iconLarge } : {},
		...defaultPrompt !== void 0 ? { defaultPrompt } : {}
	};
}
/**
* Walk up from cwd (max 32 levels) for a project marker (.dsh or .git);
* falls back to cwd itself. The provider roots project skills here.
*/
async function findProjectRoot(cwd) {
	let current = resolve(cwd);
	for (let depth = 0; depth < 32; depth += 1) {
		if ((await Promise.allSettled([stat(join(current, ".dsh")), stat(join(current, ".git"))])).some((marker) => marker.status === "fulfilled")) return current;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return resolve(cwd);
}
/**
* Scan one writable root for files the provider ignores, so the GUI can show
* why a skill never appears — a missing frontmatter, a name that disagrees
* with the discovery path, and the like must be visible, not silent. Legacy
* `.disabled` files left on disk are skipped: they are not a defect.
*/
async function scanDiagnostics(root, home = dshHome()) {
	const entries = await listSkillEntries(root, home);
	const discovered = [];
	const perEntry = await mapConcurrent(entries, 8, async (entry) => {
		const found = [];
		let text;
		try {
			text = await readFile(entry.path, "utf8");
		} catch (error) {
			if (error.code !== "ENOENT") found.push({
				path: entry.path,
				root,
				reason: "unreadable: " + errorText(error)
			});
			return found;
		}
		const parsed = parseFrontmatter(text);
		if ("error" in parsed) {
			const fixable = repairFrontmatterFileText(text) !== null;
			found.push({
				path: entry.path,
				root,
				reason: parsed.error,
				...fixable ? { fixable: true } : {}
			});
			return found;
		}
		if (repairFrontmatterFileText(text) !== null) found.push({
			path: entry.path,
			root,
			reason: "frontmatter contains unquoted colon/bracket (auto-repaired in memory; click Fix to persist)",
			fixable: true
		});
		const { value } = parsed;
		const pathName = entry.kind === "directory" ? basename(entry.directory) : basename(entry.path, ".md");
		discovered.push({
			path: entry.path,
			keys: [.../* @__PURE__ */ new Set([pathName, value.name])]
		});
		if (value.name !== pathName) found.push({
			path: entry.path,
			root,
			reason: `frontmatter name "${value.name}" does not match the discovery path "${pathName}" (the provider registers by path)`
		});
		if (value.description.length < 10) found.push({
			path: entry.path,
			root,
			reason: `description is only ${value.description.length} chars; write a one-line description so agents can auto-activate this skill`
		});
		return found;
	});
	const owners = /* @__PURE__ */ new Map();
	for (const item of discovered) for (const key of item.keys) {
		const list = owners.get(key);
		if (list === void 0) owners.set(key, [item.path]);
		else list.push(item.path);
	}
	const collisions = [];
	for (const item of discovered) {
		const shared = item.keys.filter((key) => (owners.get(key)?.length ?? 0) > 1);
		if (shared.length === 0) continue;
		collisions.push({
			path: item.path,
			root,
			reason: `another skill in this root registers the same name (${shared.map((key) => "\"" + key + "\"").join(", ")}); the registry keeps only one of them, so this one is unreachable — delete or rename one of the two`
		});
	}
	return [...perEntry.flat(), ...collisions];
}
/** stat 一次给出形态；不存在或不可读时 undefined。 */
async function statKind(path) {
	try {
		return (await stat(path)).isDirectory() ? "directory" : "file";
	} catch {
		return;
	}
}
/** 读一个名字在某个 skills root 下的全部占位。只读，不修改磁盘。 */
async function occupancyOf(base, name) {
	const bundleDir = join(base, name);
	const bundleSkill = join(bundleDir, "SKILL.md");
	const bundleDisabled = join(bundleDir, "SKILL.md.disabled");
	const flatSkill = join(base, name + ".md");
	const flatDisabled = join(base, name + ".md.disabled");
	const [bundleSkillKind, bundleDisabledKind, flatSkillKind, flatDisabledKind, bundleDirKind] = await Promise.all([
		statKind(bundleSkill),
		statKind(bundleDisabled),
		statKind(flatSkill),
		statKind(flatDisabled),
		statKind(bundleDir)
	]);
	const result = {
		enabled: [],
		disabled: []
	};
	if (bundleSkillKind === "file") result.enabled.push(bundleSkill);
	if (flatSkillKind === "file") result.enabled.push(flatSkill);
	if (bundleDisabledKind === "file") result.disabled.push(bundleDisabled);
	if (flatDisabledKind === "file") result.disabled.push(flatDisabled);
	if (bundleDirKind === "directory" && bundleSkillKind !== "file" && bundleDisabledKind !== "file") result.bareDir = bundleDir;
	return result;
}
// src/skillfs.ts
/**
* Skill filesystem operations for the writable roots and the hub provider's
* discovery. Discovery reads `SKILL.md` inside a directory bundle or the flat
* `<name>.md`; the preset's official filesystem provider watches the same
* files.
*
* Frontmatter parsing mirrors @deepseek-ai/dsh-skill-filesystem semantics:
* required name (kebab-case) + description, optional whenToUse, invocation
* booleans with the same defaults (modelInvocable defaults true,
* userInvocable defaults true), legacy keys rejected, and the returned
* content is the body after the frontmatter block, trimmed.
*/
const execFileAsync = promisify(execFile);
/**
* Scaffold a directory-bundle skill: <root>/<name>/SKILL.md with a frontmatter
* template. Refuses non-kebab-case names.
* @returns the created SKILL.md path.
*/
async function createSkill(root, name, description, home = dshHome()) {
	if (!isSkillName(name)) throw new TypeError("skill name must be kebab-case (lowercase letters, digits, dashes): \"" + name + "\"");
	const dir = join(rootPath(root, home), name);
	const file = join(dir, "SKILL.md");
	await mkdir(dir, { recursive: true });
	const safeDescription = description.trim() === "" ? "New dsh skill created from the skill hub." : description.trim();
	const body = [
		"---",
		"name: " + dump(name).trim(),
		"description: " + dump(safeDescription).trim(),
		"---",
		"",
		"# " + name,
		"",
		"Describe what this skill does, when the agent should use it, and what output is expected.",
		""
	].join("\n");
	await writeFile(file, body, "utf8");
	return file;
}
/**
* Move one already-resolved skill (a bundle directory or a flat .md file) into
* its root's trash as `<root>/.trash/<name>-<timestamp>`.
*
* The layout is the restore contract, not an implementation detail:
* `restoreSkill` renames the entry back and only proves the parent is `.trash`,
* and `clearTrash` deletes in place. Every producer of a trash entry must go
* through here — skill delete, the hub-disabled whole-group delete, and repo
* import's placeholder replacement all move skills for the same recovery flow.
*
* @returns the trashed path plus the original path that was moved.
*/
async function moveIntoTrash(source) {
	const trashDir = join(dirname(source), ".trash");
	await mkdir(trashDir, { recursive: true });
	const target = join(trashDir, basename(source) + "-" + Date.now());
	await rename(source, target);
	return {
		path: target,
		source
	};
}
/**
* The filesystem entry behind a discovery file: a directory bundle is addressed
* by its `SKILL.md` and moved as a whole directory, a flat `<name>.md` file is
* moved as itself. Single definition of that mapping — delete, restore,
* sync-replace and placeholder retirement must all agree on it, or one of them
* moves a bundle's discovery file and leaves an empty directory.
*/
function trashSourceOf(discoveryPath) {
	const base = basename(discoveryPath);
	return base === "SKILL.md" || base === "SKILL.md.disabled" ? dirname(discoveryPath) : discoveryPath;
}
/**
* Move a skill (directory bundle or flat .md file) into the root's trash.
* The skill stays recoverable: the source is renamed into
* <root>/.trash/<name>-<timestamp>. A directory bundle is addressed by its
* SKILL.md (or SKILL.md.disabled) path and moved as a whole directory.
* @returns the trashed path plus the original path that was moved.
*/
async function trashSkill(sourcePath) {
	return moveIntoTrash(trashSourceOf(sourcePath));
}
/** Whether a path needs `exists`-style probing (trash naming, reveal checks). */
async function pathExists$1(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
/**
* The user's system trash directory: macOS `~/.Trash`, Linux XDG
* `~/.local/share/Trash/files`. Windows has no filesystem-level Recycle Bin,
* so the caller gets a TypeError it can surface as a clear refusal.
*/
function systemTrashDir(home = homedir()) {
	if (process.platform === "darwin") return join(home, ".Trash");
	if (process.platform === "win32") throw new TypeError("the system trash is not reachable from a plugin on Windows");
	return join(home, ".local", "share", "Trash", "files");
}
/**
* First free target for an entry inside the trash: the plain name when it is
* free, otherwise `<name>-<timestamp>`, then `-2`, `-3`… for the (unlikely)
* case of two trashes within the same millisecond. Never overwrite.
*/
async function freeTrashTarget(dir, base) {
	const plain = join(dir, base);
	if (!await pathExists$1(plain)) return plain;
	const stamp = Date.now();
	const stamped = join(dir, base + "-" + stamp);
	if (!await pathExists$1(stamped)) return stamped;
	for (let n = 2;; n += 1) {
		const candidate = stamped + "-" + n;
		if (!await pathExists$1(candidate)) return candidate;
	}
}
/**
* Move one skill entry (bundle directory or flat .md) into the system trash.
* A same-named entry already in the trash gains a timestamp suffix instead of
* being overwritten — deleting must never destroy an earlier trash item.
* @returns the path inside the trash.
*/
async function trashSkillToSystem(source, trashDir = systemTrashDir()) {
	await mkdir(trashDir, { recursive: true });
	const target = await freeTrashTarget(trashDir, basename(source));
	await rename(source, target);
	return target;
}
/** Whether a path lives inside an asar archive (the app bundle ships these). */
function isBundledPath(path) {
	return /\.asar[\\/]/.test(path);
}
/**
* Show one file or directory in the OS file manager: Finder selects it
* (`open -R`), Explorer selects it, and Linux desktops open its folder.
*/
async function revealInFileManager(path) {
	if (process.platform === "darwin") {
		await execFileAsync("open", ["-R", path]);
		return;
	}
	if (process.platform === "win32") {
		await execFileAsync("explorer.exe", ["/select," + path]);
		return;
	}
	await execFileAsync("xdg-open", [dirname(path)]);
}
/** Restore a trashed skill (directory or flat file) to its original location. */
async function restoreSkill(entry, home = dshHome()) {
	if (basename(dirname(entry.path)) !== ".trash") throw new TypeError("not a trashed skill path: " + entry.path);
	const target = entry.sourcePath ?? join(dirname(dirname(entry.path)), entry.name);
	if (entry.sourcePath !== void 0 && rootOfPath(entry.sourcePath, home) === void 0) throw new TypeError("not a hub writable skill path: " + entry.sourcePath);
	await rename(entry.path, target);
	return target;
}
/** Permanently delete one trashed skill (directory or flat file). */
async function clearTrash(entry, home = dshHome()) {
	if (basename(dirname(entry.path)) !== ".trash" || rootOfPath(dirname(dirname(entry.path)), home) === void 0) throw new TypeError("not a hub trashed skill path: " + entry.path);
	await rm(entry.path, {
		recursive: true,
		force: true
	});
	return entry.path;
}
/** Repair one file on disk when its frontmatter is auto-fixable. Returns the new text.
*
* The write is atomic (sibling temp file + rename), matching the sidecar's
* persist path: this rewrites a real skill file in place, and a crash midway
* through a plain write would leave a truncated SKILL.md — exactly the failure
* the store layer already guards against. The `.tmp` sibling is never picked
* up by discovery (only `SKILL.md` and `*.md` are scanned).
*/
async function fixDiagnosticFile(path, home = dshHome()) {
	if (rootOfPath(path, home) === void 0) throw new TypeError("not a hub writable skill path: " + path);
	const repairedText = repairFrontmatterFileText(await readFile(path, "utf8"));
	if (repairedText === null) throw new TypeError("diagnostic is not auto-fixable: " + path);
	const parsed = parseFrontmatter(repairedText);
	if ("error" in parsed) throw new TypeError("repaired frontmatter still invalid: " + parsed.error);
	const tmp = path + ".tmp";
	await writeFile(tmp, repairedText, "utf8");
	try {
		await rename(tmp, path);
	} catch (error) {
		await rm(tmp, { force: true }).catch(() => {});
		throw error;
	}
	return path;
}
/**
* Rewrite a skill file's invocation keys (dsh has no registry setter — the
* frontmatter is the source of truth every provider parses).
*
* Refuses anything that is not a top-level discovery file of a user root or a
* project root (`editableSkillFile`), refuses when the patch would not
* round-trip, and writes atomically like {@link fixDiagnosticFile}: a torn
* SKILL.md is invisible to discovery and would read as a deleted skill.
*
* @returns the absolute path that was rewritten.
*/
async function setInvocationPolicy(path, policy, home = dshHome()) {
	if (!editableSkillFile(path, home)) throw new TypeError("not an editable skill file: " + path);
	const text = await readFile(path, "utf8");
	const patched = setInvocationInText(text, policy);
	if ("error" in patched) throw new TypeError("cannot rewrite invocation policy: " + patched.error);
	if (patched.text === text) return path;
	const tmp = path + ".tmp";
	await writeFile(tmp, patched.text, "utf8");
	try {
		await rename(tmp, path);
	} catch (error) {
		await rm(tmp, { force: true }).catch(() => {});
		throw error;
	}
	return path;
}
// src/repo/github-client.ts
/**
* GitHub API 统一请求层：token 管理、鉴权头、ETag 缓存、错误映射、
* 带缓存的 JSON GET。从 repo.ts 抽出，原 6 处重复的 try/catch +
* headers + json 解析收敛到 fetchJson / fetchJsonCached 两个入口。
*/
/** Fetch failure carrying a useful HTTP status for the route layer. */
var RepoFetchError = class extends Error {
	status;
	constructor(message, status = 502) {
		super(message);
		this.name = "RepoFetchError";
		this.status = status;
	}
};
/**
* GitHub token for authenticated API calls. Read from GITHUB_TOKEN /
* GH_TOKEN at module load; setGithubToken() overrides it at runtime (the
* host calls it from the settings sync whenever the card value changes;
* an absent value falls back to the env var).
*/
let githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
/** Override the GitHub token at runtime ('' falls back to the env var). */
function setGithubToken(token) {
	githubToken = token !== void 0 && token !== "" ? token : process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
}
/** Authorization header for api.github.com / raw.githubusercontent.com calls. */
function githubAuthHeaders() {
	return githubToken === "" ? {} : { authorization: "Bearer " + githubToken };
}
/**
* 传输层：显式要求服务端返回未压缩实体。
*
* 为什么必须加：dsh 会把**启动环境**里的 `HTTP_PROXY`/`HTTPS_PROXY` 装成
* undici 的全局 dispatcher（`@deepseek-ai/dsh-http-proxy`），插件里的 `fetch`
* 因此走该代理。实测本机 Clash：经代理返回的响应会**丢掉 `content-encoding`
* 与 `content-type` 头，而 body 仍是 gzip**；undici 只依据 `content-encoding`
* 决定是否解压，于是 `response.json()` 拿到 gzip 二进制并抛错，被上层的
* catch 映射成 `invalid github response for <url>` —— 看起来像 GitHub 坏了。
* 实测对照（同一 URL、同一代理）：默认 1331 字节解析失败，声明 identity 后
* 5245 字节解析成功。
*
* 代价是不走压缩（我们的响应体都很小），换来的是**无论中间代理是否改写头部
* 都能正确取到实体**，且用户无需为插件调整启动命令。
*/
const NO_COMPRESSION = { "accept-encoding": "identity" };
/** JSON API 默认请求头（含鉴权）。 */
function apiHeaders() {
	return {
		accept: "application/vnd.github+json",
		...NO_COMPRESSION,
		...githubAuthHeaders()
	};
}
/** ETag cache for GitHub API JSON (mirrors codex lib.rs marker+fingerprint). In-memory only, saves 304 for daily checks. */
const etagCache = /* @__PURE__ */ new Map();
const ETAG_MAX = 200;
function etagCacheSet(url, etag, json) {
	if (etagCache.size >= ETAG_MAX) {
		const first = etagCache.keys().next().value;
		if (first !== void 0) etagCache.delete(first);
	}
	etagCache.set(url, {
		etag,
		json
	});
}
/**
* When the response shows an exhausted GitHub rate limit, the instant it
* resets; otherwise undefined. Shared by the repo fetch layer and the plugin's
* own update check so both agree on what counts as a rate-limit rejection
* (403/429 + `x-ratelimit-remaining: 0` + a parseable `x-ratelimit-reset`)
* instead of each re-deriving it from the headers.
*/
function rateLimitResetAt(response) {
	if (response.status !== 403 && response.status !== 429) return void 0;
	if (response.headers.get("x-ratelimit-remaining") !== "0") return void 0;
	const reset = response.headers.get("x-ratelimit-reset");
	if (reset === null) return void 0;
	const at = /* @__PURE__ */ new Date(Number(reset) * 1e3);
	return Number.isNaN(at.getTime()) ? void 0 : at;
}
/**
* Build a RepoFetchError; when the response shows an exhausted rate limit,
* report the reset time instead of a bare HTTP status.
*/
function fetchError(context, response, fallbackStatus = 502) {
	const resetAt = rateLimitResetAt(response);
	if (resetAt !== void 0) return new RepoFetchError("github rate limit reached (anonymous quota exhausted); retry after " + resetAt.toLocaleTimeString() + " or set GITHUB_TOKEN", 403);
	return new RepoFetchError(context + " (HTTP " + response.status + ")", response.status === 404 ? 404 : fallbackStatus);
}
/** 是否限流/中断类错误（调用方可直接透出，不再包装）。 */
function isAbortError(error) {
	return error instanceof Error && (error.name === "AbortError" || error.message.includes("aborted") || error.message.includes("Abort"));
}
/**
* 不带缓存的统一 GET+JSON：网络异常、非 2xx、坏 JSON 全部映射为
* RepoFetchError，调用方无需重复写 try/catch。
*/
async function fetchJson(url, fetchImpl, context, headers = apiHeaders()) {
	let response;
	try {
		response = await fetchImpl(url, { headers });
	} catch (error) {
		if (isAbortError(error)) throw error;
		throw new RepoFetchError(context + ": " + errorText(error));
	}
	if (!response.ok) throw fetchError(context, response);
	try {
		return {
			json: await response.json(),
			response
		};
	} catch {
		throw new RepoFetchError("invalid github response for " + url);
	}
}
/**
* Load one JSON document from the GitHub API, reusing an ETag when the URL was
* fetched before. `fetchImpl`/`context` exist so callers can stub the transport
* and shape the error text; the payload is whatever the endpoint returned.
*/
async function fetchJsonCached(url, fetchImpl, context) {
	const cached = etagCache.get(url);
	const headers = { ...apiHeaders() };
	if (cached !== void 0) headers["if-none-match"] = cached.etag;
	let response;
	try {
		response = await fetchImpl(url, { headers });
	} catch (error) {
		throw new RepoFetchError(context + ": " + errorText(error));
	}
	if (response.status === 304 && cached !== void 0) return {
		json: cached.json,
		response
	};
	if (!response.ok) throw fetchError(context, response);
	let json;
	try {
		json = await response.json();
	} catch {
		throw new RepoFetchError("invalid github response for " + url);
	}
	const etag = response.headers.get("etag");
	if (etag !== null && etag !== "") etagCacheSet(url, etag, json);
	return {
		json,
		response
	};
}
// src/repo/api.ts
/**
* GitHub 仓库读取：仓库树、发布标签、星标/下载量、分支与提交查询。
* 统一走 repo/github-client.ts 的请求层（鉴权、ETag 缓存、错误映射）。
* 从 repo.ts 抽出。
*/
async function loadRepoTree(repo, ref, fetchImpl = fetch) {
	const { json: metaJson } = await fetchJsonCached(`https://api.github.com/repos/${repo}`, fetchImpl, "github repo not found or unavailable");
	let meta = metaJson;
	const record = typeof meta === "object" && meta !== null ? meta : {};
	const defaultBranch = typeof record.default_branch === "string" && record.default_branch !== "" ? record.default_branch : "main";
	const treeRef = ref !== void 0 && ref !== "" ? ref : defaultBranch;
	const { json: payload } = await fetchJsonCached(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`, fetchImpl, "github tree not found");
	const treeRecord = typeof payload === "object" && payload !== null ? payload : {};
	const truncated = treeRecord.truncated === true;
	return {
		ref: treeRef,
		tree: Array.isArray(treeRecord.tree) ? treeRecord.tree : [],
		truncated
	};
}
/**
* The latest non-prerelease release tag of a repo, or undefined when the
* repo has no releases (GitHub's /releases/latest skips prereleases/drafts).
*/
async function getLatestReleaseTag(repo, fetchImpl = fetch) {
	let payload;
	try {
		({json: payload} = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`, fetchImpl, "github release lookup failed"));
	} catch (error) {
		if (error instanceof RepoFetchError && error.status === 404) return void 0;
		throw error;
	}
	const tag = typeof payload === "object" && payload !== null ? payload.tag_name : void 0;
	return typeof tag === "string" && tag !== "" ? tag : void 0;
}
/** Stars + release-asset downloads of a repo (two GitHub API requests). */
async function getRepoStats(repo, fetchImpl = fetch) {
	const headers = apiHeaders();
	const { json: meta } = await fetchJson(`https://api.github.com/repos/${repo}`, fetchImpl, "github repo not found or unavailable", headers);
	const stars = typeof meta === "object" && meta !== null && typeof meta.stargazers_count === "number" ? meta.stargazers_count : 0;
	let downloads = 0;
	try {
		const relResponse = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=20`, { headers });
		if (relResponse.ok) {
			const releases = await relResponse.json();
			if (Array.isArray(releases)) for (const item of releases) {
				if (typeof item !== "object" || item === null) continue;
				const assets = item.assets;
				if (!Array.isArray(assets)) continue;
				for (const asset of assets) if (typeof asset === "object" && asset !== null && typeof asset.download_count === "number") downloads += asset.download_count;
			}
		}
	} catch {}
	return {
		stars,
		downloads
	};
}
/** Release tags of a repo, newest first (skips drafts, keeps prereleases). */
async function listRepoReleases(repo, fetchImpl = fetch) {
	const { json: payload } = await fetchJson(`https://api.github.com/repos/${repo}/releases?per_page=20`, fetchImpl, "github releases lookup failed");
	if (!Array.isArray(payload)) return [];
	return payload.filter((item) => typeof item === "object" && item !== null && item.draft !== true).map((item) => item.tag_name).filter((tag) => typeof tag === "string" && tag !== "");
}
/** Branch names of a repo, default branch first (one GitHub API request). */
async function listRepoBranches(repo, fetchImpl = fetch) {
	const { json: payload } = await fetchJson(`https://api.github.com/repos/${repo}/branches?per_page=100`, fetchImpl, "github branches lookup failed");
	if (!Array.isArray(payload)) return [];
	return payload.map((item) => typeof item === "object" && item !== null ? item.name : void 0).filter((name) => typeof name === "string" && name !== "");
}
/**
* Fetch the latest commit of a repo (explicit ref or default branch) with
* its tree SHA. One GitHub API request; the tree SHA is used to diff the
* upstream tree on change (one extra request).
*/
async function getLatestCommit(repo, ref, fetchImpl = fetch) {
	const { json: payload } = await fetchJson(ref !== void 0 && ref !== "" ? `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}` : `https://api.github.com/repos/${repo}/commits?per_page=1`, fetchImpl, "github commit lookup failed");
	const record = Array.isArray(payload) ? payload[0] ?? {} : typeof payload === "object" && payload !== null ? payload : {};
	const commitSha = typeof record.sha === "string" && record.sha !== "" ? record.sha : null;
	const tree = typeof record.commit === "object" && record.commit !== null ? record.commit.tree : void 0;
	const treeSha = typeof tree?.sha === "string" && tree.sha !== "" ? tree.sha : null;
	if (commitSha === null || treeSha === null) throw new RepoFetchError("github commit response has no sha/tree");
	return {
		commitSha,
		treeSha
	};
}
/** Load the recursive git tree at an explicit tree SHA (one API request). */
async function loadRepoTreeAt(repo, treeSha, fetchImpl = fetch) {
	const { json: payload } = await fetchJson(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`, fetchImpl, "github tree lookup failed");
	const record = typeof payload === "object" && payload !== null ? payload : {};
	if (record.truncated === true) throw new RepoFetchError("repo tree is too large to scan");
	return Array.isArray(record.tree) ? record.tree : [];
}
// src/repo/install.ts
/**
* 技能目录下载与落地：单文件下载（raw 优先、contents 兜底）、整目录
* 临时目录 + 原子 rename、启动时清理残留导入临时目录。
* 从 repo.ts 抽出。
*/
/**
* Download one GitHub file as a buffer. Tries raw.githubusercontent.com
* first (no API quota); on any failure falls back to the api.github.com
* contents endpoint with the raw media type (rate-limited, but reachable
* from networks that block the raw host).
*/
async function downloadGitHubFile(repo, ref, path, fetchImpl = fetch, signal) {
	if (signal?.aborted) throw new DOMException("aborted", "AbortError");
	const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
	const rawUrl = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${encodedPath}`;
	let firstError = null;
	let response = null;
	try {
		response = await fetchImpl(rawUrl, {
			headers: {
				...NO_COMPRESSION,
				...githubAuthHeaders()
			},
			...signal !== void 0 ? { signal } : {}
		});
	} catch (error) {
		if (isAbortError(error)) throw error;
		firstError = errorText(error);
	}
	if (response === null || !response.ok) {
		if (signal?.aborted) throw new DOMException("aborted", "AbortError");
		const apiUrl = `https://api.github.com/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
		try {
			response = await fetchImpl(apiUrl, {
				headers: {
					accept: "application/vnd.github.raw",
					...NO_COMPRESSION,
					...githubAuthHeaders()
				},
				...signal !== void 0 ? { signal } : {}
			});
		} catch (error) {
			if (isAbortError(error)) throw error;
			throw new RepoFetchError("download failed: " + (firstError ?? errorText(error)));
		}
	}
	if (response === null || !response.ok) throw fetchError("download failed", response);
	try {
		return Buffer.from(await response.arrayBuffer());
	} catch (error) {
		if (isAbortError(error)) throw error;
		throw new RepoFetchError("download read failed: " + errorText(error));
	}
}
/**
* Download a full skill directory into a temporary dir, validate SKILL.md,
* then atomically rename it into place. The target root is created when missing.
* Callers pass a target root and a skill entry plus its collected files.
*/
async function downloadRepoSkill(repo, ref, entry, files, targetRoot, fetchImpl = fetch, signal, onProgress) {
	if (signal?.aborted) throw new DOMException("aborted", "AbortError");
	const targetDir = join(targetRoot, entry.name);
	await mkdir(targetRoot, { recursive: true });
	const tempDir = await mkdtemp(join(targetRoot, "." + entry.name + ".import-"));
	let renamed = false;
	try {
		await mapConcurrent(files, 6, async (file) => {
			if (signal?.aborted) throw new DOMException("aborted", "AbortError");
			const relative = relativeToSkillDir(entry.dir, file.path);
			if (relative === "" || relative.includes("..")) throw new RepoFetchError("unsafe repo path: " + file.path);
			const target = join(tempDir, relative);
			const buffer = await downloadGitHubFile(repo, ref, file.path, fetchImpl, signal);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, buffer);
			onProgress?.(buffer.length, relative);
		});
		if (signal?.aborted) throw new DOMException("aborted", "AbortError");
		let text;
		try {
			text = await readFile(join(tempDir, "SKILL.md"), "utf8");
		} catch {
			throw new RepoFetchError("downloaded skill has no SKILL.md");
		}
		const parsed = parseFrontmatter(text);
		if ("error" in parsed) throw new RepoFetchError("downloaded skill rejected: " + parsed.error, 422);
		if (parsed.value.name !== entry.name) throw new RepoFetchError("downloaded skill declares name \"" + parsed.value.name + "\", expected \"" + entry.name + "\"", 422);
		await rename(tempDir, targetDir);
		renamed = true;
		return {
			targetDir,
			skillPath: join(targetDir, "SKILL.md")
		};
	} finally {
		if (!renamed) try {
			await rm(tempDir, {
				recursive: true,
				force: true
			});
		} catch (firstError) {
			await new Promise((resolve) => setTimeout(resolve, 60));
			try {
				await rm(tempDir, {
					recursive: true,
					force: true
				});
			} catch (secondError) {
				console.warn(`[dsh-skill-hub] cleanup tempDir failed ${tempDir}:`, errorText(secondError), "first:", errorText(firstError));
			}
		}
	}
}
/**
* 启动时扫描并清理残留的 `.*.import-*` 临时目录（Issue #3 第4点）。
* 越积越多的点前缀目录不会显示为 skill，但会占空间，尽早回收。
*/
async function cleanupLeftoverImportDirs(targetRoot) {
	const { readdir, rm: rm2 } = await import("node:fs/promises");
	let names;
	try {
		names = await readdir(targetRoot);
	} catch {
		return 0;
	}
	let cleaned = 0;
	for (const name of names) {
		if (!/^\..*\.import-/.test(name)) continue;
		const full = join(targetRoot, name);
		try {
			await rm2(full, {
				recursive: true,
				force: true
			});
			cleaned += 1;
		} catch (error) {
			console.warn(`[dsh-skill-hub] startup cleanup failed ${full}:`, errorText(error));
		}
	}
	if (cleaned > 0) console.warn(`[dsh-skill-hub] startup cleaned ${cleaned} leftover import temp dir(s) in ${targetRoot}`);
	return cleaned;
}
// src/routes/http.ts
/**
* routes 共享层 · HTTP 围栏：请求信任栅栏（复用宿主 `/api` 模型，见 RouteFence）、
* JSON 响应与错误映射、请求体读取、查询/字段读取与文件存在性检查。
*/
/** Cap on JSON request bodies (create/config payloads are tiny). */
const MAX_JSON_BODY_BYTES = 65536;
/** Loopback literal check plus browser same-origin markers. */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL("http://" + host);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/**
* Fallback fence for a host that mounts no Connection service (unit tests, and
* any composition serving the webserver alone): the historical literal-loopback
* check, so a missing service degrades to the previous behaviour instead of an
* open or a dead route family.
*/
function loopbackOnlyFence(request) {
	return isLoopbackRequest(request) ? void 0 : 403;
}
/** One JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(payload);
}
/** One JSON error response. */
function writeError(res, status, error) {
	writeJson(res, status, { error: errorText(error) });
}
/** HTTP status per store business-rule kind (user error, not server fault). */
const STORE_ERROR_STATUS = {
	validation: 400,
	"not-found": 404,
	conflict: 409
};
/** Map known error types onto HTTP statuses: repo fetch + store business rules. */
function writeRouteError(res, error) {
	if (error instanceof RepoFetchError) {
		writeError(res, error.status, error);
		return;
	}
	if (error instanceof StoreError) {
		writeError(res, STORE_ERROR_STATUS[error.kind], error);
		return;
	}
	writeError(res, 500, error);
}
/**
* Read a JSON request body (undefined when too large or unparseable).
* @param req - inbound request.
* @param limit - byte cap; a route that carries file text passes its own.
*/
async function readJsonBody(req, limit = MAX_JSON_BODY_BYTES) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > limit) return void 0;
		chunks.push(buffer);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null ? parsed : void 0;
	} catch {
		return;
	}
}
/** URL query helper (first value, decoded). */
function queryParam(url, name) {
	const value = url.searchParams.get(name);
	return value === null ? void 0 : value;
}
/**
* 读取请求体里的字符串字段（缺失或类型不符返回 ''）。替代各 handler 里
* `body as unknown as XRequest` 的断言 + 手写 typeof 收窄。
*/
function readString(body, key) {
	const value = body[key];
	return typeof value === "string" ? value : "";
}
/**
* 读取请求体里的字符串数组：非数组返回 []，丢弃非字符串项；默认同时丢弃
* 空串（keepEmpty=true 时保留空串，由调用方决定语义）。
*/
function readStrings(body, key, options) {
	const value = body[key];
	if (!Array.isArray(value)) return [];
	const keepEmpty = options?.keepEmpty === true;
	return value.filter((item) => typeof item === "string" && (keepEmpty || item !== ""));
}
/** Async existence check (import/sync use it on the user root). */
async function pathExists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
/** 读取请求体里的数字字段（缺失或类型不符返回 undefined）。 */
function readNumber(body, key) {
	const value = body[key];
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
/**
* 落盘失败的可读回应：文件没了 / 只读 / 目录不可写都是**用户可见的业务
* 拒绝**（409），不是 500 崩溃。返回 true 表示已经写过响应。
*/
function writeFileFailure(res, error, path) {
	const code = error.code;
	if (code === "ENOENT") {
		writeError(res, 409, "file is missing on disk: " + path);
		return true;
	}
	if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
		writeError(res, 409, "file is read-only: " + path);
		return true;
	}
	return false;
}
// src/routes/deps.ts
/** Sources whose files the hub may write (the user-level filesystem roots). */
function isWritableSource(source) {
	return source === "user-dsh" || source === "user-agents";
}
/** The resolved hub config a route sees (the shared resolver fills defaults). */
function configOf(deps) {
	return resolveHubConfig(deps.config?.() ?? {});
}
/**
* The raw saved config layer as persisted in the sidecar, reported for display
* only. Since dsh 0.1.7 the settings namespace is the one user layer, so this
* is legacy data: nothing writes it any more and the effective config above
* never merges it.
*/
function savedOf(deps) {
	return deps.saved?.() ?? {};
}
/** Refuse business routes while the master switch is off (the config route stays up). */
function disabledGate(deps, res) {
	if (configOf(deps).enabled) return false;
	writeError(res, 503, "plugin disabled: enable it from the settings card");
	return true;
}
/** Resolve the home used for writable-root operations. */
function homeOf(deps) {
	return deps.home ?? dshHome();
}
/**
* Resolve a skill by name as something the hub may write, or the exact
* refusal the caller should answer with. Owns the guard sequence shared by
* skill/delete: registry lookup, writable source, writable file, and path
* containment inside a user root.
*/
async function resolveWritableSkill(deps, name, cwd) {
	const lookup = cwd !== void 0 && cwd !== "" ? { cwd } : void 0;
	const skill = await deps.skills.get(name, lookup);
	if (skill === void 0) return {
		ok: false,
		status: 404,
		error: "skill not found: " + name
	};
	if (!isWritableSource(skill.source)) return {
		ok: false,
		status: 409,
		error: "source \"" + skill.source + "\" is managed outside the hub (read-only)"
	};
	if (skill.path === void 0) return {
		ok: false,
		status: 409,
		error: "provider-managed skill has no writable file"
	};
	const root = rootOfPath(skill.path, homeOf(deps));
	if (root === void 0) return {
		ok: false,
		status: 409,
		error: "skill path is outside the hub writable roots"
	};
	return {
		ok: true,
		skill,
		path: skill.path,
		root
	};
}
// src/agents-index.ts
/**
* AGENTS.md 页索引的落盘缓存。
*
* 位置：`$DSH_HOME/plugin/data/custom-instruction-manager/agents-index.json` ——
* 和 state.json、词表缓存在同一个插件数据目录下。
*
* 生命周期：
*   - 插件加载时（包括每次打开 dsh）读一次进内存，面板打开页面立刻有内容；
*   - 每一轮分步扫描完成后原子覆盖写一次，下一次启动读到的就是那一份；
*   - 读不到、JSON 坏了、版本或键对不上，都当作**没有缓存**：页面退化成
*     「无缓存 → 直接从第一轮扫描开始」，功能不受影响（缓存从来不参与写操作）。
*
* 键 = 家目录 + 共享 agents 根 + 排除目录。少了这道校验，用户改了排除目录
* （哪怕是在 dsh 关着的时候改的）之后还会拿旧索引来铺——那正是索引缓存要
* 避免的「拿旧结果当现状」。
*/
/** 索引缓存文件的名字（在插件数据目录下）。 */
const AGENTS_INDEX_FILE = "agents-index.json";
/** 落盘格式版本；形状变了就 +1，旧文件按「没有缓存」处理。 */
const AGENTS_INDEX_VERSION = 1;
/** 缓存文件的绝对路径。 */
function agentsIndexPath(home = dshHome()) {
	return join(pluginDataDir(home), AGENTS_INDEX_FILE);
}
/** 当前依赖下的键。 */
function agentsIndexKey(deps) {
	return {
		home: deps.home ?? dshHome(),
		agentsHome: deps.agentsHome ?? agentsHome(),
		excludeDirs: resolveExcludeDirs(configOf(deps).excludeDirs)
	};
}
/** 内存里的索引缓存键（键的 JSON 串）。 */
function keyOf(deps) {
	return JSON.stringify(agentsIndexKey(deps));
}
/** 当前依赖下的缓存键（字符串形态）；进行中的分步扫描也用它分键。 */
function agentsKeyString(deps) {
	return keyOf(deps);
}
/** 已完成的索引（host 进程内，按键分键）。 */
const cached = /* @__PURE__ */ new Map();
/**
* 读内存里的索引缓存。
* @param deps - route dependencies (homes + exclude list).
* @returns 命中时是 `{at, roster}`，否则 undefined。
*/
function cachedAgentsRoster(deps) {
	return cached.get(keyOf(deps));
}
/**
* 一轮扫描完成：覆盖内存里的那份，并原子写回磁盘。
*
* 写盘是尽力而为：失败只是下次启动首屏少一份缓存，不影响本次结果。
* @param deps - route dependencies (homes + exclude list).
* @param roster - 这一轮的完整结果。
* @param at - 完成时间（默认现在）。
*/
async function saveAgentsRoster(deps, roster, at = Date.now()) {
	cached.set(keyOf(deps), {
		at,
		roster
	});
	const file = {
		version: AGENTS_INDEX_VERSION,
		scannedAt: at,
		key: agentsIndexKey(deps),
		groups: roster.groups
	};
	await writeAgentsIndexFile(agentsIndexPath(deps.home ?? dshHome()), file).catch(() => void 0);
}
/**
* 插件加载时把磁盘上那份索引读进内存。
*
* 同一个键已经有更新的内存结果时不覆盖（配置变更后 `sync()` 会重跑，这里
* 只负责把「启动时什么都没有」这个状态补上）。读盘失败 / 格式坏 / 键不符
* 一律静默跳过。
* @param deps - route dependencies (homes + exclude list).
*/
async function hydrateAgentsRoster(deps) {
	const key = keyOf(deps);
	if (cached.has(key)) return;
	const text = await readFile(agentsIndexPath(deps.home ?? dshHome()), "utf8").catch(() => void 0);
	if (text === void 0) return;
	const loaded = parseAgentsIndexFile(text, key);
	if (loaded !== void 0 && !cached.has(key)) cached.set(key, loaded);
}
/** 原子写一份索引文件（父目录按需创建；保留原权限位）。 */
async function writeAgentsIndexFile(path, file) {
	await mkdir(dirname(path), { recursive: true });
	const previous = await readFileSnapshot(path);
	await writeTextAtomic(path, JSON.stringify(file) + "\n", previous?.mode);
}
/** 解析并校验一份索引文件；任何一处不对劲都按「没有缓存」处理。 */
function parseAgentsIndexFile(text, key) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		return;
	}
	if (typeof data !== "object" || data === null) return void 0;
	const record = data;
	if (record.version !== AGENTS_INDEX_VERSION) return void 0;
	if (typeof record.scannedAt !== "number" || !Number.isFinite(record.scannedAt)) return void 0;
	if (record.key === void 0 || JSON.stringify(record.key) !== key) return void 0;
	if (!Array.isArray(record.groups) || !record.groups.every(isInstructionGroup)) return void 0;
	return {
		at: record.scannedAt,
		roster: {
			groups: record.groups,
			excludeDirs: record.key.excludeDirs
		}
	};
}
/** 一行是否长成清单行的样子。 */
function isInstructionRef(value) {
	if (typeof value !== "object" || value === null) return false;
	const row = value;
	return typeof row.name === "string" && typeof row.path === "string" && typeof row.absolute === "string";
}
/** 一个分组是否长成清单分组的样子。 */
function isInstructionGroup(value) {
	if (typeof value !== "object" || value === null) return false;
	const group = value;
	if (group.kind !== "user" && group.kind !== "project") return false;
	if (group.title !== void 0 && typeof group.title !== "string") return false;
	return Array.isArray(group.files) && group.files.every(isInstructionRef);
}
// src/mcp.ts
/** dsh 的 MCP 客户端插件模块名（每个服务器一行）。 */
const MCP_CLIENT_MODULE = "@deepseek-ai/dsh-mcp-client";
/** MCP 工具的公开名前缀；完整形状是 `mcp__<serverName>__<rawName>`。 */
const MCP_TOOL_PREFIX = "mcp__";
/** dsh 的 serverName 约束（也决定工具名的命名空间边界）。 */
const MCP_SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
/**
* 开关前拒绝调用：目标是未知的、或不是 MCP 行。
* 路由按 status 回 HTTP 状态，而不是把「找不到」报成 500。
*/
var McpAccessError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.status = status;
		this.name = "McpAccessError";
	}
};
/**
* 补丁里的 `!!js` 表达式在 Loader 的条目配置里原样保留成 `{ __jsExpr }`
* （解析成值发生在 fiber 激活时，面板读到的是原文）。识别它，才能把这类字段
* 显示成占位符，而不是当成"缺字段"。
*/
function isJsExpr(value) {
	return typeof value === "object" && value !== null && typeof value.__jsExpr === "string";
}
/** `!!js` 字段在面板上的占位文本（不执行表达式，也不假装知道它的值）。 */
const JS_EXPR_PLACEHOLDER = "⟪!!js⟫";
/** 配置里是否嵌了 `!!js` 表达式（这类行不从表单改，避免把表达式写成字面量）。 */
function containsJsExpr(value, depth = 0) {
	if (depth > 6) return false;
	if (isJsExpr(value)) return true;
	if (Array.isArray(value)) return value.some((entry) => containsJsExpr(entry, depth + 1));
	const record = asRecord$2(value);
	if (record === void 0) return false;
	return Object.values(record).some((entry) => containsJsExpr(entry, depth + 1));
}
/** 读一个纯对象；数组与 null 都不算。 */
function asRecord$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/** 读一个字符串字段（trim 后非空才算）；`!!js` 表达式读成占位符。 */
function readText(record, key) {
	const value = record[key];
	if (isJsExpr(value)) return JS_EXPR_PLACEHOLDER;
	if (typeof value !== "string") return void 0;
	const text = value.trim();
	return text === "" ? void 0 : text;
}
/** 字段存在且可展示（字符串或 `!!js` 表达式）。 */
function hasText(record, key) {
	const value = record[key];
	return typeof value === "string" && value.trim() !== "" || isJsExpr(value);
}
/** 读字符串数组（非字符串项丢弃，`!!js` 表达式读成占位符）。 */
function readTextList(value) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => typeof entry === "string" ? [entry] : isJsExpr(entry) ? [JS_EXPR_PLACEHOLDER] : []);
}
/** 读字符串字典（非字符串值丢弃，`!!js` 表达式读成占位符）。 */
function readTextMap(value) {
	const record = asRecord$2(value);
	if (record === void 0) return {};
	const out = {};
	for (const [key, entry] of Object.entries(record)) if (typeof entry === "string") out[key] = entry;
	else if (isJsExpr(entry)) out[key] = JS_EXPR_PLACEHOLDER;
	return out;
}
/** 读一个毫秒数（正数才算）。 */
function readCount(record, key) {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : void 0;
}
/** 工具参数的顶层键（JSON Schema 的 properties）。 */
function paramNamesOf(parameters) {
	const record = asRecord$2(parameters);
	if (record === void 0) return [];
	const properties = asRecord$2(record.properties);
	return properties === void 0 ? [] : Object.keys(properties);
}
/** 面板状态推导：只有"插件起来了"与"没有工具"这两件事是确定的。 */
function statusOf(enabled, phase) {
	if (!enabled) return "disabled";
	if (phase === "failed") return "failed";
	return phase === "active" ? "running" : "starting";
}
/**
* 传输方式：先认显式值，再按配置形状兜底（缺 transport，或 transport 本身是
* `!!js` 表达式时按 command/url 的形状判断，并在告警里说明推断过）。
*/
function transportOf(raw) {
	const declared = raw.transport;
	if (declared === "stdio" || declared === "streamable-http") return { transport: declared };
	if (declared !== void 0 && !isJsExpr(declared)) return {};
	const inferred = hasText(raw, "command") ? "stdio" : hasText(raw, "url") ? "streamable-http" : void 0;
	if (inferred === void 0) return {};
	return isJsExpr(declared) ? {
		transport: inferred,
		note: "transport is a !!js expression; inferred from the config shape"
	} : { transport: inferred };
}
/**
* 把事实集折成面板数据。
*
* 规则：
*   - 认不出 serverName 的行跳过并告警（没有命名空间就无法归属工具）；
*   - 同名服务器保留第一行并告警（dsh 激活时会拒绝第二个）；
*   - 工具按 `mcp__<serverName>__` 归属，最长前缀优先；归不上的进 orphanTools。
* @param facts - Loader 行事实，顺序即 Loader 顺序。
* @param tools - 当前注册的工具表。
* @param capabilities - 受管行与可编辑行（缺省：全部不可编辑）。
* @returns 服务器列表、未归属工具与告警。
*/
function projectMcpServers(facts, tools = [], capabilities = {}) {
	const warnings = [];
	const servers = [];
	const byName = /* @__PURE__ */ new Map();
	const managedIds = new Set(capabilities.managedIds ?? []);
	const editableIds = new Set(capabilities.editableIds ?? []);
	const editBlocked = capabilities.editBlocked ?? {};
	for (const fact of facts) {
		const raw = asRecord$2(fact.config);
		if (raw === void 0) {
			warnings.push(`ignored MCP entry "${fact.entryId}": config is not an object`);
			continue;
		}
		if (isJsExpr(raw.serverName)) {
			warnings.push(`ignored MCP entry "${fact.entryId}": serverName is a !!js expression; its tools cannot be attributed`);
			continue;
		}
		const serverName = readText(raw, "serverName");
		if (serverName === void 0 || !MCP_SERVER_NAME_RE.test(serverName)) {
			warnings.push(`ignored MCP entry "${fact.entryId}": serverName is missing or outside [A-Za-z0-9_-]{1,32}`);
			continue;
		}
		if (byName.has(serverName)) {
			warnings.push(`MCP server "${serverName}" is configured more than once; entry "${fact.entryId}" is hidden behind "${byName.get(serverName)?.entryId ?? ""}"`);
			continue;
		}
		const { transport, note } = transportOf(raw);
		if (transport === void 0) {
			warnings.push(`ignored MCP entry "${fact.entryId}": unknown transport ${JSON.stringify(raw.transport)}`);
			continue;
		}
		if (note !== void 0) warnings.push(`MCP entry "${fact.entryId}": ${note}`);
		const addressId = fact.patchId ?? fact.entryId;
		const server = {
			entryId: fact.entryId,
			serverName,
			transport,
			enabled: fact.enabled,
			phase: fact.phase,
			status: statusOf(fact.enabled, fact.phase),
			toolCallTimeoutMs: readCount(raw, "toolCallTimeoutMs") ?? 6e4,
			failOnStartupError: raw.failOnStartupError === true,
			managed: managedIds.has(addressId),
			editable: editableIds.has(addressId),
			removable: managedIds.has(addressId),
			tools: []
		};
		if (!server.editable) server.editBlockedReason = editBlocked[addressId] ?? "unaddressable";
		const maxInstructionBytes = readCount(raw, "maxInstructionBytes");
		if (maxInstructionBytes !== void 0) server.maxInstructionBytes = maxInstructionBytes;
		if (containsJsExpr(raw)) {
			server.editable = false;
			server.editBlockedReason = "invalid-config";
		}
		if (fact.patchId !== void 0) server.patchId = fact.patchId;
		if (fact.readOnlyReason !== void 0) server.readOnlyReason = fact.readOnlyReason;
		if (transport === "stdio") server.stdio = {
			command: readText(raw, "command") ?? "",
			args: readTextList(raw.args),
			cwd: readText(raw, "cwd") ?? "",
			env: readTextMap(raw.env)
		};
		else server.http = {
			url: readText(raw, "url") ?? "",
			headers: readTextMap(raw.headers)
		};
		byName.set(serverName, server);
		servers.push(server);
	}
	const prefixes = [...servers].map((server) => ({
		server,
		prefix: MCP_TOOL_PREFIX + server.serverName + "__"
	})).sort((left, right) => right.prefix.length - left.prefix.length);
	const orphanTools = [];
	for (const tool of tools) {
		if (!tool.name.startsWith("mcp__")) continue;
		const owner = prefixes.find((entry) => tool.name.startsWith(entry.prefix));
		if (owner === void 0) {
			orphanTools.push(tool.name);
			continue;
		}
		const info = {
			name: tool.name,
			rawName: tool.name.slice(owner.prefix.length),
			description: tool.description ?? "",
			paramNames: paramNamesOf(tool.parameters)
		};
		owner.server.tools.push(info);
	}
	orphanTools.sort();
	return {
		servers,
		orphanTools,
		warnings
	};
}
/** 合并投影与环境信息，得到 GET /mcp 的完整响应体。 */
function buildMcpResponse(facts) {
	const projection = projectMcpServers(facts.facts, facts.tools, {
		managedIds: facts.managedIds,
		editableIds: facts.editableIds,
		editBlocked: facts.editBlocked
	});
	return {
		ok: true,
		servers: projection.servers,
		orphanTools: projection.orphanTools,
		configPath: facts.configPath,
		canManage: facts.canManage,
		warnings: [...facts.warnings, ...projection.warnings]
	};
}
// src/mcp-patch.ts
/**
* MCP 域的受管块：本插件在 profile 补丁里自己维护的一段 insert 行。
*
* dsh 没有"新增 MCP 服务器行"的接口（`pluginManager` 只开关、`configEditor`
* 只改已有行），所以新增/删除只能写补丁。为了不碰别人的内容，这一段用两条
* 注释标记围起来：
*
*   # @managed-by: custom-instruction-manager (mcp)
*   ...
*   # @end-managed-by: custom-instruction-manager (mcp)
*
* 每次保存只重写标记之间的文本，块外一个字节都不动（注释、顺序、`!!js`
* 都原样保留），这也是 dsh 自己的配置写入器能容忍的形状——它们用 `yaml`
* 的 Document 改行，注释会跟着走。
*
* 这一层是纯文本 + js-yaml：不读盘、不加锁，方便单测。
*/
/** 受管块起始标记（整行比较，允许前后空白）。 */
const MANAGED_START = "# @managed-by: custom-instruction-manager (mcp)";
/** 受管块结束标记。 */
const MANAGED_END = "# @end-managed-by: custom-instruction-manager (mcp)";
/** 写在起始标记下面的说明行（每次重写都会重建）。 */
const MANAGED_NOTE = "# 本块由「自定义指令管理器」按面板保存重写；块外内容原样保留，请勿在块内手改。";
/** 面板生成的行 id 前缀：即使标记被弄丢，也能看出这些行是本插件建的。 */
const HUB_ENTRY_PREFIX = "mcp-hub-";
/** 补丁里允许的超时上限（毫秒，2^31-1）。 */
const MAX_TIMEOUT_MS = 2147483647;
/** 请求头名的 token 字符集（RFC 7230）。 */
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/** 解析/读取问题（英文原文，路由按 409 回给界面）。 */
var McpPatchError = class extends Error {
	status;
	field;
	constructor(message, status = 409, field) {
		super(message);
		this.status = status;
		this.field = field;
		this.name = "McpPatchError";
	}
};
/** 一行文本的标记命中（trim 后完全相等才算）。 */
function markerOf(line) {
	const text = line.trim();
	if (text === "# @managed-by: custom-instruction-manager (mcp)") return "start";
	if (text === "# @end-managed-by: custom-instruction-manager (mcp)") return "end";
}
/**
* 定位受管块。
*
* **不能只用两条标记围出区间**：dsh 的 config-editor 把新行 append 到
* YAML 序列末尾，而结束标记是一条尾随注释，于是别人写的覆盖行会落在两条
* 标记之间。所以真正的块是「起始标记之后的那一个 `- insert:` 条目」，标记
* 之间多出来的内容属于别的写入器，读写都必须原样保留。
* @param lines - 补丁文件的每一行。
* @returns 位置；没有起始标记时 undefined。
*/
function locateBlock(lines) {
	let start = -1;
	let end = -1;
	for (let index = 0; index < lines.length; index += 1) {
		const marker = markerOf(lines[index] ?? "");
		if (marker === "start") {
			if (start >= 0) throw new McpPatchError("the MCP managed block is declared twice; keep one start marker");
			start = index;
		} else if (marker === "end") {
			if (start < 0) throw new McpPatchError("the MCP managed block has an end marker but no start marker");
			end = index;
			break;
		}
	}
	if (start < 0) return void 0;
	const limit = end < 0 ? lines.length : end;
	let insertStart = -1;
	for (let index = start + 1; index < limit; index += 1) if (/^-\s*insert\s*:/.test(lines[index] ?? "")) {
		insertStart = index;
		break;
	}
	if (insertStart < 0) return {
		start,
		...end >= 0 ? { end } : {}
	};
	let insertEnd = insertStart + 1;
	while (insertEnd < limit) {
		const line = lines[insertEnd] ?? "";
		if (line.trim() === "" || /^\s/.test(line)) {
			insertEnd += 1;
			continue;
		}
		break;
	}
	return {
		start,
		insertStart,
		insertEnd,
		...end >= 0 ? { end } : {}
	};
}
/** 纯对象判定。 */
function asRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/** 块内 `- insert:` 条目的文本（没有条目时为空串）。 */
function insertText(lines, range) {
	if (range.insertStart === void 0 || range.insertEnd === void 0) return "";
	return lines.slice(range.insertStart, range.insertEnd).join("\n");
}
/**
* 读受管块里的服务器行。
*
* 只接受 `name: @deepseek-ai/dsh-mcp-client` 且带字符串 id 的行；块里出现别的
* 插件（或没有 id 的行）时整块报错，而不是悄悄丢掉——那是人手改过的痕迹。
* @param text - 补丁文件全文。
* @returns 受管行（没有块时为空数组）。
*/
function readManagedBlock(text) {
	const lines = text.split("\n");
	const range = locateBlock(lines);
	if (range === void 0) return [];
	const body = insertText(lines, range);
	if (body.includes("!!js")) throw new McpPatchError("the MCP managed block contains a !!js expression; rewrite it outside the block or edit it by hand");
	let parsed;
	try {
		parsed = yaml.load(body);
	} catch (error) {
		throw new McpPatchError("the MCP managed block is not valid YAML: " + (error instanceof Error ? error.message : String(error)));
	}
	if (parsed === void 0 || parsed === null) return [];
	if (!Array.isArray(parsed)) throw new McpPatchError("the MCP managed block must hold a YAML list");
	const servers = [];
	for (const entry of parsed) {
		const record = asRecord$1(entry);
		const insert = record === void 0 ? void 0 : record.insert;
		if (!Array.isArray(insert)) throw new McpPatchError("the MCP managed block must hold `- insert:` entries only");
		for (const row of insert) {
			const item = asRecord$1(row);
			if (item === void 0) throw new McpPatchError("the MCP managed block holds a non-map row");
			const name = item.name;
			if (name !== "@deepseek-ai/dsh-mcp-client") throw new McpPatchError("the MCP managed block holds a row for \"" + String(name) + "\"; only @deepseek-ai/dsh-mcp-client rows belong here");
			const id = item.id;
			if (typeof id !== "string" || id.trim() === "") throw new McpPatchError("an MCP row in the managed block has no string id");
			const config = asRecord$1(item.config);
			if (config === void 0) throw new McpPatchError("MCP row \"" + id + "\" has no config object");
			servers.push({
				id,
				config
			});
		}
	}
	const seen = /* @__PURE__ */ new Set();
	for (const server of servers) {
		if (seen.has(server.id)) throw new McpPatchError("the MCP managed block repeats the id \"" + server.id + "\"");
		seen.add(server.id);
	}
	return servers;
}
/**
* 把受管行渲染成块文本（含两条标记与说明行）。
* @param servers - 受管行，顺序即写入顺序。
* @returns 可以直接拼进补丁文件的文本（不含首尾空行）。
*/
function renderManagedBlock(servers) {
	const entry = renderInsert(servers);
	return [
		MANAGED_START,
		MANAGED_NOTE,
		...entry === "" ? [] : entry.split("\n"),
		MANAGED_END
	].join("\n");
}
/** 只渲染 `- insert:` 条目（没有服务器时为空串）。 */
function renderInsert(servers) {
	if (servers.length === 0) return "";
	return yaml.dump([{ insert: servers.map((server) => ({
		id: server.id,
		name: MCP_CLIENT_MODULE,
		config: server.config
	})) }], {
		lineWidth: -1,
		noRefs: true,
		quotingType: "'",
		forceQuotes: false
	}).replace(/\n$/, "");
}
/**
* 用新的受管行替换补丁里的块；没有块时追加到文件末尾。
* @param text - 补丁文件全文。
* @param servers - 新的受管行（空数组表示清空块内容，保留标记）。
* @returns 新的文件全文。
*/
function writeManagedBlock(text, servers) {
	const lines = text.split("\n");
	const range = locateBlock(lines);
	if (range === void 0) {
		const block = renderManagedBlock(servers);
		const base = text.replace(/[ \t]+$/, "");
		if (base.trim() === "") return block + "\n";
		return base.replace(/\n*$/, "\n") + "\n" + block + "\n";
	}
	const entry = renderInsert(servers);
	if (range.insertStart !== void 0 && range.insertEnd !== void 0) return [
		...lines.slice(0, range.insertStart),
		...entry === "" ? [] : entry.split("\n"),
		...lines.slice(range.insertEnd)
	].join("\n");
	if (entry === "") return lines.join("\n");
	const at = range.start + (lines[range.start + 1]?.trim().startsWith("#") === true ? 2 : 1);
	return [
		...lines.slice(0, at),
		...entry.split("\n"),
		...lines.slice(at)
	].join("\n");
}
/** 由 serverName 生成行 id 的骨架（稳定、可读、只含 [a-z0-9-]）。 */
function entryIdFor(serverName) {
	const slug = serverName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
	return HUB_ENTRY_PREFIX + (slug === "" ? "server" : slug);
}
/**
* 生成一个不与 `taken` 冲突的行 id。
* @param serverName - 服务器名。
* @param taken - 现存的 Loader 条目 id 与受管行 id。
* @returns `mcp-hub-<slug>`，冲突时追加 `-2`、`-3`…
*/
function uniqueEntryId(serverName, taken) {
	const used = new Set(taken);
	const base = entryIdFor(serverName);
	if (!used.has(base)) return base;
	for (let index = 2; index < 1e3; index += 1) {
		const candidate = base + "-" + String(index);
		if (!used.has(candidate)) return candidate;
	}
	return base + "-" + String(Date.now());
}
/** 字符串字段（去首尾空白；空串视为缺省）。 */
function textOf(value) {
	if (typeof value !== "string") return void 0;
	const text = value.trim();
	return text === "" ? void 0 : text;
}
/** 字符串数组：非字符串项返回 undefined（报 invalid，而不是静默丢弃）。 */
function listOf(value) {
	if (value === void 0) return [];
	if (!Array.isArray(value)) return void 0;
	return value.every((entry) => typeof entry === "string") ? [...value] : void 0;
}
/** 字符串字典：键值都必须是字符串。 */
function mapOf(value) {
	if (value === void 0) return {};
	const record = asRecord$1(value);
	if (record === void 0) return void 0;
	const out = {};
	for (const [key, entry] of Object.entries(record)) {
		if (typeof entry !== "string") return void 0;
		out[key] = entry;
	}
	return out;
}
/**
* 可选的数字字段：缺省 = 不动；null = 清掉；正整数 = 设置；其余算非法。
* @param value - 请求体里的原始值。
* @returns `undefined`/`null`/数字，或 `false`（非法）。
*/
function optionalCount(value) {
	if (value === void 0) return void 0;
	if (value === null) return null;
	if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_TIMEOUT_MS) return value;
	return false;
}
/** 校验失败的累加器。 */
var FieldErrors = class {
	list = [];
	add(field, code) {
		this.list.push({
			field,
			code
		});
	}
};
/**
* 校验并归一化面板提交的一台服务器配置。
*
* 只保留当前传输用得上的字段：stdio 丢掉 url/headers，HTTP 丢掉 command/args/
* env/cwd——避免把上一次的配置带进新传输。
* @param value - 请求体里的 `server`（JSON 未知形状）。
* @returns 归一化配置；字段有错时 `errors` 非空、`server` 为 undefined。
*/
function normalizeServerInput(value) {
	const errors = new FieldErrors();
	const record = asRecord$1(value);
	if (record === void 0) {
		errors.add("server", "invalid");
		return { errors: errors.list };
	}
	const serverName = textOf(record.serverName);
	if (serverName === void 0) errors.add("serverName", "required");
	else if (!MCP_SERVER_NAME_RE.test(serverName)) errors.add("serverName", "invalid");
	const transportRaw = record.transport;
	const transport = transportRaw === "stdio" || transportRaw === "streamable-http" ? transportRaw : void 0;
	if (transportRaw === void 0) errors.add("transport", "required");
	else if (transport === void 0) errors.add("transport", "invalid");
	const timeout = optionalCount(record.toolCallTimeoutMs);
	if (timeout === false) errors.add("toolCallTimeoutMs", "range");
	const maxInstruction = optionalCount(record.maxInstructionBytes);
	if (maxInstruction === false) errors.add("maxInstructionBytes", "range");
	const failRaw = record.failOnStartupError;
	if (failRaw !== void 0 && typeof failRaw !== "boolean") errors.add("failOnStartupError", "invalid");
	const server = {
		serverName: serverName ?? "",
		transport: transport ?? "stdio"
	};
	if (timeout !== false) server.toolCallTimeoutMs = timeout;
	if (maxInstruction !== false) server.maxInstructionBytes = maxInstruction;
	if (failRaw === true) server.failOnStartupError = true;
	else if (failRaw === false) server.failOnStartupError = false;
	if (transport === "stdio") {
		const command = textOf(record.command);
		if (command === void 0) errors.add("command", "required");
		else server.command = command;
		const args = listOf(record.args);
		if (args === void 0) errors.add("args", "invalid");
		else server.args = args;
		const cwd = textOf(record.cwd);
		if (cwd !== void 0) server.cwd = cwd;
		const env = mapOf(record.env);
		if (env === void 0) errors.add("env", "invalid");
		else {
			for (const key of Object.keys(env)) if (key.trim() === "" || key.includes("=") || key.includes("\n")) errors.add("env." + key, "invalid");
			server.env = env;
		}
	} else if (transport === "streamable-http") {
		const url = textOf(record.url);
		if (url === void 0) errors.add("url", "required");
		else try {
			const parsed = new URL(url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") errors.add("url", "invalid");
			else server.url = url;
		} catch {
			errors.add("url", "invalid");
		}
		const headers = mapOf(record.headers);
		if (headers === void 0) errors.add("headers", "invalid");
		else {
			for (const [key, value] of Object.entries(headers)) {
				if (!HEADER_NAME_RE.test(key)) errors.add("headers." + key, "invalid");
				if (value.includes("\n") || value.includes("\r")) errors.add("headers." + key, "invalid");
			}
			server.headers = headers;
		}
	}
	return errors.list.length > 0 ? { errors: errors.list } : {
		server,
		errors: []
	};
}
/** 归一化配置 → 写进补丁的 config（只写显式给出的字段）。 */
function configFromServer(server) {
	const config = {
		serverName: server.serverName,
		transport: server.transport
	};
	if (server.transport === "stdio") {
		config.command = server.command ?? "";
		config.args = [...server.args ?? []];
		if (server.cwd !== void 0) config.cwd = server.cwd;
		if (server.env !== void 0 && Object.keys(server.env).length > 0) config.env = { ...server.env };
	} else {
		config.url = server.url ?? "";
		if (server.headers !== void 0 && Object.keys(server.headers).length > 0) config.headers = { ...server.headers };
	}
	if (typeof server.toolCallTimeoutMs === "number") config.toolCallTimeoutMs = server.toolCallTimeoutMs;
	if (server.failOnStartupError !== void 0) config.failOnStartupError = server.failOnStartupError;
	if (typeof server.maxInstructionBytes === "number") config.maxInstructionBytes = server.maxInstructionBytes;
	return config;
}
/**
* 把面板提交的配置覆盖到一份已有行配置上，保留未知字段（例如 `reconnect`）。
* 换传输时清掉另一种传输的字段，避免把旧命令带进 HTTP 行。
* @param base - 补丁里该行的原始 config。
* @param server - 归一化后的提交值。
* @returns 新的 config（不修改 base）。
*/
function applyServerToConfig(base, server) {
	const next = { ...base };
	if (base.transport !== server.transport) for (const key of [
		"command",
		"args",
		"cwd",
		"env",
		"url",
		"headers"
	]) delete next[key];
	next.serverName = server.serverName;
	next.transport = server.transport;
	if (server.transport === "stdio") {
		next.command = server.command ?? "";
		next.args = [...server.args ?? []];
		if (server.cwd !== void 0 && server.cwd !== "") next.cwd = server.cwd;
		else delete next.cwd;
		if (server.env !== void 0 && Object.keys(server.env).length > 0) next.env = { ...server.env };
		else delete next.env;
	} else {
		next.url = server.url ?? "";
		if (server.headers !== void 0 && Object.keys(server.headers).length > 0) next.headers = { ...server.headers };
		else delete next.headers;
	}
	if (server.toolCallTimeoutMs === null) delete next.toolCallTimeoutMs;
	else if (server.toolCallTimeoutMs !== void 0) next.toolCallTimeoutMs = server.toolCallTimeoutMs;
	if (server.failOnStartupError !== void 0) next.failOnStartupError = server.failOnStartupError;
	if (server.maxInstructionBytes === null) delete next.maxInstructionBytes;
	else if (server.maxInstructionBytes !== void 0) next.maxInstructionBytes = server.maxInstructionBytes;
	return next;
}
// src/mcp-config.ts
/**
* MCP 域的写入口。
*
* 两条路径，刻意分开：
*   - 本插件受管块里的行（`mcp-hub-*`）：直接重写块，因为 dsh 没有"新增/
*     删除组合行"的接口；
*   - 其余已存在的行：交给 dsh 的 `configEditor.edit()`——它做整份补丁校验、
*     原子写与 Loader 热应用，我们只负责把表单值合进去。
*
* 写盘用"重读 → 比对 → 原子替换"的 CAS 循环：dsh 自己的开关/配置写入器也会
* 改同一个补丁文件，缩小的竞争窗口比加一把它们不认识的锁更有用。HMR 在时
* 整个写过程包进 `hmr.runExclusive`，与 dsh 的重载串行。
*/
const JsExprType = new yaml.Type("tag:yaml.org,2002:js", {
	kind: "scalar",
	construct: (data) => ({ __jsExpr: String(data) })
});
/** 与 dsh 的补丁方言一致：允许 `!!js` 标量。 */
const PATCH_SCHEMA = yaml.DEFAULT_SCHEMA.extend([JsExprType]);
/** 保存后等 Loader 应用的上限（HMR 通常在一两百毫秒内重组）。 */
const APPLY_TIMEOUT_MS = 6e3;
/** 轮询间隔。 */
const APPLY_POLL_MS = 100;
/** 纯对象判定。 */
function asRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/** 错误文本。 */
function messageOf$1(error) {
	return error instanceof Error ? error.message : String(error);
}
/** 睡眠（HMR 应用轮询）。 */
function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
/** 配置里是否嵌了 `!!js` 表达式（含表达式的行只能手工改：表单拿不到真实值）。 */
function hasExpression(value, depth = 0) {
	if (depth > 6) return false;
	if (typeof value === "object" && value !== null && typeof value.__jsExpr === "string") return true;
	if (Array.isArray(value)) return value.some((entry) => hasExpression(entry, depth + 1));
	const record = asRecord(value);
	if (record === void 0) return false;
	return Object.values(record).some((entry) => hasExpression(entry, depth + 1));
}
/**
* Build the MCP configurator over a context service reader.
* @param get - reads one service off the plugin context (`ctx.get`).
* @param options - apply-wait bound (tests shorten it).
* @returns save/remove over MCP rows, either through the managed block or dsh's config editor.
*/
function createMcpConfig(get, options = {}) {
	/** 进程内串行化：两次保存不会同时读改写同一个文件。 */
	let chain = Promise.resolve();
	const serialize = (run) => {
		const next = chain.then(run, run);
		chain = next.catch(() => void 0);
		return next;
	};
	const loader = () => {
		const service = get("loader");
		if (service === void 0) throw new Error("loader service is absent: MCP rows cannot be read");
		return service;
	};
	const patchPath = () => {
		const profile = get("profileContext");
		if (profile?.patchPath === void 0) throw new Error("profileContext service is absent: the profile patch cannot be located");
		return profile.patchPath;
	};
	const mcpEntries = () => {
		const rows = [];
		for (const entry of loader().entries()) if (entry.options?.name === "@deepseek-ai/dsh-mcp-client") rows.push(entry);
		return rows;
	};
	/**
	* 补丁/配置编辑服务认的 id：行在补丁里的 id（`options.id`）。
	*
	* 面板传来的 entryId 是 Loader 的树 id（顶层行带 `include:` 前缀），两者
	* 不是一回事；写补丁、找块、比对覆盖行都必须用前者。
	*/
	const patchIdOf = (entry) => entry.options?.id ?? entry.id;
	const findEntry = (id) => mcpEntries().find((entry) => entry.id === id || entry.options?.id === id);
	const readPatch = async (path) => {
		try {
			return await readFile(path, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") return "";
			throw error;
		}
	};
	/** 读改写循环：内容被别人改过就重来，绝不覆盖没读到的编辑。 */
	const mutatePatch = async (mutate) => {
		const path = patchPath();
		const run = async () => {
			for (let attempt = 0; attempt < 4; attempt += 1) {
				const current = await readPatch(path);
				const { text, result } = mutate(current);
				if (text === current) return result;
				if (await readPatch(path) !== current) continue;
				const temporary = join(`${path}.${String(process.pid)}.${Math.random().toString(36).slice(2)}.tmp`);
				await writeFile(temporary, text, { mode: 384 });
				await rename(temporary, path);
				return result;
			}
			throw new McpPatchError("the profile patch kept changing while saving; nothing was written, try again");
		};
		const hmr = get("hmr");
		return hmr === void 0 || typeof hmr.runExclusive !== "function" ? run() : hmr.runExclusive(run);
	};
	/** 补丁全文的 id → 带 config 的覆盖行（用于发现受管行被别处覆盖）。 */
	const configOverrides = (text) => {
		const out = /* @__PURE__ */ new Map();
		let parsed;
		try {
			parsed = yaml.load(text, { schema: PATCH_SCHEMA });
		} catch {
			return out;
		}
		if (!Array.isArray(parsed)) return out;
		for (const entry of parsed) {
			const record = asRecord(entry);
			if (record === void 0 || record.insert !== void 0) continue;
			const id = record.id;
			if (typeof id === "string" && record.config !== void 0) out.set(id, true);
		}
		return out;
	};
	/** 等 Loader 应用一次补丁改动；超时说明这次改动要重启才生效。 */
	const applyTimeoutMs = options.applyTimeoutMs ?? APPLY_TIMEOUT_MS;
	const pollMs = options.pollMs ?? APPLY_POLL_MS;
	const waitForApply = async (predicate) => {
		const deadline = Date.now() + applyTimeoutMs;
		for (;;) {
			try {
				if (predicate()) return true;
			} catch {}
			if (Date.now() >= deadline) return false;
			await delay(pollMs);
		}
	};
	const outcomeOf = (applied, entryId) => applied ? {
		application: "applied",
		entryId
	} : {
		application: "restart-required",
		entryId,
		restartReason: "load-pending"
	};
	const save = async (server, entryId) => serialize(async () => {
		const entries = mcpEntries();
		const editor = get("configEditor");
		if (entryId === void 0) {
			const created = await mutatePatch((text) => {
				const block = readManagedBlock(text);
				assertUniqueName(server, entries, block);
				const taken = [
					...entries.map(patchIdOf),
					...entries.map((entry) => entry.id),
					...block.map((row) => row.id)
				];
				const id = uniqueEntryId(server.serverName, taken);
				const config = configFromServer(server);
				const nextText = writeManagedBlock(text, [...block, {
					id,
					config
				}]);
				assertPatchParses(nextText);
				return {
					text: nextText,
					result: {
						id,
						config
					}
				};
			});
			const applied = await waitForApply(() => {
				const row = mcpEntries().find((entry) => patchIdOf(entry) === created.id);
				return row !== void 0 && isDeepStrictEqual(row.options?.config, created.config);
			});
			return outcomeOf(applied, created.id);
		}
		const target = findEntry(entryId);
		const key = target === void 0 ? entryId : patchIdOf(target);
		const managed = await mutatePatch((text) => {
			const block = readManagedBlock(text);
			const index = block.findIndex((row) => row.id === key);
			if (index < 0) return {
				text,
				result: { kind: "foreign" }
			};
			if (configOverrides(text).has(key)) throw new McpAccessError("this row also has a later patch entry with config; edit it there instead", 409);
			assertUniqueName(server, entries, block, key);
			const config = applyServerToConfig(block[index].config, server);
			const next = [...block];
			next[index] = {
				id: key,
				config
			};
			const nextText = writeManagedBlock(text, next);
			assertPatchParses(nextText);
			return {
				text: nextText,
				result: {
					kind: "managed",
					config
				}
			};
		});
		if (managed.kind === "managed") {
			const applied = await waitForApply(() => {
				const row = mcpEntries().find((entry) => patchIdOf(entry) === key);
				return row !== void 0 && isDeepStrictEqual(row.options?.config, managed.config);
			});
			return outcomeOf(applied, key);
		}
		if (editor === void 0) throw new McpAccessError("this row is not managed by the plugin and this deployment has no config editor; it can only be toggled", 409);
		return editForeign(editor, server, key);
	});
	/** 用 dsh 的 config-editor 改一行（保留 `!!js` 原文）。 */
	const editForeign = async (editor, server, patchId) => {
		const entry = editor.entries().find((item) => (item.options?.id ?? item.id) === patchId || item.id === patchId);
		if (entry === void 0) throw new McpAccessError("MCP row is not addressable through the config editor: " + patchId, 409);
		if (entry.options?.name !== "@deepseek-ai/dsh-mcp-client") throw new McpAccessError("not an MCP row: " + patchId, 404);
		const configuration = editor.configuration().find((item) => (item.entry.options?.id ?? item.entry.id) === patchId || item.entry === entry);
		if (configuration === void 0) throw new McpAccessError("MCP row configuration is unavailable: " + patchId, 409);
		const override = asRecord(configuration.override);
		const inherited = asRecord(configuration.inherited) ?? {};
		const raw = override !== void 0 && Object.keys(override).length > 0 ? override : inherited;
		if (hasExpression(raw) || hasExpression(entry.options?.config)) throw new McpAccessError("this row contains a !!js expression; edit it in the profile patch by hand", 409);
		assertUniqueName(server, mcpEntries(), [], patchId);
		const next = applyServerToConfig(raw, server);
		try {
			await editor.edit(entry, () => next);
		} catch (error) {
			throw new McpAccessError("config editor refused the change: " + messageOf$1(error), 409);
		}
		return {
			application: "applied",
			entryId: patchId
		};
	};
	const remove = async (entryId) => serialize(async () => {
		const target = findEntry(entryId);
		const key = target === void 0 ? entryId : patchIdOf(target);
		const live = target !== void 0;
		if (!await mutatePatch((text) => {
			const block = readManagedBlock(text);
			if (block.findIndex((row) => row.id === key) < 0) return {
				text,
				result: false
			};
			const nextText = writeManagedBlock(text, block.filter((row) => row.id !== key));
			assertPatchParses(nextText);
			return {
				text: nextText,
				result: true
			};
		})) {
			if (!live) throw new McpAccessError("unknown MCP server entry: " + entryId, 404);
			throw new McpAccessError("this row was not created from this page; remove it where it is declared", 409);
		}
		const applied = await waitForApply(() => !mcpEntries().some((entry) => patchIdOf(entry) === key));
		return outcomeOf(applied, key);
	});
	return {
		save,
		remove
	};
}
/** 同名的服务器只能有一台（dsh 会拒绝第二个注册同一命名空间的实例）。 */
function assertUniqueName(server, entries, block, selfId) {
	for (const entry of entries) {
		if (entry.id === selfId || entry.options?.id === selfId) continue;
		if (asRecord(entry.options?.config)?.serverName === server.serverName) throw new McpPatchError("MCP server name \"" + server.serverName + "\" is already used by row \"" + (entry.options?.id ?? entry.id) + "\"", 409, "serverName");
	}
	for (const row of block) {
		if (row.id === selfId) continue;
		if (row.config.serverName === server.serverName) throw new McpPatchError("MCP server name \"" + server.serverName + "\" is already used by row \"" + row.id + "\"", 409, "serverName");
	}
}
/** 整份补丁在写入前后都必须能解析（防止拼接把文件写坏）。 */
function assertPatchParses(text) {
	if (text.trim() === "") return;
	try {
		yaml.load(text, { schema: PATCH_SCHEMA });
	} catch (error) {
		throw new McpPatchError("the profile patch would not parse after this change: " + messageOf$1(error));
	}
}
// src/mcp-runtime.ts
/**
* MCP 域的 host 实现：从 dsh 的插件管理 / Loader / 工具注册表里读事实，并转发开关。
*
* 这里是本插件里唯一碰 dsh 运行内部服务的地方，所以全部用**结构接口**声明
* （外部插件解析不到 @deepseek-ai 的运行时包，只能靠 ctx.get() 拿到对象），
* 缺服务就降级成告警，绝不抛给 apply()。
*
* 已知边界（见 .agent-work/PLAN.md）：
*   - 没有连接状态 API：只投影 fiber 阶段与工具数；
*   - agent preset 里的 MCP 行不在 Loader 顶层，面板看不到；
*   - 不可寻址的行（补丁里没有 id，如外部产品写入的 insert 行）只能列不能开/关。
*/
/** FiberState 的运行时镜像（DISPOSED = null）。 */
const FIBER_PHASE = {
	0: "pending",
	1: "loading",
	2: "active",
	3: "failed",
	4: null,
	5: "unloading"
};
/** 开关结果的合法取值（dsh 之外的值按 failed 处理，不把未知状态喂给界面）。 */
const APPLICATIONS = /* @__PURE__ */ new Set([
	"applied",
	"restart-required",
	"overridden",
	"failed",
	"cancelled"
]);
/** 错误对象的可读文本（不吞掉非 Error 的抛出）。 */
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/** 只有 pluginManager 缺席或读不出列表时用 Loader 兜底：能列，但不能开关。 */
function loaderRows(loader, warnings) {
	if (loader === void 0) {
		warnings.push("loader service is absent: MCP servers cannot be enumerated");
		return [];
	}
	const rows = [];
	try {
		for (const entry of loader.entries()) {
			if (entry.options?.name !== "@deepseek-ai/dsh-mcp-client") continue;
			const state = entry.fiber?.state;
			rows.push({
				entryId: entry.id,
				moduleName: MCP_CLIENT_MODULE,
				enabled: entry.disabled !== true,
				fiberPhase: state === void 0 ? null : FIBER_PHASE[state] ?? null,
				readOnlyReason: "no-manager"
			});
		}
	} catch (error) {
		warnings.push("loader.entries() failed: " + messageOf(error));
	}
	return rows;
}
/**
* Build the MCP access surface over a context service reader.
* @param get - reads one service off the plugin context (`ctx.get`), `undefined` when absent.
* @returns list/toggle over the MCP rows of this process.
*/
function createMcpAccess(get) {
	const list = async () => {
		const warnings = [];
		const manager = get("pluginManager");
		const loader = get("loader");
		const tools = get("tools");
		const profile = get("profileContext");
		let rows = [];
		let canManage = manager !== void 0;
		if (manager === void 0) {
			warnings.push("pluginManager service is absent: MCP servers are listed from the Loader only and cannot be toggled");
			rows = loaderRows(loader, warnings);
		} else try {
			rows = (await manager.listPlugins()).filter((row) => row.moduleName === MCP_CLIENT_MODULE);
		} catch (error) {
			warnings.push("pluginManager.listPlugins() failed: " + messageOf(error));
			rows = loaderRows(loader, warnings);
		}
		const configs = /* @__PURE__ */ new Map();
		if (loader !== void 0) try {
			for (const entry of loader.entries()) configs.set(entry.id, entry.options?.config);
		} catch (error) {
			warnings.push("loader.entries() failed: " + messageOf(error));
		}
		else if (rows.length > 0) warnings.push("loader service is absent: MCP row configs are unavailable");
		const facts = rows.map((row) => ({
			entryId: row.entryId,
			config: configs.get(row.entryId),
			enabled: row.enabled,
			phase: row.fiberPhase ?? null,
			...row.patchId !== void 0 ? { patchId: row.patchId } : {},
			...row.readOnlyReason !== void 0 ? { readOnlyReason: row.readOnlyReason } : {}
		}));
		let toolFacts = [];
		if (tools === void 0) {
			if (rows.length > 0) warnings.push("tools service is absent: tool lists are unavailable");
		} else try {
			toolFacts = tools.schemas().map((tool) => ({
				name: tool.name,
				...tool.description !== void 0 ? { description: tool.description } : {},
				...tool.parameters !== void 0 ? { parameters: tool.parameters } : {}
			}));
		} catch (error) {
			warnings.push("tools.schemas() failed: " + messageOf(error));
		}
		const managedIds = [];
		if (profile?.patchPath !== void 0) try {
			const text = await readFile(profile.patchPath, "utf8");
			managedIds.push(...readManagedBlock(text).map((row) => row.id));
		} catch (error) {
			if (error.code !== "ENOENT") warnings.push("MCP managed block: " + messageOf(error));
		}
		const editor = get("configEditor");
		const editableIds = new Set(managedIds);
		if (editor !== void 0) try {
			for (const entry of editor.entries()) {
				if (entry.options?.name !== "@deepseek-ai/dsh-mcp-client") continue;
				const id = entry.options.id ?? entry.id;
				if (editableIds.has(id)) continue;
				editableIds.add(id);
			}
		} catch (error) {
			warnings.push("configEditor.entries() failed: " + messageOf(error));
		}
		const editBlocked = {};
		for (const row of rows) {
			const key = row.patchId ?? row.entryId;
			if (editableIds.has(key)) continue;
			editBlocked[key] = editor === void 0 ? "no-editor" : "unaddressable";
		}
		return {
			facts,
			tools: toolFacts,
			configPath: profile?.patchPath ?? null,
			canManage,
			managedIds,
			editableIds: [...editableIds],
			editBlocked,
			warnings
		};
	};
	const setEnabled = async (entryId, enabled) => {
		const manager = get("pluginManager");
		if (manager === void 0) throw new Error("pluginManager service is absent: MCP servers cannot be toggled in this deployment");
		if ((await manager.listPlugins()).find((row) => row.entryId === entryId && row.moduleName === "@deepseek-ai/dsh-mcp-client") === void 0) throw new McpAccessError("unknown MCP server entry: " + entryId, 404);
		const result = await manager.setPluginEnabled(entryId, enabled);
		return {
			application: result.application !== void 0 && APPLICATIONS.has(result.application) ? result.application : "failed",
			...result.restartReason !== void 0 ? { restartReason: result.restartReason } : {},
			...result.error?.diagnostic !== void 0 ? { error: result.error.diagnostic } : {},
			...result.error?.code !== void 0 ? { errorCode: result.error.code } : {}
		};
	};
	return {
		list,
		setEnabled
	};
}
// src/provider.ts
/**
* The hub's own skill provider, registered into the GLOBAL layer of the
* official ctx.skills registry.
*
* Why: in the dsh web app the base host skill-filesystem row is disabled on
* purpose — agent presets own local discovery by mounting their own
* skill-filesystem into their preset scope layers, so a host-plane query
* against the registry's empty global layer sees nothing. The hub needs a
* session-independent management view, so it contributes one itself: the
* user roots always, plus the project roots when the caller names a cwd.
*
* Agent views are unaffected: preset layers are nearer than the global
* layer, so a preset's own filesystem provider wins every duplicate name
* outright, and this provider only surfaces skills for presets that mount
* no filesystem row at all.
*/
/** Official root ranks (mirrors dsh-skill-filesystem). */
const PROJECT_DSH_RANK = 100;
const PROJECT_AGENTS_RANK = 200;
const USER_DSH_RANK = 400;
const USER_AGENTS_RANK = 500;
/**
* Global-layer skill provider for the hub's management catalog.
* Implements the official SkillProvider contract: list() returns
* invocation-neutral candidates; get() resolves the winning candidate's
* body. Both are readonly reads of the local skill roots.
*/
var SkillHubProvider = class {
	name = "skill-hub";
	home;
	control;
	watchTimer;
	rootStamp = "";
	/** 上一次 watch 失败的错误文案（同一错误只记一次，避免 5 秒定时器刷屏）。 */
	lastWatchError = "";
	constructor(control, home = dshHome()) {
		this.control = control;
		this.home = home;
		this.watchTimer = setInterval(() => {
			this.watch();
		}, 5e3);
		this.watchTimer.unref?.();
		control.signal.addEventListener("abort", () => {
			clearInterval(this.watchTimer);
		}, { once: true });
		this.watch();
	}
	/**
	* checkRoots 的守卫包装：某个根不可读（EACCES/ENOTDIR）时不能抛成未处理
	* 拒绝——构造时一次、之后每 5 秒一次。错误按文案去重，恢复后清零。
	*/
	watch() {
		this.checkRoots().then(() => {
			this.lastWatchError = "";
		}, (error) => {
			const text = errorText(error);
			if (text === this.lastWatchError) return;
			this.lastWatchError = text;
			console.warn("[dsh-skill-hub] skill root watch failed:", text);
		});
	}
	/**
	* Invalidate the registry cache when the discovered skill files changed.
	* The stamp covers the per-skill discovery file's mtime + size (plus the
	* entry set itself), so editing a SKILL.md body — not just adding or
	* renaming directories — refreshes the GUI catalog.
	*/
	async checkRoots() {
		let stamp = "";
		for (const root of await this.roots(void 0)) for (const entry of await scanRoot(root.base)) try {
			const info = await stat(entry.path);
			stamp += entry.path + ":" + info.mtimeMs + ":" + info.size + ";";
		} catch {
			stamp += entry.path + ":missing;";
		}
		if (this.rootStamp === "") {
			this.rootStamp = stamp;
			return;
		}
		if (stamp !== this.rootStamp) {
			this.rootStamp = stamp;
			this.control.invalidate();
		}
	}
	async list(options) {
		const candidates = [];
		for (const root of await this.roots(options.cwd)) for (const entry of await scanRoot(root.base)) {
			let text;
			try {
				text = await readFile(entry.path, "utf8");
			} catch {
				continue;
			}
			const parsed = parseFrontmatter(text);
			if ("error" in parsed) continue;
			const value = parsed.value;
			candidates.push({
				name: value.name,
				description: value.description,
				...value.whenToUse !== void 0 ? { whenToUse: value.whenToUse } : {},
				invocation: value.invocation,
				source: root.source,
				provider: this.name,
				rank: root.rank,
				locator: {
					path: entry.path,
					directory: entry.directory
				},
				path: entry.path
			});
		}
		return candidates;
	}
	async get(candidate) {
		const locator = candidate.locator;
		let text;
		try {
			text = await readFile(locator.path, "utf8");
		} catch {
			return;
		}
		const parsed = parseFrontmatter(text);
		if ("error" in parsed) return void 0;
		const value = parsed.value;
		return {
			name: value.name,
			description: value.description,
			...value.whenToUse !== void 0 ? { whenToUse: value.whenToUse } : {},
			invocation: value.invocation,
			source: candidate.source,
			provider: this.name,
			resourceBase: {
				kind: "directory",
				path: locator.directory
			},
			path: locator.path,
			content: value.content
		};
	}
	/**
	* The roots this provider lists: user roots always, project roots with cwd.
	*
	* Project roots are matched by their base directory against the user roots:
	* a workspace that has no project marker of its own (no `.dsh`/`.git`)
	* resolves upward to `$HOME`, whose `.dsh`/`.agents` ARE the user roots. Listing
	* those again as `project-dsh`/`project-agents` would report one physical
	* SKILL.md twice — once as a user skill, once as a project skill of that
	* workspace — which the panel then shows as duplicated rows.
	*/
	async roots(cwd) {
		const userRoots = [{
			base: rootPath("user-dsh", this.home),
			source: "user-dsh",
			rank: USER_DSH_RANK
		}, {
			base: rootPath("user-agents", this.home),
			source: "user-agents",
			rank: USER_AGENTS_RANK
		}];
		if (cwd === void 0 || cwd === "") return userRoots;
		const project = await findProjectRoot(cwd);
		const userBases = new Set(userRoots.map((root) => resolve(root.base)));
		return [...[{
			base: join(project, ".dsh", "skills"),
			source: "project-dsh",
			rank: PROJECT_DSH_RANK
		}, {
			base: join(project, ".agents", "skills"),
			source: "project-agents",
			rank: PROJECT_AGENTS_RANK
		}].filter((root) => !userBases.has(resolve(root.base))), ...userRoots];
	}
	/** Public hook for the routes: invalidate after hub-driven mutations. */
	invalidate() {
		this.control.invalidate();
	}
};
// src/routes/collection.ts
/**
* 由 origin 映射（skillName → 仓库）构建集合组，按集合名排序。
* catalog/groups 与 sources 路由共用这一份排序语义。
*/
function buildCollections(origins) {
	const byCollection = /* @__PURE__ */ new Map();
	for (const [skillName, origin] of Object.entries(origins)) {
		const list = byCollection.get(origin);
		if (list === void 0) byCollection.set(origin, [skillName]);
		else list.push(skillName);
	}
	return [...byCollection.entries()].map(([name, skillNames]) => ({
		name,
		skillNames: [...skillNames].sort((a, b) => a.localeCompare(b))
	})).sort((a, b) => a.name.localeCompare(b.name));
}
/** 系统集合组 + origin 映射（groups 路由的数据源）。 */
async function buildGroups(deps) {
	const origins = await deps.store.listOrigins();
	return {
		ok: true,
		collections: buildCollections(origins),
		origins
	};
}
// src/update.ts
/**
* Self-update check for dsh-skill-hub
* query GitHub's latest release and compare it to the installed version.
*
* This stays dependency-free: Node's global fetch is used and the version
* comparison is a small semver-subset parser (the plugin only publishes
* plain x.y.z tags, optionally prefixed with `v`).
*/
/** Repository checked for releases. Keep in sync with package.json. */
const UPDATE_REPO = "iBobbyTS/dsh-custom-instruction-manager";
const CURRENT_VERSION = createRequire(import.meta.url)("../package.json").version;
/** Normalize a release tag (`v1.2.3` → `1.2.3`) and parse it numerically. */
function parseVersion(tag) {
	const match = /^[vV]?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
	if (match === null) return null;
	return [
		Number(match[1]),
		Number(match[2]),
		Number(match[3])
	];
}
/** Compare two dotted version strings: negative when a < b, 0 equal, positive when a > b. */
function compareVersions(a, b) {
	const left = parseVersion(a);
	const right = parseVersion(b);
	if (left === null || right === null) return a.localeCompare(b, "en");
	for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
	return 0;
}
/** True when latest is strictly newer than current. */
function isUpdateAvailable(currentVersion, latestVersion) {
	return compareVersions(latestVersion, currentVersion) > 0;
}
/** Best-effort GitHub latest-release lookup. Always resolves with ok:true. */
async function checkLatestRelease(repo = UPDATE_REPO, fetchImpl = fetch) {
	const currentVersion = CURRENT_VERSION;
	/** 统一失败形状：查询失败不抛错，一律 ok:true + error 文案（调用方只看 error）。 */
	const failure = (error) => ({
		ok: true,
		currentVersion,
		latestVersion: null,
		updateAvailable: false,
		url: null,
		error
	});
	const url = `https://api.github.com/repos/${repo}/releases/latest`;
	let response;
	try {
		response = await fetchImpl(url, { headers: apiHeaders() });
	} catch (error) {
		return failure(errorText(error));
	}
	if (response.status === 404) return failure("no release published yet");
	if (!response.ok) {
		const resetAt = rateLimitResetAt(response);
		if (resetAt !== void 0) return failure("github rate limit reached; retry after " + resetAt.toLocaleTimeString() + " or set GITHUB_TOKEN");
		return failure("GitHub HTTP " + response.status);
	}
	let payload;
	try {
		payload = await response.json();
	} catch (error) {
		return failure(error instanceof Error ? error.message : "invalid GitHub response");
	}
	const record = typeof payload === "object" && payload !== null ? payload : {};
	const rawTag = typeof record.tag_name === "string" ? record.tag_name.trim() : "";
	const parsed = parseVersion(rawTag);
	if (parsed === null) return {
		ok: true,
		currentVersion,
		latestVersion: null,
		updateAvailable: false,
		url: null,
		error: "unsupported release tag: " + (rawTag || "missing")
	};
	const latestVersion = `${parsed[0]}.${parsed[1]}.${parsed[2]}`;
	return {
		ok: true,
		currentVersion,
		latestVersion,
		updateAvailable: isUpdateAvailable(currentVersion, latestVersion),
		url: typeof record.html_url === "string" ? record.html_url : null
	};
}
// src/routes/catalog-data.ts
/**
* routes 共享层 · 目录装配：已知工作区清单、完整目录响应（时间戳/interface
* 元数据/重名诊断）与详情映射。从 helpers.ts 原样搬出，行为不变。
*/
/**
* 目录中存在的技能名集合。只算启用的技能；旧版遗留的 `.disabled` 文件不属于
* 目录，也不参与去重。
*/
async function knownSkillNames(deps) {
	const snapshot = await deps.skills.snapshot();
	return new Set(snapshot.skills.map((skill) => skill.name));
}
/**
* 读取 dsh 的已知工作区清单（~/.dsh/storages/workspace.json 的
* tables.workspaces 表），**按侧面栏的显示顺序**返回：global.workspaceIds
* 是注册表维护的有序 id 表（dsh-workspace 的 `workspaceRegistry.list()`），
* 侧面栏就按它渲染；表键顺序只是插入顺序，会与界面顺序相反。没有
* workspaceIds（旧文件/手写测试）时退回表键顺序。文件缺失/损坏时返回
* 空清单（回退为仅用户级视图）。
*/
async function workspaceEntries(home) {
	try {
		const raw = await readFile(join(home, "storages", "workspace.json"), "utf8");
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return [];
		const root = parsed;
		const tables = typeof root.tables === "object" && root.tables !== null ? root.tables : void 0;
		const workspaces = tables !== void 0 && typeof tables.workspaces === "object" && tables.workspaces !== null ? tables.workspaces : void 0;
		if (workspaces === void 0) return [];
		const byId = /* @__PURE__ */ new Map();
		for (const [id, record] of Object.entries(workspaces)) {
			const entry = record;
			if (entry === null || typeof entry !== "object") continue;
			if (typeof entry.path !== "string" || entry.path === "") continue;
			byId.set(id, {
				id,
				path: entry.path,
				title: typeof entry.title === "string" && entry.title !== "" ? entry.title : entry.path
			});
		}
		const order = root.global?.workspaceIds;
		const ordered = [];
		if (Array.isArray(order)) for (const id of order) {
			if (typeof id !== "string") continue;
			const entry = byId.get(id);
			if (entry === void 0) continue;
			ordered.push(entry);
			byId.delete(id);
		}
		ordered.push(...byId.values());
		return ordered;
	} catch {
		return [];
	}
}
/**
* Build the full catalog response (shared by catalog/create handlers).
* 显式 cwd 只看该工作区；否则合并所有已知工作区（workspace.json）的项目技能
* + 用户级技能，同名技能先到先得；没有任何工作区时回退为仅用户级视图。
*/
async function buildCatalog(deps, cwd) {
	const home = homeOf(deps);
	let workspaces;
	if (cwd !== void 0 && cwd !== "") workspaces = [{
		path: cwd,
		title: cwd
	}];
	else {
		workspaces = await workspaceEntries(home);
		if (workspaces.length === 0) workspaces = [{
			path: "",
			title: ""
		}];
	}
	const byKey = /* @__PURE__ */ new Map();
	const identitiesByKey = /* @__PURE__ */ new Map();
	let complete = true;
	for (const ws of workspaces) {
		const lookup = ws.path !== "" ? { cwd: ws.path } : void 0;
		const snapshot = await deps.skills.snapshot(lookup);
		if (!snapshot.complete) complete = false;
		for (const skill of snapshot.skills) {
			const logicalKey = isProjectSource(skill.source) && ws.path !== "" ? `${skill.name}\0${ws.path}\0${skill.source}` : skill.name;
			let identities = identitiesByKey.get(logicalKey);
			if (identities === void 0) {
				identities = /* @__PURE__ */ new Set();
				identitiesByKey.set(logicalKey, identities);
			}
			identities.add(skill.source + "\0" + skill.provider);
			if (byKey.has(logicalKey)) continue;
			byKey.set(logicalKey, {
				skill,
				...isProjectSource(skill.source) && ws.path !== "" ? {
					workspace: ws.path,
					workspaceTitle: ws.title
				} : {}
			});
		}
	}
	const byName = byKey;
	const duplicateNames = [...identitiesByKey.entries()].filter(([, identities]) => identities.size > 1).map(([key]) => key.split("\0")[0]).filter((name, idx, arr) => arr.indexOf(name) === idx).sort((a, b) => a.localeCompare(b));
	const timesByName = /* @__PURE__ */ new Map();
	await Promise.all([...byName.values()].map(async ({ skill }) => {
		if (!isWritableSource(skill.source)) return;
		const base = rootPath(skill.source, home);
		for (const candidate of [
			join(base, skill.name, "SKILL.md"),
			join(base, skill.name),
			join(base, skill.name + ".md")
		]) try {
			const times = await stat(candidate);
			timesByName.set(skill.name, {
				addedAt: times.birthtimeMs,
				updatedAt: times.mtimeMs
			});
			return;
		} catch {}
	}));
	const interfaceByName = /* @__PURE__ */ new Map();
	await Promise.all([...byName.entries()].map(async ([logicalKey, { skill, workspace }]) => {
		const candidates = [];
		if (isWritableSource(skill.source)) candidates.push(join(rootPath(skill.source, home), skill.name));
		else if (isProjectSource(skill.source) && workspace !== void 0) candidates.push(join(workspace, skill.source === "project-dsh" ? ".dsh/skills" : ".agents/skills", skill.name));
		else if (isProjectSource(skill.source)) {
			for (const ws of workspaces) if (ws.path !== "") candidates.push(join(ws.path, skill.source === "project-dsh" ? ".dsh/skills" : ".agents/skills", skill.name));
		}
		for (const dir of candidates) try {
			const iface = await readSkillInterface(dir);
			if (iface !== void 0) {
				interfaceByName.set(logicalKey, iface);
				return;
			}
		} catch {}
	}));
	const skills = [...byName.entries()].map(([logicalKey, { skill, workspace, workspaceTitle }]) => {
		const row = {
			name: skill.name,
			description: skill.description,
			...skill.whenToUse !== void 0 ? { whenToUse: skill.whenToUse } : {},
			invocation: {
				modelInvocable: skill.invocation.modelInvocable,
				userInvocable: skill.invocation.userInvocable
			},
			provider: skill.provider,
			writable: isWritableSource(skill.source),
			source: skill.source,
			...workspace !== void 0 ? {
				workspace,
				workspaceTitle: workspaceTitle ?? workspace
			} : {}
		};
		const times = timesByName.get(skill.name);
		if (times !== void 0) {
			row.addedAt = times.addedAt;
			row.updatedAt = times.updatedAt;
		}
		const iface = interfaceByName.get(logicalKey);
		if (iface !== void 0) applyInterface(row, iface);
		return row;
	});
	const [userDshDiagnostics, userAgentsDiagnostics] = await Promise.all([scanDiagnostics("user-dsh", home), scanDiagnostics("user-agents", home)]);
	const diagnostics = [...userDshDiagnostics, ...userAgentsDiagnostics];
	const workspaceRefs = cwd !== void 0 && cwd !== "" ? void 0 : workspaces.filter((entry) => entry.path !== "").map((entry) => ({
		path: entry.path,
		title: entry.title
	}));
	return {
		ok: true,
		pluginVersion: CURRENT_VERSION,
		complete,
		skills,
		diagnostics,
		...workspaceRefs !== void 0 && workspaceRefs.length > 0 ? { workspaces: workspaceRefs } : {},
		...duplicateNames.length > 0 ? { duplicateNames } : {}
	};
}
/** agents/openai.yaml 的 interface 元数据 → 目录行/详情行（catalog 与详情共用）。 */
function applyInterface(row, iface) {
	if (iface.displayName !== void 0) row.displayName = iface.displayName;
	if (iface.shortDescription !== void 0) row.shortDescription = iface.shortDescription;
	if (iface.brandColor !== void 0) row.brandColor = iface.brandColor;
	if (iface.iconSmall !== void 0) row.iconSmall = iface.iconSmall;
	if (iface.iconLarge !== void 0) row.iconLarge = iface.iconLarge;
	if (iface.defaultPrompt !== void 0) row.defaultPrompt = iface.defaultPrompt;
}
/** Map a loaded definition onto the wire shape. */
function toDetail(skill, home) {
	return {
		name: skill.name,
		description: skill.description,
		...skill.whenToUse !== void 0 ? { whenToUse: skill.whenToUse } : {},
		invocation: {
			modelInvocable: skill.invocation.modelInvocable,
			userInvocable: skill.invocation.userInvocable
		},
		provider: skill.provider,
		source: skill.source,
		...skill.path !== void 0 ? {
			path: skill.path,
			editable: editableSkillFile(skill.path, home)
		} : { editable: false },
		content: skill.content
	};
}
// src/routes/helpers.ts
/**
* Wrap one handler in the shared request fences. Order matches the
* original per-handler prologue: trust fence → HTTP method → master
* switch → JSON body. The outer catch maps errors onto the JSON error
* body (preserving RepoFetchError status codes).
*
* The trust fence is the host's `/api` model (`deps.fence`) whenever the
* composition mounts Connection, so a reverse-proxied deployment is judged by
* the same authorities dsh already trusts; without that service the historical
* literal-loopback check stands in.
*/
function createRoute(deps, spec) {
	const fence = deps.fence ?? loopbackOnlyFence;
	return {
		kind: spec.kind ?? "exact",
		path: spec.path,
		handler: async (req, res) => {
			const rejection = fence(req);
			if (rejection !== void 0) {
				writeError(res, rejection, rejection === 401 ? "unauthorized: browser session required" : "forbidden: untrusted authority");
				return;
			}
			if (!spec.methods.includes(req.method)) {
				writeError(res, 405, "method not allowed: " + (req.method ?? ""));
				return;
			}
			if (spec.skipGate !== true && disabledGate(deps, res)) return;
			const url = new URL(req.url ?? "/", "http://localhost");
			let body = {};
			if (spec.jsonBody === true && req.method === "POST") {
				const parsed = await readJsonBody(req, spec.bodyLimit);
				if (parsed === void 0) {
					writeError(res, 400, "invalid JSON body" + (spec.bodyLimit === void 0 ? "" : " (limit " + spec.bodyLimit + " bytes)"));
					return;
				}
				body = parsed;
			}
			try {
				await spec.handler({
					req,
					res,
					url,
					body
				});
			} catch (error) {
				writeRouteError(res, error);
			}
		}
	};
}
// src/instructions.ts
/**
* AGENTS.md 页的磁盘清单（只读扫描）。
*
* 契约：只列「dsh 支持的文件名 ∩ 磁盘上真实存在」的文件，按用户级 + 每个
* 已知工作区分组。dsh 的候选名是固定的（用户级只有 AGENTS.md；项目级
* AGENTS.md / CLAUDE.md + AGENTS.local.md / CLAUDE.local.md），页面不改
* dsh 的加载行为，只是把磁盘现状照出来。
*
* 扫描规则（与需求契约一一对应）：
*   - 项目内递归整棵树，没有深度上限；硬剪 `.git` / `node_modules`，
*     再剪用户配置的「排除目录」（默认 `.agent-work`，任意层级精确匹配）。
*   - 隐藏目录照扫；嵌套 git 仓库照扫（它们可能就是你要看的内容）。
*   - 工作区路径本身经过排除目录的整节跳过；目录已不存在的工作区跳过。
*   - 父工作区扫描时跳过「本身是已注册工作区」的子目录，避免同一份文件在
*     父子两个标题下各出现一次。
*   - 符号链接隐藏链接、显示原始：realpath 落在项目内且仍是候选文件名时按
*     原始路径计；链接到项目外 / 坏链则保留链接自身的名字。
*   - 去重只发生在同一目录内（trim 后内容相同），与 dsh 的候选组一致；
*     跨目录即使内容相同也各自显示。
*/
/** dsh 在项目目录里认识的全部指令文件名，顺序即 dsh 的候选顺序。 */
const PROJECT_INSTRUCTION_FILES = [
	"AGENTS.md",
	"CLAUDE.md",
	"AGENTS.local.md",
	"CLAUDE.local.md"
];
/** 用户级根目录唯一的候选文件名（dsh 不认 `.local`、也不认 CLAUDE.md）。 */
const USER_INSTRUCTION_FILE = "AGENTS.md";
/** 无论配置如何都剪掉的目录：版本库元数据与依赖目录。 */
const ALWAYS_SKIPPED = /* @__PURE__ */ new Set([".git", "node_modules"]);
/** 目录遍历的并发度（readdir 并行数）；顺序由最终排序保证，与完成顺序无关。 */
const WALK_CONCURRENCY = 16;
/** 内容去重时单个文件的上限；更大的文件不读内容，按「内容不同」处理。 */
const MAX_DEDUP_BYTES = 1048576;
/** 候选文件名 → 在 dsh 候选顺序里的下标（去重时据此保留最早的一条）。 */
const CANDIDATE_INDEX = new Map(PROJECT_INSTRUCTION_FILES.map((name, index) => [name, index]));
/** Path segments of an absolute path, used for exclude-name matching. */
function pathSegments(path) {
	return path.split(/[\\/]+/).filter((segment) => segment !== "");
}
/** Whether `target` is `root` itself or sits beneath it. */
function isInside(root, target) {
	const rel = relative(root, target);
	return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
/** `~`-relative display for a user-level root (`~/.dsh`, `~/.agents`). */
function homeDisplay(path) {
	const home = homedir();
	if (path === home) return "~";
	if (path.startsWith(home + sep)) return "~/" + relative(home, path).split(sep).join("/");
	return path;
}
/** Subtitle for one project directory: `<workspace folder>[/<inner path>]`. */
function projectDisplayPath(workspaceRoot, dir) {
	const folder = basename(workspaceRoot);
	const rel = relative(workspaceRoot, dir);
	if (rel === "" || rel === ".") return folder;
	return folder + "/" + rel.split(sep).join("/");
}
/** Read one file's trimmed UTF-8 content for duplicate suppression, bounded. */
async function readTrimmed(path) {
	try {
		const info = await stat(path);
		if (!info.isFile() || info.size > MAX_DEDUP_BYTES) return void 0;
		return (await readFile(path, "utf8")).trim();
	} catch {
		return;
	}
}
/**
* Breadth-first walk of one workspace, collecting every supported candidate.
*
* Symlinked *directories* are not traversed (a link back to an ancestor would
* loop, and a linked tree is not part of this project's own layout); symlinked
* *files* are collected and resolved later. `skipDirs` holds the roots of
* workspaces nested inside this one — their subtrees belong to their own group.
* Ordering is depth-then-path (broad to specific), which keeps the list stable
* across runs.
*/
async function walkInstructionCandidates(root, excluded, skipDirs) {
	const hits = [];
	let level = [root];
	let depth = 0;
	while (level.length > 0) {
		const next = [];
		for (let start = 0; start < level.length; start += WALK_CONCURRENCY) {
			const slice = level.slice(start, start + WALK_CONCURRENCY);
			const scanned = await Promise.all(slice.map(async (dir) => {
				try {
					return {
						dir,
						entries: await readdir(dir, { withFileTypes: true })
					};
				} catch {
					return {
						dir,
						entries: void 0
					};
				}
			}));
			for (const { dir, entries } of scanned) {
				if (entries === void 0) continue;
				entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
				for (const entry of entries) {
					const name = entry.name;
					if (entry.isDirectory()) {
						if (ALWAYS_SKIPPED.has(name) || excluded.has(name)) continue;
						const child = join(dir, name);
						if (skipDirs.has(child)) continue;
						next.push(child);
						continue;
					}
					const offset = CANDIDATE_INDEX.get(name);
					if (offset === void 0) continue;
					if (!entry.isFile() && !entry.isSymbolicLink()) continue;
					hits.push({
						absolute: join(dir, name),
						dir,
						depth,
						offset
					});
				}
			}
		}
		level = next;
		depth += 1;
	}
	hits.sort((a, b) => {
		if (a.depth !== b.depth) return a.depth - b.depth;
		if (a.dir !== b.dir) return a.dir < b.dir ? -1 : 1;
		return a.offset - b.offset;
	});
	return hits;
}
/**
* Turn one workspace's candidates into display rows.
*
* Two collapses, in order: identity (realpath) and per-directory trimmed
* content. The earliest candidate in dsh order wins both times, so a link is
* dropped for its target and a copied sibling for the first real file.
*/
async function projectRows(workspaceRoot, hits) {
	const seen = /* @__PURE__ */ new Set();
	const scanned = [];
	for (const hit of hits) {
		let canonical = hit.absolute;
		const real = await realpath(hit.absolute).catch(() => void 0);
		if (real !== void 0 && isInside(workspaceRoot, real) && CANDIDATE_INDEX.has(basename(real))) canonical = real;
		if (seen.has(canonical)) continue;
		seen.add(canonical);
		scanned.push({
			path: canonical,
			dir: dirname(canonical)
		});
	}
	const perDirectory = /* @__PURE__ */ new Map();
	for (const row of scanned) perDirectory.set(row.dir, (perDirectory.get(row.dir) ?? 0) + 1);
	const digestsByDirectory = /* @__PURE__ */ new Map();
	const rows = [];
	for (const row of scanned) {
		if ((perDirectory.get(row.dir) ?? 0) > 1) {
			const trimmed = await readTrimmed(row.path);
			if (trimmed !== void 0) {
				let digests = digestsByDirectory.get(row.dir);
				if (digests === void 0) {
					digests = /* @__PURE__ */ new Set();
					digestsByDirectory.set(row.dir, digests);
				}
				if (digests.has(trimmed)) continue;
				digests.add(trimmed);
			}
		}
		rows.push({
			name: basename(row.path),
			path: projectDisplayPath(workspaceRoot, row.dir),
			absolute: row.path
		});
	}
	return rows;
}
/** User-level rows: the two roots' `AGENTS.md`, identical content collapsed. */
async function userRows(dshRoot, agentsRoot) {
	const rows = [];
	const digests = /* @__PURE__ */ new Set();
	for (const root of [dshRoot, agentsRoot]) {
		const file = join(root, USER_INSTRUCTION_FILE);
		const info = await stat(file).catch(() => void 0);
		if (info === void 0 || !info.isFile()) continue;
		const trimmed = await readTrimmed(file);
		if (trimmed !== void 0) {
			if (digests.has(trimmed)) continue;
			digests.add(trimmed);
		}
		const real = await realpath(file).catch(() => void 0);
		const canonical = real !== void 0 && CANDIDATE_INDEX.has(basename(real)) ? real : file;
		rows.push({
			name: basename(canonical),
			path: homeDisplay(root),
			absolute: canonical
		});
	}
	return rows;
}
/**
* 算出一次扫描要覆盖的作用域。
* @param deps - route dependencies (homes + hub config).
* @returns 用户级分组、按侧边栏顺序的工作区清单，以及生效的排除目录。
*/
async function planInstructionScan(deps) {
	const dshRoot = deps.home ?? dshHome();
	const agentsRoot = deps.agentsHome ?? agentsHome();
	const excludeDirs = resolveExcludeDirs(configOf(deps).excludeDirs);
	const excluded = new Set(excludeDirs);
	const user = {
		kind: "user",
		files: await userRows(dshRoot, agentsRoot)
	};
	const entries = await workspaceEntries(dshRoot);
	const ownOf = async (path) => await realpath(path).catch(() => void 0) ?? resolve(path);
	const registered = [];
	for (const entry of entries) if (entry.path !== "") registered.push(await ownOf(entry.path));
	const projects = [];
	for (const entry of entries) {
		if (entry.path === "") continue;
		if (pathSegments(entry.path).some((segment) => excluded.has(segment))) continue;
		const info = await stat(entry.path).catch(() => void 0);
		if (info === void 0 || !info.isDirectory()) continue;
		const own = await ownOf(entry.path);
		const nested = new Set(registered.filter((other) => other !== own && isInside(own, other)));
		const title = entry.title === entry.path ? basename(entry.path) : entry.title;
		projects.push({
			title: title === "" ? basename(entry.path) : title,
			own,
			nested
		});
	}
	return {
		excludeDirs,
		user,
		projects
	};
}
/**
* 扫一个已注册工作区，产出该组的行。
* @param plan - the scan plan this project came from (exclude list).
* @param project - one plan entry.
* @returns that workspace's group.
*/
async function scanProjectGroup(plan, project) {
	const hits = await walkInstructionCandidates(project.own, new Set(plan.excludeDirs), project.nested);
	return {
		kind: "project",
		title: project.title,
		files: await projectRows(project.own, hits)
	};
}
/**
* Scan every scope for supported instruction files in one go.
* @param deps - route dependencies (home overrides for tests, hub config for the exclude list).
* @returns the ordered groups plus the exclude list that produced them.
*/
async function scanInstructionGroups(deps) {
	const plan = await planInstructionScan(deps);
	const groups = [plan.user];
	for (const project of plan.projects) groups.push(await scanProjectGroup(plan, project));
	return {
		groups,
		excludeDirs: plan.excludeDirs
	};
}
/** 指令文件正文读取的上限；超过视为不可展示（dsh 自己也会忽略超大文件）。 */
const MAX_DETAIL_BYTES = 1048576;
/** A refusal from the instruction-file detail reader, carrying its HTTP status. */
var InstructionFileError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.status = status;
		this.name = "InstructionFileError";
	}
};
/**
* The roster row behind one absolute path, or undefined when the path is not
* one of this page's rows. Both readings (the GET detail and the save) go
* through it, so the write entry accepts exactly the files the list shows.
*
* 清单里存的是 realpath（macOS 的 /var → /private/var 会让字面路径对不上），
* 所以两边都过一遍 realpath，同时接受调用方原样回传的行值。
*/
async function instructionRefOf(deps, absolutePath, scan) {
	const literal = resolve(absolutePath);
	const canonical = await realpath(absolutePath).catch(() => literal);
	return (scan ?? await scanInstructionGroups(deps)).groups.flatMap((group) => group.files).find((row) => {
		const own = resolve(row.absolute);
		return own === canonical || own === literal;
	});
}
/**
* Read one instruction file that the current scan reports.
*
* The lookup is validated against the page's own rows (no arbitrary file reads
* through the route) and reuses the same canonical/realpath rules the list
* shows — the list it compares against is exactly what the user clicked.
* @param deps - route dependencies (homes + config).
* @param absolutePath - the row's `absolute`, as sent by the panel.
* @param scan - an already-computed scan to validate against; omitted runs one
*  (the route passes its cached list so a row click never re-walks the tree).
* @returns the file body plus its on-disk metadata.
* @throws {InstructionFileError} 404 when the path is not a current row,
*  413 when the file is too large to display.
*/
async function readInstructionFile(deps, absolutePath, scan) {
	const ref = await instructionRefOf(deps, absolutePath, scan);
	if (ref === void 0) throw new InstructionFileError("not an instruction file on this page: " + absolutePath, 404);
	const info = await stat(ref.absolute).catch(() => void 0);
	if (info === void 0 || !info.isFile()) throw new InstructionFileError("cannot read file: " + absolutePath, 404);
	if (info.size > MAX_DETAIL_BYTES) throw new InstructionFileError("instruction file is too large to display (" + info.size + " bytes)", 413);
	const content = await readFile(ref.absolute, "utf8").catch(() => void 0);
	if (content === void 0) throw new InstructionFileError("cannot read file: " + absolutePath, 404);
	return {
		...ref,
		size: info.size,
		modifiedAt: info.mtimeMs,
		content
	};
}
/**
* 冲突：磁盘上的文件在编辑期间被改过（agent、别的编辑器、同步）。`latest`
* 是刚读到的状态，路由把它原样回给客户端，让「复制并重新加载 / 继续编辑 /
* 仍然覆盖」三选有据可依。
*/
var StaleContentError = class extends Error {
	latest;
	constructor(message, latest) {
		super(message);
		this.latest = latest;
		this.name = "StaleContentError";
	}
};
/**
* 写回一份指令文件的整份原文。
* @param deps - route dependencies.
* @param absolutePath - the row's `absolute`, as sent by the panel.
* @param content - 新的整份正文（不做 trim，原样落盘）。
* @param expected - 载入时的 mtime/size；缺省表示不做冲突检查。
* @param scan - the cached roster (same one the detail read used).
* @returns 写回后的文件大小与 mtime。
* @throws {InstructionFileError} 404 不在清单里 / 文件已消失；413 正文过大。
* @throws {StaleContentError} 409 期间被外部改过（带最新内容）。
*/
async function saveInstructionFile(deps, absolutePath, content, expected, scan) {
	const ref = await instructionRefOf(deps, absolutePath, scan);
	if (ref === void 0) throw new InstructionFileError("not an instruction file on this page: " + absolutePath, 404);
	const snapshot = await readFileSnapshot(ref.absolute);
	if (snapshot === void 0) throw new InstructionFileError("cannot read file: " + absolutePath, 404);
	if (Buffer.byteLength(content, "utf8") > MAX_DETAIL_BYTES) throw new InstructionFileError("instruction file is too large to save (limit 1048576 bytes)", 413);
	if (expected?.modifiedAt !== void 0 && expected.size !== void 0 && (expected.modifiedAt !== snapshot.modifiedAt || expected.size !== snapshot.size)) throw new StaleContentError("file changed on disk since it was loaded", {
		content: snapshot.text,
		modifiedAt: snapshot.modifiedAt,
		size: snapshot.size
	});
	const written = await writeTextAtomic(ref.absolute, content, snapshot.mode);
	return {
		path: ref.absolute,
		...written
	};
}
// src/routes/agents.ts
/**
* AGENTS.md 域路由：指令文件清单（用户级 + 每个已知工作区）与文档正文。
*
* 这一页不写索引、也没有开关语义——dsh 对指令文件没有启用/禁用概念。排除
* 目录清单走既有的 /config 路由（HubConfig.excludeDirs），这一族只负责按
* 当前配置扫磁盘。
*
* 索引分两层：
*   - **缓存**（见 ../agents-index.ts）：上一次完整扫描的结果，内存一份 + 磁盘
*     一份（插件加载时读回），按（家目录 + 共享根 + 排除目录）分键。面板打开
*     页面先读它（GET /agents），一次遍历都不用跑；点开一行、保存正文也用它做
*     成员资格校验，所以「进入分类 → 点开一行」不再是两次全树遍历。
*   - **进行中的扫描**（`staged`）：GET /agents/scan 分步推进。第 0 步建一份
*     计划并回用户级分组，之后每个工作区一步；最后一步把整份结果提升为缓存。
*     面板每步把它并进列表，所以扫描期间看到的是「缓存打底 + 扫到的实时替换」。
*
* 成员资格校验用「缓存 ∪ 进行中」：扫描期间新冒出来的文件在完成前就能点开，
* 不必等这一轮跑完。
*/
/**
* 进行中的扫描，按同一个键分键（键与索引缓存一致：家目录 + 共享根 + 排除
* 目录）；同时开着两轮时后一轮顶掉前一轮。
*/
const staged = /* @__PURE__ */ new Map();
/** 当前配置下的排除目录清单（无缓存时也能先把排除目录的条目画出来）。 */
function currentExcludeDirs(deps) {
	return resolveExcludeDirs(configOf(deps).excludeDirs);
}
/**
* 一份可用于成员资格校验的清单：完成的缓存加上进行中的那部分。
*
* 两者都没有（host 刚起来、面板直接点了一个旧行的路径）时兜底整扫一次，
* 保证正文读取与保存永远有据可依。
*/
async function rosterFor(deps) {
	const cached = cachedAgentsRoster(deps)?.roster;
	const live = staged.get(agentsKeyString(deps));
	if (cached !== void 0 && live !== void 0) return {
		excludeDirs: cached.excludeDirs,
		groups: [...cached.groups, ...live.groups]
	};
	if (cached !== void 0) return cached;
	if (live !== void 0) return {
		excludeDirs: live.plan.excludeDirs,
		groups: live.groups
	};
	const roster = await scanInstructionGroups(deps);
	await saveAgentsRoster(deps, roster);
	return roster;
}
/** 一轮扫完：整份结果成为新的缓存（内存 + 磁盘），进行中的那份退场。 */
async function promote(deps, scan) {
	await saveAgentsRoster(deps, {
		groups: scan.groups,
		excludeDirs: scan.plan.excludeDirs
	});
	staged.delete(agentsKeyString(deps));
}
/** 一步的响应体（`groups[step]` 就是本步的分组）。 */
function stepPayload(scan, step) {
	const total = 1 + scan.plan.projects.length;
	return {
		ok: true,
		scanId: scan.scanId,
		step,
		done: step + 1,
		total,
		more: step + 1 < total,
		group: scan.groups[step] ?? {
			kind: "project",
			files: []
		},
		excludeDirs: scan.plan.excludeDirs
	};
}
/** 解析非负整数步序号；非法返回 undefined。 */
function stepOf(url) {
	const raw = url.searchParams.get("step") ?? "";
	if (!/^\d+$/.test(raw)) return void 0;
	const step = Number(raw);
	return Number.isSafeInteger(step) ? step : void 0;
}
/** AGENTS.md 页的全部路由 spec（由 routes.ts 包上统一围栏）。 */
function agentsRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.agents,
			methods: ["GET"],
			handler: async ({ res }) => {
				const hit = cachedAgentsRoster(deps);
				writeJson(res, 200, hit === void 0 ? {
					ok: true,
					cached: false,
					scannedAt: 0,
					groups: [],
					excludeDirs: currentExcludeDirs(deps)
				} : {
					ok: true,
					cached: true,
					scannedAt: hit.at,
					groups: hit.roster.groups,
					excludeDirs: hit.roster.excludeDirs
				});
			}
		},
		{
			path: SKILL_HUB_API.agentsScan,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const step = stepOf(url);
				if (step === void 0) {
					writeError(res, 400, "step must be a non-negative integer");
					return;
				}
				const key = agentsKeyString(deps);
				try {
					if (step === 0) {
						const plan = await planInstructionScan(deps);
						const scan = {
							scanId: "scan_" + randomUUID().slice(0, 8),
							plan,
							groups: [plan.user]
						};
						staged.set(key, scan);
						if (scan.groups.length >= 1 + plan.projects.length) await promote(deps, scan);
						writeJson(res, 200, stepPayload(scan, 0));
						return;
					}
					const scan = staged.get(key);
					const requested = (url.searchParams.get("scan") ?? "").trim();
					if (scan === void 0 || requested !== "" && requested !== scan.scanId) {
						writeJson(res, 409, {
							error: "scan session expired",
							code: "expired"
						});
						return;
					}
					if (step >= 1 + scan.plan.projects.length) {
						writeError(res, 400, "step out of range");
						return;
					}
					scan.groups.push(await scanProjectGroup(scan.plan, scan.plan.projects[step - 1]));
					const payload = stepPayload(scan, step);
					if (payload.more === false) await promote(deps, scan);
					writeJson(res, 200, payload);
				} catch (error) {
					writeRouteError(res, error);
				}
			}
		},
		{
			path: SKILL_HUB_API.agentsFile,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const requested = (url.searchParams.get("path") ?? "").trim();
				if (requested === "") {
					writeError(res, 400, "path is required");
					return;
				}
				try {
					writeJson(res, 200, {
						ok: true,
						file: await readInstructionFile(deps, requested, await rosterFor(deps))
					});
				} catch (error) {
					if (error instanceof InstructionFileError) {
						writeError(res, error.status, error.message);
						return;
					}
					writeRouteError(res, error);
				}
			}
		},
		{
			path: SKILL_HUB_API.agentsFileSave,
			methods: ["POST"],
			jsonBody: true,
			bodyLimit: MAX_EDIT_BODY_BYTES,
			handler: async ({ res, body }) => {
				const requested = readString(body, "path").trim();
				if (requested === "") {
					writeError(res, 400, "path is required");
					return;
				}
				if (typeof body.content !== "string") {
					writeError(res, 400, "content must be a string");
					return;
				}
				const expectedMtime = readNumber(body, "expectedMtime");
				const expectedSize = readNumber(body, "expectedSize");
				const expected = expectedMtime !== void 0 && expectedSize !== void 0 ? {
					modifiedAt: expectedMtime,
					size: expectedSize
				} : void 0;
				try {
					const scan = await rosterFor(deps);
					writeJson(res, 200, {
						ok: true,
						...await saveInstructionFile(deps, requested, body.content, expected, scan)
					});
				} catch (error) {
					if (error instanceof InstructionFileError) {
						writeError(res, error.status, error.message);
						return;
					}
					if (error instanceof StaleContentError) {
						writeJson(res, 409, {
							error: error.message,
							code: "stale",
							latest: error.latest
						});
						return;
					}
					if (writeFileFailure(res, error, requested)) return;
					writeRouteError(res, error);
				}
			}
		}
	];
}
// src/routes/catalog.ts
/**
* 目录域路由：catalog / skill 详情 / skill 删除 / create / stats。
* 从 routes.ts 原样搬出，handler 逻辑不变。
*/
/**
* 文件创建/修改时间与大小 → 详情行的 addedAt/updatedAt/size（读取失败时省略
* 字段，详情页不显示那两行）；size 是编辑保存时判断「磁盘是否被改过」的指纹之一。
*/
async function applyFileTimes(row, path) {
	try {
		const times = await stat(path);
		row.addedAt = times.birthtimeMs;
		row.updatedAt = times.mtimeMs;
		row.size = times.size;
	} catch {}
}
/**
* 详情/写调用方式/写正文共用的解析顺序：显式 cwd 只看该工作区；否则按已知
* 工作区逐个查找（与目录默认视图一致），最后回退用户级根，保证默认视图里
* 可见的项目技能也能打开详情、也能被同一个技能命中。
*/
async function findSkill(deps, name, cwd) {
	if (cwd !== "") return deps.skills.get(name, { cwd });
	for (const ws of await workspaceEntries(homeOf(deps))) {
		const skill = await deps.skills.get(name, { cwd: ws.path });
		if (skill !== void 0) return skill;
	}
	return deps.skills.get(name);
}
/** 目录域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function catalogRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.catalog,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				writeJson(res, 200, await buildCatalog(deps, queryParam(url, "cwd")));
			}
		},
		{
			path: SKILL_HUB_API.skill,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const name = queryParam(url, "name");
				if (name === void 0 || name === "") {
					writeError(res, 400, "name query parameter is required");
					return;
				}
				const skill = await findSkill(deps, name, queryParam(url, "cwd") ?? "");
				if (skill === void 0) {
					writeError(res, 404, "skill not found: " + name);
					return;
				}
				const detail = toDetail(skill, homeOf(deps));
				if (skill.path !== void 0) {
					await applyFileTimes(detail, skill.path);
					try {
						const rb = skill.resourceBase;
						const dir = rb?.kind === "directory" && typeof rb.path === "string" ? rb.path : skill.path.endsWith("SKILL.md") ? dirname(skill.path) : void 0;
						if (dir !== void 0) {
							const iface = await readSkillInterface(dir);
							if (iface !== void 0) applyInterface(detail, iface);
						}
					} catch {}
				}
				writeJson(res, 200, {
					ok: true,
					skill: detail
				});
			}
		},
		{
			path: SKILL_HUB_API.skillInvocation,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const name = readString(body, "name").trim();
				if (!isSkillName(name)) {
					writeError(res, 400, "skill name must be kebab-case (lowercase letters, digits, dashes)");
					return;
				}
				if (typeof body.modelInvocable !== "boolean" || typeof body.userInvocable !== "boolean") {
					writeError(res, 400, "modelInvocable and userInvocable must be booleans");
					return;
				}
				const policy = {
					modelInvocable: body.modelInvocable,
					userInvocable: body.userInvocable
				};
				const skill = await findSkill(deps, name, readString(body, "cwd"));
				if (skill === void 0) {
					writeError(res, 404, "skill not found: " + name);
					return;
				}
				if (skill.path === void 0) {
					writeError(res, 409, "skill \"" + name + "\" is registered by provider \"" + skill.provider + "\" and has no file to edit");
					return;
				}
				const path = skill.path;
				if (!editableSkillFile(path, homeOf(deps))) {
					writeError(res, 409, "skill \"" + name + "\" is managed by provider \"" + skill.provider + "\"; only skill files under a user or project root can change invocation");
					return;
				}
				try {
					await setInvocationPolicy(path, policy, homeOf(deps));
				} catch (error) {
					if (error instanceof TypeError) {
						writeError(res, 400, errorText(error));
						return;
					}
					if (error.code === "ENOENT") {
						writeError(res, 409, "skill file is missing on disk: " + path);
						return;
					}
					throw error;
				}
				deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					name,
					path,
					invocation: policy
				});
			}
		},
		{
			path: SKILL_HUB_API.skillReveal,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const name = readString(body, "name");
				if (name === "") {
					writeError(res, 400, "name is required");
					return;
				}
				const target = (await findSkill(deps, name, readString(body, "cwd")))?.path;
				if (target === void 0) {
					writeError(res, 404, "skill has no file on disk: " + name);
					return;
				}
				if (isBundledPath(target)) {
					writeError(res, 409, "skill lives inside the dsh application bundle: " + target);
					return;
				}
				if (!await pathExists(target)) {
					writeError(res, 404, "skill file is missing on disk: " + target);
					return;
				}
				try {
					await (deps.reveal ?? revealInFileManager)(target);
				} catch (error) {
					writeError(res, 500, "cannot open the file manager: " + errorText(error));
					return;
				}
				writeJson(res, 200, {
					ok: true,
					name,
					path: target
				});
			}
		},
		{
			path: SKILL_HUB_API.skillDelete,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const name = readString(body, "name");
				if (name === "") {
					writeError(res, 400, "name is required");
					return;
				}
				const cwd = readString(body, "cwd");
				const resolved = await resolveWritableSkill(deps, name, cwd !== "" ? cwd : void 0);
				if (!resolved.ok) {
					writeError(res, resolved.status, resolved.error);
					return;
				}
				const entry = trashSourceOf(resolved.path);
				let path;
				try {
					path = await trashSkillToSystem(entry, deps.trashDir ?? systemTrashDir());
				} catch (error) {
					writeError(res, error.code === "ENOENT" ? 404 : 409, "cannot move the skill into the system trash: " + errorText(error));
					return;
				}
				await deps.store.removeSkillFromSources(name);
				deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					name,
					path
				});
			}
		},
		{
			path: SKILL_HUB_API.create,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const name = readString(body, "name").trim();
				if (!isSkillName(name)) {
					writeError(res, 400, "skill name must be kebab-case (lowercase letters, digits, dashes)");
					return;
				}
				const rootText = body.root === void 0 ? "user-dsh" : readString(body, "root");
				if (!isWritableSource(rootText)) {
					writeError(res, 400, "root must be user-dsh or user-agents");
					return;
				}
				const root = rootText;
				if (await deps.skills.get(name) !== void 0) {
					writeError(res, 409, "skill name already exists: " + name);
					return;
				}
				const occupancy = await occupancyOf(rootPath(root, homeOf(deps)), name);
				if (occupancy.enabled.length > 0) {
					writeError(res, 409, "a skill file already occupies this name on disk: " + name + " (check the discovery diagnostics)");
					return;
				}
				if (occupancy.disabled.length > 0) {
					writeError(res, 409, "name is occupied by a legacy .disabled file on disk: " + name + " (rename or remove it manually)");
					return;
				}
				if (occupancy.bareDir !== void 0) {
					writeError(res, 409, "name is occupied by an empty directory on disk: " + name + " (check the discovery diagnostics)");
					return;
				}
				const path = await createSkill(root, name, readString(body, "description"), homeOf(deps));
				deps.invalidate?.();
				writeJson(res, 201, {
					ok: true,
					path,
					root
				});
			}
		},
		{
			path: SKILL_HUB_API.stats,
			methods: ["GET"],
			handler: async ({ res }) => {
				if (deps.stats === void 0) {
					writeJson(res, 200, {
						ok: true,
						available: false,
						stats: []
					});
					return;
				}
				const display = configOf(deps);
				if (display.showUseCount === false && display.showUseTime === false && display.showGroupSummary === false) {
					writeJson(res, 200, {
						ok: true,
						available: false,
						stats: []
					});
					return;
				}
				const stats = await deps.stats();
				writeJson(res, 200, {
					ok: true,
					available: true,
					...deps.stats.source !== void 0 ? { source: deps.stats.source } : {},
					stats
				});
			}
		}
	];
}
// src/routes/config.ts
/**
* 配置域路由：config（总开关开着也可用，设置卡自救入口）/ update 自身更新
* 检查 / diagnosticFix。从 routes.ts 原样搬出，handler 逻辑不变。
*/
/**
* Build a config payload for either method. The GitHub token never goes out:
* the effective config and the raw saved overrides are both stripped, and its
* presence is reported as a plain boolean instead.
*/
function configResponse(config, saved) {
	const token = config.githubToken;
	return {
		ok: true,
		pluginVersion: CURRENT_VERSION,
		config: redactGithubToken(config),
		saved: redactGithubToken(saved),
		githubTokenSet: token !== void 0 && token !== ""
	};
}
/** 配置域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function configRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.config,
			methods: ["GET", "POST"],
			jsonBody: true,
			skipGate: true,
			handler: async ({ req, res, body }) => {
				if (req.method === "GET") {
					writeJson(res, 200, configResponse(configOf(deps), savedOf(deps)));
					return;
				}
				const raw = body;
				const patch = {};
				if (raw.enabled !== void 0) {
					if (raw.enabled === null) patch.enabled = void 0;
					else if (typeof raw.enabled !== "boolean") {
						writeError(res, 400, "enabled must be a boolean or null");
						return;
					} else patch.enabled = raw.enabled;
				}
				for (const key of [
					"showUseCount",
					"showUseTime",
					"showGroupSummary"
				]) {
					const value = raw[key];
					if (value === void 0) continue;
					if (value === null) {
						patch[key] = void 0;
						continue;
					}
					if (typeof value !== "boolean") {
						writeError(res, 400, key + " must be a boolean or null");
						return;
					}
					patch[key] = value;
				}
				for (const key of ["dotModelColor", "dotUserColor"]) {
					const value = raw[key];
					if (value === void 0) continue;
					if (value === null) {
						patch[key] = void 0;
						continue;
					}
					if (typeof value !== "string" || !HEX_COLOR_RE.test(value)) {
						writeError(res, 400, key + " must be a #rrggbb color or null");
						return;
					}
					patch[key] = value;
				}
				if (raw.excludeDirs !== void 0) {
					const value = raw.excludeDirs;
					if (value === null) patch.excludeDirs = void 0;
					else if (!Array.isArray(value)) {
						writeError(res, 400, "excludeDirs must be an array of directory names or null");
						return;
					} else if (value.some((entry) => typeof entry !== "string")) {
						writeError(res, 400, "excludeDirs must be an array of directory names or null");
						return;
					} else if (value.some((entry) => entry.includes("/") || entry.includes("\\"))) {
						writeError(res, 400, "excludeDirs entries must be directory names, not paths");
						return;
					} else patch.excludeDirs = resolveExcludeDirs(value, []);
				}
				if (raw.githubToken !== void 0) {
					const value = raw.githubToken;
					if (value === null) patch.githubToken = void 0;
					else if (typeof value !== "string" || value.trim() === "") patch.githubToken = void 0;
					else if (!GITHUB_TOKEN_RE.test(value.trim())) {
						writeError(res, 400, "githubToken looks invalid (expected a personal access token)");
						return;
					} else patch.githubToken = value.trim();
				}
				let config;
				if (deps.updateConfig === void 0) {
					const merged = { ...configOf(deps) };
					for (const [key, value] of Object.entries(patch)) if (value === void 0) delete merged[key];
					else merged[key] = value;
					config = merged;
				} else config = await deps.updateConfig(patch);
				writeJson(res, 200, configResponse(config, savedOf(deps)));
			}
		},
		{
			path: SKILL_HUB_API.update,
			methods: ["GET"],
			handler: async ({ res }) => {
				writeJson(res, 200, await checkLatestRelease());
			}
		},
		{
			path: SKILL_HUB_API.diagnosticFix,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const request = body;
				const rawPath = typeof request.path === "string" ? request.path.trim() : "";
				if (rawPath === "") {
					writeError(res, 400, "path is required");
					return;
				}
				try {
					await fixDiagnosticFile(rawPath, homeOf(deps));
					deps.invalidate?.();
					writeJson(res, 200, {
						ok: true,
						path: rawPath
					});
				} catch (error) {
					if (error instanceof TypeError) {
						writeError(res, 400, error);
						return;
					}
					writeRouteError(res, error);
				}
			}
		}
	];
}
// src/routes/edit.ts
/**
* 编辑保存路由：把技能正文写回 SKILL.md。
*
* 边界（与需求契约一致）：
*  - 只替换 frontmatter 之后的那段正文，frontmatter 逐字节保留
*    （name / description / 调用键都归详情页的其他控件管）；
*  - 可写范围沿用调用方式那条线：用户根与项目根的真实发现文件，内置/插件
*    provider 没有文件可写；
*  - 载入时的 mtime/size 与磁盘不一致 → 409 + 最新内容，客户端弹
*    「复制并重新加载 / 继续编辑 / 仍然覆盖」；
*  - 同目录临时文件 + rename 原子落盘，保留原权限位。
*/
/** 技能正文写回的全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function editRoutes(deps) {
	return [{
		path: SKILL_HUB_API.skillContent,
		methods: ["POST"],
		jsonBody: true,
		bodyLimit: MAX_EDIT_BODY_BYTES,
		handler: async ({ res, body }) => {
			const name = readString(body, "name").trim();
			if (!isSkillName(name)) {
				writeError(res, 400, "skill name must be kebab-case (lowercase letters, digits, dashes)");
				return;
			}
			if (typeof body.content !== "string") {
				writeError(res, 400, "content must be a string");
				return;
			}
			const content = body.content;
			const skill = await findSkill(deps, name, readString(body, "cwd"));
			if (skill === void 0) {
				writeError(res, 404, "skill not found: " + name);
				return;
			}
			if (skill.path === void 0) {
				writeError(res, 409, "skill \"" + name + "\" is registered by provider \"" + skill.provider + "\" and has no file to edit");
				return;
			}
			const path = skill.path;
			if (!editableSkillFile(path, homeOf(deps))) {
				writeError(res, 409, "skill \"" + name + "\" is managed by provider \"" + skill.provider + "\"; only skill files under a user or project root can be edited");
				return;
			}
			const snapshot = await readFileSnapshot(path);
			if (snapshot === void 0) {
				writeError(res, 409, "skill file is missing on disk: " + path);
				return;
			}
			const expectedMtime = readNumber(body, "expectedMtime");
			const expectedSize = readNumber(body, "expectedSize");
			if (expectedMtime !== void 0 && expectedSize !== void 0 && (expectedMtime !== snapshot.modifiedAt || expectedSize !== snapshot.size)) {
				const parsed = parseFrontmatter(snapshot.text);
				writeJson(res, 409, {
					error: "file changed on disk since it was loaded",
					code: "stale",
					latest: {
						content: "error" in parsed ? "" : parsed.value.content,
						modifiedAt: snapshot.modifiedAt,
						size: snapshot.size
					}
				});
				return;
			}
			const replaced = replaceSkillBody(snapshot.text, content);
			if ("error" in replaced) {
				writeError(res, 409, replaced.error);
				return;
			}
			let written;
			try {
				written = await writeTextAtomic(path, replaced.text, snapshot.mode);
			} catch (error) {
				if (writeFileFailure(res, error, path)) return;
				throw error;
			}
			deps.invalidate?.();
			writeJson(res, 200, {
				ok: true,
				name,
				path,
				content: replaced.body,
				modifiedAt: written.modifiedAt,
				size: written.size
			});
		}
	}];
}
/** Last successful check time per repo (in-memory throttle for GitHub rate limits). */
const lastSourceCheck = /* @__PURE__ */ new Map();
/** Last successful market update check per repo (same throttle). */
const lastMarketCheck = /* @__PURE__ */ new Map();
/** Market stats (stars/downloads) throttle: hourly, plus a fallback cache. */
const lastMarketStats = /* @__PURE__ */ new Map();
const marketStatsCache = /* @__PURE__ */ new Map();
/** One-time seed of the in-memory stats cache from the sidecar (survives restarts). */
let marketStatsSeeded = false;
async function seedMarketStats(deps) {
	if (marketStatsSeeded) return;
	marketStatsSeeded = true;
	try {
		const saved = await deps.store.getMarketStatsState();
		if (saved === void 0) return;
		for (const [repo, stats] of Object.entries(saved.stats)) if (!marketStatsCache.has(repo)) {
			marketStatsCache.set(repo, stats);
			lastMarketStats.set(repo, saved.fetchedAt);
		}
	} catch {}
}
const importJobs = /* @__PURE__ */ new Map();
function gcImportJobs() {
	const now = Date.now();
	for (const [id, job] of importJobs) if (job.status !== "running" && now - job.createdAt > 3e5) importJobs.delete(id);
	if (importJobs.size > 100) {
		const finished = [...importJobs.entries()].filter(([, job]) => job.status !== "running").sort((a, b) => a[1].createdAt - b[1].createdAt);
		for (let i = 0; i < finished.length && importJobs.size > 100; i++) importJobs.delete(finished[i][0]);
	}
}
/**
* Replace whatever currently occupies a skill slot with a fresh download;
* restores the previous state on failure.
*
* `target` is the entry to move aside — a bundle **directory** or a flat
* `<name>.md` file, whichever the download is replacing (the rename/rm below
* are form-neutral). The backup is dot-prefixed (discovery skips dot entries),
* so even a failed cleanup can never register as a duplicate skill.
*/
async function replaceInPlace(target, download) {
	const backup = join(dirname(target), "." + basename(target) + ".sync-bak-" + Date.now());
	await rename(target, backup);
	try {
		await download();
	} catch (error) {
		await rename(backup, target).catch((rollbackError) => {
			console.warn("[dsh-skill-hub] restoring " + target + " from " + backup + " failed:", errorText(rollbackError));
		});
		throw error;
	}
	await rm(backup, {
		recursive: true,
		force: true
	});
}
/**
* 让位：把一个名字下的「非启用态占位」移入回收站。
* 只动这两类，**启用的技能一律不碰**：
* - 旧版遗留的禁用发现文件（`<name>/SKILL.md.disabled` 或 `<name>.md.disabled`，两种形态都认）；
* - 同名目录存在但既无 `SKILL.md` 也无 `SKILL.md.disabled`（导入中断/手工删除的空壳）。
*
* 回收站按名字索引，所以多形态只会记下最后一条的恢复指针；其余的那份会在
* 「清空回收站」时被孤儿回收扫掉（见 sourceTrashClear）。
*
* @returns 被移入回收站的路径列表，没有可让位的东西时 undefined。
*/
async function retireNamePlaceholders(deps, base, name) {
	const occupancy = await occupancyOf(base, name);
	const sources = [.../* @__PURE__ */ new Set([...occupancy.disabled.map((path) => trashSourceOf(path)), ...occupancy.bareDir !== void 0 ? [occupancy.bareDir] : []])];
	if (sources.length === 0) return void 0;
	const trashed = [];
	for (const source of sources) {
		const moved = await moveIntoTrash(source);
		await deps.store.addTrash({
			name,
			path: moved.path,
			movedAt: Date.now(),
			sourcePath: moved.source
		});
		trashed.push(moved.path);
	}
	return trashed;
}
// src/routes/market.ts
/**
* 市场域路由：market 列表 / source 增删 / ref 锁定 / versions 选择器 /
* source/check 更新检查 / stats 星标统计 / source/sync 对齐版本。
* 从 routes.ts 原样搬出，handler 逻辑不变。
*/
/** 市场域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function marketRoutes(deps) {
	const checkMarketSources = async ({ res }) => {
		const sources = await deps.store.listMarketSources();
		if (lastMarketCheck.size > 500) lastMarketCheck.clear();
		const results = [];
		for (const source of sources) {
			const base = {
				repo: source.repo,
				...source.ref !== void 0 ? { ref: source.ref } : {}
			};
			const now = Date.now();
			if (now - (lastMarketCheck.get(source.repo) ?? 0) < 3e5) {
				results.push({
					...base,
					updateAvailable: false,
					commitSha: source.commitSha ?? "",
					throttled: true
				});
				continue;
			}
			try {
				const latestTag = await getLatestReleaseTag(source.repo);
				lastMarketCheck.set(source.repo, now);
				if (source.ref === void 0) {
					results.push({
						...base,
						updateAvailable: false,
						commitSha: source.commitSha ?? "",
						...latestTag !== void 0 ? { latestTag } : {}
					});
					continue;
				}
				const latest = await getLatestCommit(source.repo, source.ref);
				const commitMoved = source.commitSha !== void 0 && latest.commitSha !== source.commitSha;
				const newRelease = latestTag !== void 0 && latestTag !== source.ref;
				results.push({
					...base,
					updateAvailable: commitMoved || newRelease,
					commitSha: latest.commitSha,
					...newRelease ? { latestTag } : {}
				});
			} catch (error) {
				results.push({
					...base,
					updateAvailable: false,
					commitSha: source.commitSha ?? "",
					error: errorText(error)
				});
			}
		}
		writeJson(res, 200, {
			ok: true,
			results
		});
	};
	return [
		{
			path: SKILL_HUB_API.market,
			methods: ["GET"],
			handler: async ({ res }) => {
				writeJson(res, 200, {
					ok: true,
					repos: await deps.store.listMarketSources()
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSource,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const parsed = normalizeRepoInput(readString(body, "repo").trim());
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const ref = parsed.ref;
				const slug = repoSlug(parsed);
				writeJson(res, 200, {
					ok: true,
					repo: slug,
					repos: await deps.store.addMarketSource(slug, ref)
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSourceDelete,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const parsed = normalizeRepoInput(readString(body, "repo").trim());
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				writeJson(res, 200, {
					ok: true,
					repos: await deps.store.removeMarketSource(repoSlug(parsed))
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSourceRef,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const parsed = normalizeRepoInput(readString(body, "repo"));
				const ref = readString(body, "ref").trim();
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				if (ref === "") {
					writeError(res, 400, "ref is required");
					return;
				}
				if (await deps.store.setMarketSourceRef(repoSlug(parsed), ref) === void 0) {
					writeError(res, 404, "market source not found: " + repoSlug(parsed));
					return;
				}
				writeJson(res, 200, {
					ok: true,
					repos: await deps.store.listMarketSources()
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSourceVersions,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const parsed = normalizeRepoInput(queryParam(url, "repo") ?? "");
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const repo = repoSlug(parsed);
				const source = await deps.store.getMarketSource(repo);
				if (source === void 0) {
					writeError(res, 404, "market source not found: " + repo);
					return;
				}
				const [releases, branches] = await Promise.all([listRepoReleases(repo), listRepoBranches(repo)]);
				writeJson(res, 200, {
					ok: true,
					repo,
					...source.ref !== void 0 && source.ref !== "" ? { current: source.ref } : {},
					releases,
					branches
				});
			}
		},
		{
			path: SKILL_HUB_API.marketCheck,
			methods: ["GET"],
			handler: checkMarketSources
		},
		{
			path: SKILL_HUB_API.marketStats,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const refresh = queryParam(url, "refresh") === "1";
				await seedMarketStats(deps);
				const sources = await deps.store.listMarketSources();
				if (lastMarketStats.size > 500) lastMarketStats.clear();
				const results = [];
				const now = Date.now();
				let fetchedAny = false;
				for (const source of sources) {
					const cached = marketStatsCache.get(source.repo);
					const age = now - (lastMarketStats.get(source.repo) ?? 0);
					if (cached !== void 0 && (!refresh || age < 36e5)) {
						results.push({
							repo: source.repo,
							stars: cached.stars,
							downloads: cached.downloads,
							...age >= 36e5 ? { stale: true } : refresh ? { throttled: true } : {}
						});
						continue;
					}
					try {
						const stats = await getRepoStats(source.repo);
						marketStatsCache.set(source.repo, stats);
						lastMarketStats.set(source.repo, now);
						fetchedAny = true;
						results.push({
							repo: source.repo,
							...stats
						});
					} catch (error) {
						if (cached !== void 0) results.push({
							repo: source.repo,
							stars: cached.stars,
							downloads: cached.downloads,
							stale: true
						});
						else results.push({
							repo: source.repo,
							stars: 0,
							downloads: 0,
							error: errorText(error)
						});
					}
				}
				if (fetchedAny) deps.store.saveMarketStatsState({
					fetchedAt: now,
					stats: Object.fromEntries(marketStatsCache)
				}).catch(() => {});
				writeJson(res, 200, {
					ok: true,
					results
				});
			}
		},
		{
			path: SKILL_HUB_API.marketSync,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const parsed = normalizeRepoInput(readString(body, "repo"));
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const repo = repoSlug(parsed);
				const source = await deps.store.getMarketSource(repo);
				if (source === void 0) {
					writeError(res, 404, "market source not found: " + repo);
					return;
				}
				let ref = source.ref;
				if (ref === void 0 || ref === "") {
					const latestTag = await getLatestReleaseTag(repo);
					if (latestTag === void 0) {
						writeError(res, 409, "repo has no release — pick a branch first");
						return;
					}
					ref = latestTag;
					await deps.store.setMarketSourceRef(repo, ref);
				}
				const latest = await getLatestCommit(repo, ref);
				await deps.store.setMarketSourceCommit(repo, latest.commitSha);
				await deps.store.setSourceRef(repo, ref);
				const tracked = await deps.store.getSource(repo);
				writeJson(res, 200, {
					ok: true,
					repo,
					ref,
					commitSha: latest.commitSha,
					skills: tracked !== void 0 ? [...tracked.skills] : []
				});
			}
		}
	];
}
// src/routes/mcp.ts
/** 400：字段级校验失败（界面按字段标红，而不是弹一条泛泛的错误）。 */
function writeFieldErrors(res, error, fields) {
	writeJson(res, 400, {
		error,
		fields
	});
}
/** MCP 域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function mcpRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.mcp,
			methods: ["GET"],
			handler: async ({ res }) => {
				const access = deps.mcp;
				if (access === void 0) {
					writeError(res, 503, "MCP access is unavailable in this deployment");
					return;
				}
				writeJson(res, 200, buildMcpResponse(await access.list()));
			}
		},
		{
			path: SKILL_HUB_API.mcpToggle,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const access = deps.mcp;
				if (access === void 0) {
					writeError(res, 503, "MCP access is unavailable in this deployment");
					return;
				}
				const entryId = readString(body, "entryId").trim();
				if (entryId === "") {
					writeError(res, 400, "entryId is required");
					return;
				}
				const enabled = body.enabled;
				if (typeof enabled !== "boolean") {
					writeError(res, 400, "enabled must be a boolean");
					return;
				}
				try {
					const outcome = await access.setEnabled(entryId, enabled);
					const mcp = buildMcpResponse(await access.list());
					writeJson(res, 200, {
						ok: true,
						...outcome,
						mcp
					});
				} catch (error) {
					if (error instanceof McpAccessError) {
						writeError(res, error.status, error.message);
						return;
					}
					throw error;
				}
			}
		},
		{
			path: SKILL_HUB_API.mcpSave,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const access = deps.mcp;
				const config = deps.mcpConfig;
				if (access === void 0 || config === void 0) {
					writeError(res, 503, "MCP management is unavailable in this deployment");
					return;
				}
				const entryIdRaw = body.entryId;
				if (entryIdRaw !== void 0 && (typeof entryIdRaw !== "string" || entryIdRaw.trim() === "")) {
					writeError(res, 400, "entryId must be a non-empty string when present");
					return;
				}
				const entryId = typeof entryIdRaw === "string" ? entryIdRaw.trim() : void 0;
				const normalized = normalizeServerInput(body.server);
				if (normalized.server === void 0) {
					writeFieldErrors(res, "invalid MCP server config", normalized.errors);
					return;
				}
				try {
					const outcome = await config.save(normalized.server, entryId);
					const mcp = buildMcpResponse(await access.list());
					writeJson(res, 200, {
						ok: true,
						...outcome,
						mcp
					});
				} catch (error) {
					if (error instanceof McpPatchError && error.field !== void 0) {
						writeFieldErrors(res, error.message, [{
							field: error.field,
							code: "duplicate"
						}]);
						return;
					}
					if (error instanceof McpAccessError || error instanceof McpPatchError) {
						writeError(res, error.status, error.message);
						return;
					}
					throw error;
				}
			}
		},
		{
			path: SKILL_HUB_API.mcpRemove,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const access = deps.mcp;
				const config = deps.mcpConfig;
				if (access === void 0 || config === void 0) {
					writeError(res, 503, "MCP management is unavailable in this deployment");
					return;
				}
				const entryId = readString(body, "entryId").trim();
				if (entryId === "") {
					writeError(res, 400, "entryId is required");
					return;
				}
				try {
					const outcome = await config.remove(entryId);
					const mcp = buildMcpResponse(await access.list());
					writeJson(res, 200, {
						ok: true,
						...outcome,
						mcp
					});
				} catch (error) {
					if (error instanceof McpPatchError && error.field !== void 0) {
						writeFieldErrors(res, error.message, [{
							field: error.field,
							code: "duplicate"
						}]);
						return;
					}
					if (error instanceof McpAccessError || error instanceof McpPatchError) {
						writeError(res, error.status, error.message);
						return;
					}
					throw error;
				}
			}
		}
	];
}
// src/routes/repo-import.ts
/**
* 仓库导入域路由：repo 发现 / repoImport 异步导入任务 / progress 轮询 /
* cancel 取消。从 routes.ts 原样搬出，handler 逻辑不变。
*/
/**
* 导入让位（issue #16）：磁盘上已有同名占位但**没有启用的技能**时，把占位移入
* 回收站，把名字让给即将导入的真技能。占位有两种 —— 已禁用的发现文件（目录包或
* 扁平，后者曾长期漏处理：`clearDisabledPlaceholder` 只认 `<name>` 这个目录，
* 扁平占位占的是 `<name>.md.disabled`，判据为假，分支根本进不去）和没有 `SKILL.md`
* 的空壳目录。判据统一走 `occupancyOf`，形态判断集中在 `retireNamePlaceholders`。
*
* 返回 false = 磁盘上有启用的同名技能（真货），一律不动，交回原本的「跳过」。
*/
async function clearDisabledPlaceholder(deps, targetRoot, name) {
	if ((await occupancyOf(targetRoot, name)).enabled.length > 0) return false;
	return await retireNamePlaceholders(deps, targetRoot, name) !== void 0;
}
/** 仓库导入域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function repoImportRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.repo,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const parsed = normalizeRepoInput(queryParam(url, "repo") ?? "");
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const repo = repoSlug(parsed);
				let ref = parsed.ref;
				if (ref === void 0 || ref === "") {
					const pinned = await deps.store.getMarketSource(repo);
					if (pinned?.ref !== void 0 && pinned.ref !== "") ref = pinned.ref;
				}
				if (ref === void 0 || ref === "") {
					const releaseTag = await getLatestReleaseTag(repo);
					if (releaseTag !== void 0) {
						ref = releaseTag;
						const existing = await deps.store.getMarketSource(repo);
						if (existing !== void 0 && (existing.ref === void 0 || existing.ref === "")) await deps.store.setMarketSourceRef(repo, releaseTag);
					} else {
						const branches = await listRepoBranches(repo);
						if (branches.length === 0) {
							writeError(res, 404, "repo has no branches to scan");
							return;
						}
						writeJson(res, 200, {
							ok: true,
							repo,
							ref: null,
							branches,
							entries: []
						});
						return;
					}
				}
				const { ref: resolvedRef, tree, truncated } = await loadRepoTree(repo, ref);
				writeJson(res, 200, {
					ok: true,
					repo,
					ref: resolvedRef,
					entries: discoverRepoEntries(tree, repo, await knownSkillNames(deps)),
					...truncated ? { truncated: true } : {}
				});
			}
		},
		{
			path: SKILL_HUB_API.repoImport,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const input = readString(body, "repo").trim();
				const paths = readStrings(body, "paths");
				if (paths.length === 0) {
					writeError(res, 400, "paths must be a non-empty array");
					return;
				}
				const parsed = normalizeRepoInput(input);
				if (parsed === null) {
					writeError(res, 400, "repo must be owner/repo or a github.com URL");
					return;
				}
				const repo = repoSlug(parsed);
				const requestedRef = readString(body, "ref");
				const { ref: resolvedRef, tree } = await loadRepoTree(repo, requestedRef !== "" ? requestedRef : parsed.ref);
				const entries = discoverRepoEntries(tree, repo, await knownSkillNames(deps));
				const byPath = new Map(entries.map((entry) => [entry.path, entry]));
				const selected = paths.map((path) => byPath.get(path)).filter((entry) => entry !== void 0);
				if (selected.length === 0) {
					writeError(res, 400, "no matching skills for selected paths");
					return;
				}
				if (selected.length > 500) {
					writeError(res, 400, "select at most 500 skills per import");
					return;
				}
				const totalBytes = selected.reduce((sum, entry) => sum + entry.totalBytes, 0);
				if (totalBytes > 209715200) {
					writeError(res, 400, "selected skills exceed the 200MB import limit");
					return;
				}
				let commitSha = "";
				try {
					commitSha = (await getLatestCommit(repo, resolvedRef)).commitSha;
				} catch {}
				const jobId = "imp_" + randomUUID().slice(0, 8);
				const controller = new AbortController();
				const now = Date.now();
				const job = {
					jobId,
					total: selected.length,
					done: 0,
					totalBytes,
					downloadedBytes: 0,
					startTime: now,
					imported: [],
					skipped: [],
					failed: [],
					replaced: [],
					status: "running",
					controller,
					createdAt: now
				};
				gcImportJobs();
				importJobs.set(jobId, job);
				cleanupLeftoverImportDirs(rootPath("user-dsh", homeOf(deps))).catch(() => {});
				(async () => {
					const targetRoot = rootPath("user-dsh", homeOf(deps));
					await mkdir(targetRoot, { recursive: true });
					let needInvalidate = false;
					for (const entry of selected) {
						if (controller.signal.aborted) break;
						job.current = entry.name;
						job.currentFile = entry.path;
						if (entry.existing) {
							job.skipped.push({
								name: entry.name,
								reason: "exists"
							});
							job.downloadedBytes += entry.totalBytes;
							job.done += 1;
							continue;
						}
						const occupancy = await occupancyOf(targetRoot, entry.name);
						if (occupancy.enabled.length > 0 || occupancy.disabled.length > 0 || occupancy.bareDir !== void 0) {
							let cleared = false;
							try {
								cleared = await clearDisabledPlaceholder(deps, targetRoot, entry.name);
							} catch {
								cleared = false;
							}
							if (!cleared) {
								job.skipped.push({
									name: entry.name,
									reason: "exists"
								});
								job.downloadedBytes += entry.totalBytes;
								job.done += 1;
								continue;
							}
							job.replaced.push(entry.name);
						}
						if (controller.signal.aborted) break;
						const files = collectRepoSkillFiles(tree, entry.dir);
						try {
							const result = await downloadRepoSkill(repo, resolvedRef, entry, files, targetRoot, fetch, controller.signal, (bytes, file) => {
								job.downloadedBytes += bytes;
								job.currentFile = skillPathIn(entry.dir, file);
							});
							await deps.store.addSourceSkill(repo, entry.root, commitSha, resolvedRef, entry.name);
							await deps.store.mergeSourceManifest(repo, skillManifest(tree, entry.dir), entry.dir);
							job.imported.push({
								name: entry.name,
								origin: entry.origin,
								path: result.skillPath
							});
							needInvalidate = true;
						} catch (error) {
							if (isAbortError(error) || controller.signal.aborted) break;
							job.failed.push({
								name: entry.name,
								error: errorText(error)
							});
						} finally {
							job.done += 1;
						}
					}
					if (controller.signal.aborted) {
						job.status = "cancelled";
						job.current = void 0;
						job.currentFile = void 0;
					} else {
						job.status = "done";
						job.current = void 0;
						job.currentFile = void 0;
						job.downloadedBytes = job.totalBytes;
					}
					if (needInvalidate) deps.invalidate?.();
				})().catch((error) => {
					job.status = "error";
					job.error = errorText(error);
					job.current = void 0;
					job.currentFile = void 0;
				});
				writeJson(res, 200, {
					ok: true,
					jobId,
					total: selected.length,
					totalBytes
				});
			}
		},
		{
			path: SKILL_HUB_API.repoImportProgress,
			methods: ["GET"],
			handler: async ({ res, url }) => {
				const jobId = queryParam(url, "jobId") ?? "";
				if (jobId === "") {
					writeError(res, 400, "jobId is required");
					return;
				}
				const job = importJobs.get(jobId);
				if (job === void 0) {
					writeError(res, 404, "import job not found: " + jobId);
					return;
				}
				const elapsedSec = Math.max(.5, (Date.now() - job.startTime) / 1e3);
				const bytesPerSecond = job.status === "running" ? Math.round(job.downloadedBytes / elapsedSec) : void 0;
				writeJson(res, 200, {
					ok: true,
					jobId: job.jobId,
					status: job.status,
					total: job.total,
					done: job.done,
					...job.current !== void 0 ? { current: job.current } : {},
					...job.currentFile !== void 0 ? { currentFile: job.currentFile } : {},
					totalBytes: job.totalBytes,
					downloadedBytes: job.downloadedBytes,
					...bytesPerSecond !== void 0 ? { bytesPerSecond } : {},
					imported: [...job.imported],
					skipped: [...job.skipped],
					failed: [...job.failed],
					...job.replaced.length > 0 ? { replaced: [...job.replaced] } : {},
					...job.error !== void 0 ? { error: job.error } : {}
				});
			}
		},
		{
			path: SKILL_HUB_API.repoImportCancel,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const jobId = readString(body, "jobId");
				if (jobId === "") {
					writeError(res, 400, "jobId is required");
					return;
				}
				const job = importJobs.get(jobId);
				if (job === void 0) {
					writeError(res, 404, "import job not found: " + jobId);
					return;
				}
				if (job.status === "running") {
					job.controller.abort();
					job.status = "cancelled";
				}
				writeJson(res, 200, {
					ok: true,
					jobId: job.jobId,
					status: job.status
				});
			}
		}
	];
}
// src/routes/groups.ts
/**
* 分组域路由：groups。从 routes.ts 原样搬出，handler 逻辑不变。
* 集合顺序由名称决定（工作区分组的顺序来自 dsh 侧面栏），不再支持手动重排。
*/
/** 分组域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function groupRoutes(deps) {
	return [{
		path: SKILL_HUB_API.groups,
		methods: ["GET"],
		handler: async ({ res }) => {
			writeJson(res, 200, await buildGroups(deps));
		}
	}];
}
// src/routes/sources.ts
/**
* 来源跟踪域路由：sources 列表 / check 上游更新 / sync 同步 / delete 跟进
* 删除 / restore 恢复 / trash/clear 清空回收站。从 routes.ts 原样搬出，
* handler 逻辑不变。
*/
/** 来源跟踪域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function sourceRoutes(deps) {
	return [
		{
			path: SKILL_HUB_API.sources,
			methods: ["GET"],
			handler: async ({ res }) => {
				const [sources, origins, trash] = await Promise.all([
					deps.store.listSources(),
					deps.store.listOrigins(),
					deps.store.listTrash()
				]);
				writeJson(res, 200, {
					ok: true,
					sources,
					origins,
					collections: buildCollections(origins),
					trash
				});
			}
		},
		{
			path: SKILL_HUB_API.sourceCheck,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const rawRepo = readString(body, "repo");
				let only;
				if (rawRepo !== "") {
					const parsedOnly = normalizeRepoInput(rawRepo);
					only = parsedOnly !== null ? repoSlug(parsedOnly) : void 0;
				}
				const source = only !== void 0 ? await deps.store.getSource(only) : void 0;
				if (only !== void 0 && source === void 0) {
					writeError(res, 404, "source not found: " + only);
					return;
				}
				const sources = source !== void 0 ? [source] : await deps.store.listSources();
				if (lastSourceCheck.size > 500) lastSourceCheck.clear();
				const results = [];
				for (const item of sources) {
					const base = {
						repo: item.repo,
						...item.ref !== void 0 ? { ref: item.ref } : {}
					};
					const now = Date.now();
					if (now - (lastSourceCheck.get(item.repo) ?? 0) < 3e5) {
						results.push({
							...base,
							changed: false,
							updated: [],
							deleted: [],
							throttled: true
						});
						continue;
					}
					try {
						const latest = await getLatestCommit(item.repo, item.ref);
						lastSourceCheck.set(item.repo, now);
						if (item.commitSha === "") {
							await deps.store.setSourceCommit(item.repo, latest.commitSha);
							results.push({
								...base,
								changed: false,
								updated: [],
								deleted: [],
								unverified: true,
								commitSha: latest.commitSha
							});
							continue;
						}
						if (latest.commitSha === item.commitSha) {
							results.push({
								...base,
								changed: false,
								updated: [],
								deleted: []
							});
							continue;
						}
						const diff = diffRemoteSkills(await loadRepoTreeAt(item.repo, latest.treeSha), item);
						results.push({
							...base,
							changed: true,
							commitSha: latest.commitSha,
							updated: diff.updated,
							deleted: diff.deleted
						});
					} catch (error) {
						results.push({
							...base,
							changed: false,
							updated: [],
							deleted: [],
							error: errorText(error)
						});
					}
				}
				writeJson(res, 200, {
					ok: true,
					results
				});
			}
		},
		{
			path: SKILL_HUB_API.sourceSync,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const repo = readString(body, "repo").trim();
				if (repo === "") {
					writeError(res, 400, "repo is required");
					return;
				}
				const selected = Array.isArray(body.skills) ? readStrings(body, "skills") : void 0;
				const source = await deps.store.getSource(repo);
				if (source === void 0) {
					writeError(res, 404, "source not found: " + repo);
					return;
				}
				const targets = selected !== void 0 ? selected : source.skills;
				const latest = await getLatestCommit(repo, source.ref);
				const tree = await loadRepoTreeAt(repo, latest.treeSha);
				const targetRoot = rootPath("user-dsh", homeOf(deps));
				await mkdir(targetRoot, { recursive: true });
				const synced = [];
				const failed = [];
				for (const name of targets) {
					if (!isSkillName(name) || !source.skills.includes(name)) {
						failed.push({
							name,
							error: "skill is not tracked by this source"
						});
						continue;
					}
					try {
						const entry = repoSkillEntry(name, source.root, repo);
						entry.dir = skillDirOf(source, name, tree.map((item) => item.path));
						entry.path = skillFileAt(entry.dir);
						const files = collectRepoSkillFiles(tree, entry.dir);
						if (files.length === 0) {
							failed.push({
								name,
								error: "skill missing upstream"
							});
							continue;
						}
						const targetDir = join(targetRoot, name);
						const occupancy = await occupancyOf(targetRoot, name);
						const wasDisabled = occupancy.disabled.length > 0;
						const download = () => downloadRepoSkill(repo, latest.commitSha, entry, files, targetRoot);
						await retireNamePlaceholders(deps, targetRoot, name);
						const enabled = occupancy.enabled[0];
						if (enabled !== void 0) await replaceInPlace(trashSourceOf(enabled), download);
						else await download();
						if (wasDisabled) await rename(join(targetDir, "SKILL.md"), join(targetDir, "SKILL.md.disabled"));
						await deps.store.mergeSourceManifest(repo, skillManifest(tree, entry.dir), entry.dir);
						synced.push(name);
					} catch (error) {
						failed.push({
							name,
							error: errorText(error)
						});
					}
				}
				if (failed.length === 0) await deps.store.setSourceCommit(repo, latest.commitSha);
				deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					repo,
					commitSha: latest.commitSha,
					synced,
					failed
				});
			}
		},
		{
			path: SKILL_HUB_API.sourceDelete,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const repo = readString(body, "repo").trim();
				const skills = readStrings(body, "skills");
				if (repo === "") {
					writeError(res, 400, "repo is required");
					return;
				}
				if (skills.length === 0) {
					writeError(res, 400, "skills must be a non-empty array");
					return;
				}
				const source = await deps.store.getSource(repo);
				if (source === void 0) {
					writeError(res, 404, "source not found: " + repo);
					return;
				}
				const home = homeOf(deps);
				const trashed = [];
				const failed = [];
				const sourceNames = new Set(source.skills);
				for (const name of skills) {
					if (!isSkillName(name) || !sourceNames.has(name)) {
						failed.push({
							name,
							error: "skill is not tracked by this source"
						});
						continue;
					}
					const occupancy = await occupancyOf(rootPath("user-dsh", home), name);
					const existing = occupancy.enabled[0] ?? occupancy.disabled[0] ?? occupancy.bareDir;
					if (existing === void 0) {
						failed.push({
							name,
							error: "skill not found on disk"
						});
						continue;
					}
					if (rootOfPath(existing, home) === void 0) {
						failed.push({
							name,
							error: "skill path is outside the hub writable roots"
						});
						continue;
					}
					try {
						const { path, source: trashSource } = await trashSkill(existing);
						await deps.store.addTrash({
							name,
							path,
							movedAt: Date.now(),
							sourcePath: trashSource,
							origin: {
								repo: source.repo,
								root: source.root,
								...source.ref !== void 0 && source.ref !== "" ? { ref: source.ref } : {},
								commitSha: source.commitSha
							}
						});
						trashed.push(name);
					} catch (error) {
						failed.push({
							name,
							error: errorText(error)
						});
					}
				}
				if (trashed.length > 0) {
					await deps.store.setSourceSkills(repo, source.skills.filter((n) => !trashed.includes(n)));
					deps.invalidate?.();
				}
				writeJson(res, 200, {
					ok: true,
					trashed,
					failed
				});
			}
		},
		{
			path: SKILL_HUB_API.sourceRestore,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const name = readString(body, "name");
				if (name === "") {
					writeError(res, 400, "name is required");
					return;
				}
				const entry = await deps.store.getTrash(name);
				if (entry === void 0) {
					writeError(res, 404, "trash entry not found: " + name);
					return;
				}
				const home = homeOf(deps);
				if (await pathExists(entry.sourcePath ?? join(rootPath("user-dsh", home), name))) {
					writeError(res, 409, "skill already exists: " + name);
					return;
				}
				const path = await restoreSkill(entry, home);
				if (entry.origin !== void 0) await deps.store.addSourceSkill(entry.origin.repo, entry.origin.root, entry.origin.commitSha, entry.origin.ref, name);
				await deps.store.removeTrash(entry.path);
				deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					name,
					path
				});
			}
		},
		{
			path: SKILL_HUB_API.sourceTrashClear,
			methods: ["POST"],
			handler: async ({ res }) => {
				const home = homeOf(deps);
				const entries = await deps.store.listTrash();
				const deleted = [];
				const removedPaths = [];
				const failed = [];
				for (const entry of entries) try {
					await clearTrash(entry, home);
					deleted.push(entry.name);
					removedPaths.push(entry.path);
				} catch (error) {
					failed.push({
						name: entry.name,
						error: errorText(error)
					});
				}
				for (const path of removedPaths) await deps.store.removeTrash(path);
				const orphans = await sweepOrphanTrash(deps, home, failed);
				if (deleted.length > 0 || orphans.length > 0) deps.invalidate?.();
				writeJson(res, 200, {
					ok: true,
					deleted,
					failed,
					...orphans.length > 0 ? { orphans } : {}
				});
			}
		}
	];
}
/**
* 删除两个可写根 `.trash` 下不被任何回收站记录引用的残留目录。
* 只扫 `.trash` 的直接子项、跳过点开头项，失败项并入 `failed`（保留可重试）。
*/
async function sweepOrphanTrash(deps, home, failed) {
	const referenced = new Set((await deps.store.listTrash()).map((entry) => entry.path));
	const orphans = [];
	for (const root of WRITABLE_ROOTS) {
		const trashDir = join(rootPath(root, home), ".trash");
		let names;
		try {
			names = await readdir(trashDir);
		} catch {
			continue;
		}
		for (const name of names) {
			if (name.startsWith(".")) continue;
			const full = join(trashDir, name);
			if (referenced.has(full)) continue;
			try {
				await rm(full, {
					recursive: true,
					force: true
				});
				orphans.push(full);
			} catch (error) {
				failed.push({
					name,
					error: errorText(error)
				});
			}
		}
	}
	return orphans;
}
// src/tokens.ts
/**
* 文件原文的 token 计数（DeepSeek V4.1 Flash / GLM-5.3）。
*
* 为什么在宿主侧数：两个词表分别是 6 MB 与 19 MB 的 tokenizer.json，搬到
* 浏览器里解析既慢又占内存，而且每次刷新页面都要重来；宿主加载一次后常驻
* 内存，面板只发原文、只收数字。
*
* 为什么是 @huggingface/tokenizers 而不是 @huggingface/transformers：后者
* 为了跑推理把 onnxruntime-node 和 sharp 一起拖进来（几十 MB，还有原生
* 二进制），而这个功能只需要 tokenizer.json 的纯 JS 实现。同属 Hugging
* Face 家族、零依赖、没有 N-API 构建，数字与 Rust 版 tokenizers 逐位一致
* （tokens.test.ts 里有固定用例；开发时也用 Python tokenizers 对同一批
* 文件做过交叉核对）。
*
* 词表怎么来：不随插件发布，也不打进构建产物。第一次计数时按协议层固定
* 的 revision 从 Hugging Face 下载 tokenizer.json，落到插件数据目录
* `$DSH_HOME/plugin/data/custom-instruction-manager/tokenizer/` 下，之后只读
* 本地文件。缓存
* 只有"有/没有"两种状态——不做过期、不做过期清理、不做手动管理，体积也
* 就是两份词表。
*
* 计数结果本身**不**缓存：面板每次进详情页都重新数一遍，数字永远跟着当前
* 文件内容走。这里缓存的只有"解析好的 tokenizer 对象"和磁盘上那份词表。
*
* 模型是可选的：协议层给出三个（DeepSeek V4.1 Flash、GLM-5.3 默认选中，
* Kimi K3 需手动勾选）。勾选即下载，取消勾选即删掉那份词表并把它从内存里
* 逐出——"管理模型"和磁盘内容是同一件事，不留下需要另外清理的中间态。
*/
/** 词表缓存目录（`$DSH_HOME/plugin/data/custom-instruction-manager/tokenizer`）。 */
function tokenCacheDir(home = dshHome()) {
	return tokenizerCacheDir(home);
}
/** 缓存文件名：仓库名 + 固定 revision 前 12 位，换 revision 就是另一个文件。 */
function cacheFile(dir, spec) {
	return join(dir, spec.repo.replaceAll("/", "__") + "@" + spec.revision.slice(0, 12) + ".json");
}
/** 下载 URL：`resolve/<revision>/tokenizer.json`（固定 revision，不吃 `main` 的漂移）。 */
function tokenizerUrl(spec) {
	return "https://huggingface.co/" + spec.repo + "/resolve/" + spec.revision + "/tokenizer.json";
}
/** 按 id 取模型定义；未知 id 返回 undefined（模型下线后的残留选择）。 */
function modelOf(id) {
	return TOKEN_MODELS.find((spec) => spec.id === id);
}
/**
* 「管理模型」要显示的状态：协议层的全部模型 + 是否选中 + 词表是否已在本机。
*
* `installed` 看缓存文件而不是内存：面板刷新、宿主重启后内存里没有 tokenizer，
* 但文件还在——那也算"已下载"（下次计数直接读盘）。
*/
function modelStates(selection, dir = tokenCacheDir()) {
	return TOKEN_MODELS.map((spec) => ({
		id: spec.id,
		label: spec.label,
		vocabMb: spec.vocabMb,
		selected: selection.includes(spec.id),
		installed: existsSync(cacheFile(dir, spec))
	}));
}
/** 已加载的 tokenizer：按模型 id 常驻，失败的不留（下次请求可以重试）。 */
const loaded = /* @__PURE__ */ new Map();
/**
* 词表 JSON 的最低形状校验：`model.type` 与 `model.vocab` 必须在。
*
* 真实目的是挡住"下载回来的其实是一个 HTML 错误页/网关提示"这种情形——
* 那种响应 HTTP 也可能是 200，只有解析后的结构能区分。
*/
function assertTokenizerJson(parsed, spec) {
	const root = typeof parsed === "object" && parsed !== null ? parsed : void 0;
	const model = root?.model;
	const shaped = typeof model === "object" && model !== null && typeof model.vocab === "object";
	if (root === void 0 || !shaped) throw new Error("词表文件不是 tokenizer.json（" + spec.repo + "）");
	return root;
}
/** 读缓存文件；损坏（缺失/半截/不是 tokenizer.json）一律当作没有。 */
async function readCached(file, spec) {
	try {
		return assertTokenizerJson(JSON.parse(await readFile(file, "utf8")), spec);
	} catch {
		return;
	}
}
/** 下载词表并写入缓存（先写临时文件再 rename，读者永远看不到半截文件）。 */
async function download(file, spec, options) {
	const response = await (options.fetch ?? globalThis.fetch)(tokenizerUrl(spec), {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(options.timeoutMs ?? 12e4)
	});
	if (!response.ok) throw new Error("词表下载失败：HTTP " + response.status + "（" + spec.repo + "）");
	const text = await response.text();
	const parsed = assertTokenizerJson(JSON.parse(text), spec);
	await mkdir(dirname(file), { recursive: true });
	const tmp = file + "." + process.pid + "." + Date.now() + ".tmp";
	await writeFile(tmp, text);
	await rename(tmp, file);
	return parsed;
}
/**
* 取一个模型的 tokenizer（首次是下载 + 解析，之后常驻内存）。
*
* 同一个模型的并发请求共享同一个 promise：面板连点两下详情页不会下载
* 两遍词表。失败时把这个 promise 从表里摘掉，下一次请求重新试。
*/
function loadTokenizer(spec, options) {
	const pending = loaded.get(spec.id);
	if (pending !== void 0) return pending;
	const file = cacheFile(options.dir ?? tokenCacheDir(), spec);
	const promise = (async () => {
		const json = await readCached(file, spec) ?? await download(file, spec, options);
		return new Tokenizer(json, {});
	})();
	loaded.set(spec.id, promise);
	promise.catch(() => {
		if (loaded.get(spec.id) === promise) loaded.delete(spec.id);
	});
	return promise;
}
/**
* 数一份原文在各模型词表下的 token 数。
*
* 每个模型独立成败：一个词表没下载下来，另一个照样返回数字（`entries` 里
* 失败项带 `error`）。整族人一起失败只可能是 fetch 之外的编程错误。
*
* `add_special_tokens: false`：统计的是文件原文本身，不含 BOS/EOS 这类
* 包装；面板的脚注也这么写。
*
* @param text - 文件原文，原样计数（不 trim、不合并空行）。
* @param options - 缓存目录/下载实现/超时（测试注入）。
* @returns 每个模型一条结果，顺序与 TOKEN_MODELS 一致。
*/
async function countTokens(text, options = {}) {
	const wanted = options.models ?? DEFAULT_TOKEN_MODEL_IDS;
	const specs = TOKEN_MODELS.filter((spec) => wanted.includes(spec.id));
	return Promise.all(specs.map(async (spec) => {
		try {
			const tokenizer = await loadTokenizer(spec, options);
			return {
				id: spec.id,
				label: spec.label,
				tokens: tokenizer.encode(text, { add_special_tokens: false }).ids.length
			};
		} catch (error) {
			return {
				id: spec.id,
				label: spec.label,
				error: errorText(error)
			};
		}
	}));
}
/**
* 选中一个模型：把词表下载到本机（失败就抛，调用方决定要不要记下这次选择）。
*
* 下载完继续留在内存里——用户勾选它的目的就是马上要数，没必要再读一次盘。
*/
async function installModel(id, options = {}) {
	const spec = modelOf(id);
	if (spec === void 0) throw new Error("unknown token model: " + id);
	await loadTokenizer(spec, options);
}
/**
* 取消选中：删掉本机那份词表并把它从内存逐出。
*
* 先等在途加载落定再删文件，否则一个正在下载的 promise 会在我们删完之后把文件
* 又写回去（用户看到的"取消勾选"就没生效）。
*/
async function removeModel(id, options = {}) {
	const spec = modelOf(id);
	if (spec === void 0) throw new Error("unknown token model: " + id);
	const pending = loaded.get(id);
	if (pending !== void 0) {
		loaded.delete(id);
		await pending.catch(() => {});
	}
	await rm(cacheFile(options.dir ?? tokenCacheDir(), spec), { force: true });
}
// src/routes/tokens.ts
/**
* Token 计数域路由：数一份原始正文在**当前选中**的各模型词表下的 token 数，
* 以及管理这个选中集合（哪些模型出现在表格里）。
*
* 为什么正文是 POST 而不是 GET：被判的就是文件正文本身，几十 KB 到几 MB，
* 塞进 URL 既超长又会被各种代理截断；GET 也带不上"每次现算"的语义。
*
* 为什么正文由浏览器送来而不是给个路径让宿主自己读：面板已经有这段原文
* （详情页就是这么显示的），送过来就保证"数的就是用户看到的"；换成路径
* 还要再解析一遍技能名/工作区、再判一次可读边界，多一条路径就多一处裁决。
* 代价是正文过一遍 loopback，几 KB 到几十 KB，可忽略。
*
* 请求体上限比本族其它路由（64 KB）宽松，因为正文本身就是载荷；上限见
* protocol/tokens.ts 的 TOKEN_COUNT_MAX_BYTES。
*
* 选中集合是"要用哪些模型"的唯一来源：勾选即下载词表、取消即删掉那份词表，
* 两者都在 /tokens/select 里一次做完，不存在需要另外清理的中间态。
*/
/** Token 计数域全部路由 spec（由 routes.ts 经 createRoute 包上统一围栏）。 */
function tokensRoutes(deps) {
	const dir = () => deps.tokenCacheDir ?? tokenCacheDir(deps.home);
	const countOptions = () => ({
		dir: dir(),
		fetch: deps.fetchImpl
	});
	return [
		{
			path: SKILL_HUB_API.tokensModels,
			methods: ["GET"],
			handler: async ({ res }) => {
				writeJson(res, 200, {
					ok: true,
					models: modelStates(resolveTokenSelection(await deps.store.getTokenModels()), dir())
				});
			}
		},
		{
			path: SKILL_HUB_API.tokensSelect,
			methods: ["POST"],
			jsonBody: true,
			handler: async ({ res, body }) => {
				const id = readString(body, "id");
				if (modelOf(id) === void 0) {
					writeError(res, 400, "unknown token model: " + (id === "" ? "(missing)" : id));
					return;
				}
				const selected = body.selected === true;
				const current = resolveTokenSelection(await deps.store.getTokenModels());
				if (selected) await installModel(id, countOptions());
				else await removeModel(id, countOptions());
				const next = selected ? resolveTokenSelection([...current, id]) : resolveTokenSelection(current.filter((entry) => entry !== id));
				await deps.store.setTokenModels(next);
				writeJson(res, 200, {
					ok: true,
					models: modelStates(next, dir())
				});
			}
		},
		{
			path: SKILL_HUB_API.tokens,
			methods: ["POST"],
			jsonBody: true,
			bodyLimit: TOKEN_COUNT_MAX_BYTES,
			handler: async ({ res, body }) => {
				const text = body.text;
				if (typeof text !== "string") {
					writeError(res, 400, "text must be a string");
					return;
				}
				const selection = resolveTokenSelection(await deps.store.getTokenModels());
				writeJson(res, 200, {
					ok: true,
					entries: await countTokens(text, {
						...countOptions(),
						models: selection
					})
				});
			}
		}
	];
}
// src/routes.ts
/**
* Build the family's trust fence from the host's `/api` model.
*
* `ctx.connection.requestRejection` is the documented hook for fencing another
* Web route; with no Connection service (a webserver-only composition, or a
* unit test) the literal-loopback check stands in, so the fallback is the old
* behaviour rather than an open route family.
*
* The service is read **per request**, not once at mount: plugins start in
* composition order, so a one-shot read at `apply()` time would latch the
* fallback whenever this plugin happens to come up before Connection. A
* persistent absence is almost certainly an upstream composition change rather
* than a transient startup order, so the first miss fires `onMissing` once —
* without that signal the fallback would silently reproduce issue #17 after
* any future upstream rename of the service.
* @param read - resolves `ctx.connection`, or `undefined` when absent.
* @param onMissing - called once, the first time the service reads absent.
* @returns the fence every route in this family runs first.
*/
function hostTrustFence(read, onMissing) {
	let missingReported = false;
	return (request) => {
		const connection = read();
		if (connection === void 0) {
			if (!missingReported) {
				missingReported = true;
				onMissing?.();
			}
			return loopbackOnlyFence(request);
		}
		try {
			return connection.requestRejection(request);
		} catch {
			return 403;
		}
	};
}
/**
* Build every /api/skill-hub route.
* @param deps - skill registry view + sidecar store + trust fence.
* @returns the exact-path routes plus the family's 404 catch-all.
*/
function makeRoutes(deps) {
	return [...[
		...catalogRoutes(deps),
		...mcpRoutes(deps),
		...editRoutes(deps),
		...agentsRoutes(deps),
		...configRoutes(deps),
		...marketRoutes(deps),
		...repoImportRoutes(deps),
		...groupRoutes(deps),
		...sourceRoutes(deps),
		...tokensRoutes(deps)
	].map((spec) => createRoute(deps, spec)), createRoute(deps, {
		kind: "prefix",
		path: SKILL_HUB_API_ROOT,
		methods: ["GET", "POST"],
		skipGate: true,
		handler: async ({ res, url }) => {
			writeError(res, 404, "unknown skill-hub route: " + url.pathname + " (see SKILL_HUB_API in src/protocol/api.ts)");
		}
	})];
}
// src/stats/scan.ts
/** Fallback freeze horizon when no rolling window is configured (14 days). */
const STATS_FREEZE_AFTER_MS = 12096e5;
const DAY_MS = 864e5;
/** Extract only invocation identity, skill name and time; never cache message bodies. */
function skillInvocations(log) {
	const invocations = [];
	for (const event of log.events) {
		let name;
		let identity;
		if (event.type === "user/message" && event.data.source.kind === "skill-invocation") {
			name = event.data.source.name;
			identity = event.data.id;
		} else if (event.type === "tool/call" && event.data.name === "skill") try {
			const parsed = JSON.parse(event.data.arguments);
			if (parsed !== null && typeof parsed === "object" && typeof parsed.name === "string") {
				name = parsed.name;
				identity = event.data.callId;
			}
		} catch {}
		if (!name) continue;
		invocations.push({
			key: createHash("sha256").update(JSON.stringify([
				event.type,
				identity,
				event.seq,
				event.time,
				name
			])).digest("hex"),
			name,
			time: event.time,
			inherited: event.seq < (log.inheritedEventCount ?? 0)
		});
	}
	return invocations;
}
/** Copies share an event identity, but independent own calls remain separate. */
function aggregateInvocations(sessions) {
	const groups = /* @__PURE__ */ new Map();
	for (const { id, invocations } of sessions) for (const call of invocations) {
		let group = groups.get(call.key);
		if (group === void 0) {
			group = {
				name: call.name,
				time: call.time,
				own: /* @__PURE__ */ new Set()
			};
			groups.set(call.key, group);
		}
		if (!call.inherited) group.own.add(id);
	}
	const totals = {};
	for (const group of groups.values()) {
		const stat = totals[group.name] ??= {
			count: 0,
			lastUsed: group.time
		};
		stat.count += Math.max(1, group.own.size);
		stat.lastUsed = Math.max(stat.lastUsed, group.time);
	}
	return toSorted(totals);
}
function isFrozen(record, watermark) {
	const created = record.header.createdAt;
	return typeof created === "number" && created > 0 && created < watermark;
}
/** Max parallel session-log reads per scan. Reads on the query path restore +
* replay-validate a full Session each (structuredClone × 2 + deepFreeze), so
* this stays 1: at most one restored log is resident and a heavy corpus costs
* wall time, never a memory spike. The cold path reads sequentially anyway. */
const SCAN_READ_CONCURRENCY = 1;
function toSorted(totals) {
	return Object.entries(totals).map(([name, stat]) => ({
		name,
		count: stat.count,
		lastUsed: stat.lastUsed
	})).sort((x, y) => x.name.localeCompare(y.name));
}
/** Effective freeze watermark for the configured rolling window (0 = all history → freeze horizon). */
function watermarkFor(windowDays, nowMs) {
	return windowDays > 0 ? nowMs - windowDays * DAY_MS : nowMs - STATS_FREEZE_AFTER_MS;
}
/**
* Whether a session's usage counts toward the configured window. With no
* window (0) everything counts — full history; with a window, only sessions
* created inside it do. Distinct from the freeze watermark, which is purely a
* re-read optimization.
*/
function inWindow(createdAt, windowDays, nowMs) {
	if (windowDays <= 0) return true;
	return typeof createdAt === "number" && createdAt > 0 && createdAt >= nowMs - windowDays * DAY_MS;
}
/**
* One pass over the corpus. Runs either a full reconciliation (rebuilds the
* per-session cache and advances the watermark — mutates the checkpoint) or a
* cheap incremental scan (re-reads everything at or after the watermark and
* merges over the cached sessions — leaves the checkpoint untouched). Totals
* always apply the CURRENT window filter over the cached sessions, so a
* window shrink takes effect immediately even before the next reconciliation.
*/
async function scan(query, checkpoint, nowMs, windowDays) {
	const sessions = await query.listSessions();
	const cutoff = watermarkFor(windowDays, nowMs);
	const dueFullScan = nowMs - checkpoint.lastFullReconcile >= 864e5 || checkpoint.windowDays !== windowDays;
	if (dueFullScan) checkpoint.frozenSessions = {};
	const included = [];
	const seen = new Set(sessions.map((record) => String(record.header.id)));
	for (const id of Object.keys(checkpoint.frozenSessions)) if (!seen.has(id)) delete checkpoint.frozenSessions[id];
	await mapConcurrent(sessions, SCAN_READ_CONCURRENCY, async (record) => {
		const id = String(record.header.id);
		const created = record.header.createdAt;
		if (!inWindow(created, windowDays, nowMs)) {
			delete checkpoint.frozenSessions[id];
			return;
		}
		const cached = checkpoint.frozenSessions[id];
		if (!dueFullScan && cached !== void 0) {
			included.push({
				id,
				invocations: cached.invocations
			});
			return;
		}
		if (!dueFullScan && isFrozen(record, checkpoint.frozenBefore)) return;
		try {
			const invocations = skillInvocations(await query.readSession(record.header.id));
			if (dueFullScan && invocations.length > 0 && (isFrozen(record, cutoff) || !(typeof created === "number" && created > 0))) checkpoint.frozenSessions[id] = {
				createdAt: created ?? 0,
				invocations
			};
			included.push({
				id,
				invocations
			});
		} catch {}
	});
	if (dueFullScan) {
		checkpoint.frozenBefore = cutoff;
		checkpoint.windowDays = windowDays;
		checkpoint.lastFullReconcile = nowMs;
	}
	return {
		stats: aggregateInvocations(included),
		mutated: dueFullScan
	};
}
/**
* One pass over the corpus through the persistence seam. Reads are strictly
* sequential and each handle is closed before the next opens, so at most one
* raw log is resident. A session is re-read only when its revision token
* changed since the checkpoint; the rolling window is applied from the
* listing headers, so out-of-window logs are never even opened. Live sessions
* (in-memory, possibly newer than their persisted revision) are read through
* `readLive` and never enter the revision cache.
*
* A `list()` failure rejects — the reader keeps the previous totals, and the
* next poll retries. Per-session failures are skipped, never fatal.
*/
async function scanCold(persistence, checkpoint, nowMs, windowDays, liveIds = /* @__PURE__ */ new Set(), readLive = async () => void 0) {
	const revisions = checkpoint.coldRevisions ?? (checkpoint.coldRevisions = {});
	const included = [];
	const snapshots = await persistence.list();
	const seen = /* @__PURE__ */ new Set();
	for (const snapshot of snapshots) {
		const id = snapshot.header.id;
		seen.add(id);
		if (liveIds.has(id)) continue;
		const created = snapshot.header.createdAt;
		if (!inWindow(created, windowDays, nowMs)) {
			delete revisions[id];
			continue;
		}
		const rev = snapshot.revision;
		const cached = revisions[id];
		if (cached !== void 0 && cached.rev === rev) {
			included.push({
				id,
				invocations: cached.invocations
			});
			continue;
		}
		let invocations;
		try {
			const handle = await persistence.open(snapshot.header.id, "read");
			try {
				invocations = skillInvocations(await handle.read());
			} finally {
				await handle.close();
			}
		} catch {
			continue;
		}
		revisions[id] = {
			rev,
			createdAt: typeof created === "number" ? created : 0,
			invocations
		};
		included.push({
			id,
			invocations
		});
	}
	for (const id of Object.keys(revisions)) if (!seen.has(id)) delete revisions[id];
	for (const id of liveIds) {
		let log;
		try {
			log = await readLive(id);
		} catch {
			continue;
		}
		if (log === void 0) continue;
		included.push({
			id,
			invocations: skillInvocations(log)
		});
	}
	return aggregateInvocations(included);
}
// src/stats/persistence.ts
/**
* Adapt a host persistence service to {@link SessionPersistenceLike}.
* Shape-checked only (no I/O): returns undefined when the value is not a
* usable seam, so callers fall back to the query path. The adapter re-resolves
* nothing and holds no state — a replaced host service surfaces as ordinary
* per-call failures, which scans already tolerate.
*/
function asPersistenceSeam(service) {
	if (service === null || typeof service !== "object") return void 0;
	const { list, open } = service;
	if (typeof list !== "function" || typeof open !== "function") return void 0;
	const listFn = list.bind(service);
	const openFn = open.bind(service);
	return {
		list: async () => {
			const rows = await listFn();
			if (!Array.isArray(rows)) throw new Error("persistence list shape mismatch");
			return rows.map((row) => {
				const record = row;
				const id = record.header?.id;
				if (typeof id !== "string" && typeof id !== "number") throw new Error("persistence snapshot shape mismatch");
				const created = record.header?.createdAt;
				return {
					header: {
						id,
						...typeof created === "number" ? { createdAt: created } : {}
					},
					revision: String(record.revision)
				};
			});
		},
		open: async (id, access) => {
			const raw = await openFn(id, access);
			if (raw === null || typeof raw !== "object") throw new Error("persistence handle shape mismatch");
			const { read, close, inheritedEventCount } = raw;
			if (typeof read !== "function" || typeof close !== "function") throw new Error("persistence handle shape mismatch");
			const readFn = read.bind(raw);
			const closeFn = close.bind(raw);
			return {
				read: async () => {
					const events = (await readFn(0, void 0))?.events;
					if (!Array.isArray(events)) throw new Error("persistence read shape mismatch");
					return {
						events,
						...Number.isSafeInteger(inheritedEventCount) && inheritedEventCount >= 0 ? { inheritedEventCount } : {}
					};
				},
				close: () => closeFn()
			};
		}
	};
}
// src/stats.ts
/**
* Wrap a query in a stale-while-revalidate cache: responses never wait for a
* full session-log scan. While the TTL is fresh the cached totals are
* returned; after expiry the stale totals are returned immediately and a
* single background rescan refreshes them — the panel's next poll picks the
* fresh numbers. A full scan decompresses every session log and can take
* seconds, so it must never sit on the request path.
*
* Two scaling mechanisms keep this sane as history grows:
*  - the rescan is incremental (per-session checkpoint, see module doc);
*  - the effective TTL adapts to the measured scan duration, so a heavier
*    corpus automatically lowers the rescan cadence instead of burning CPU
*    on every poll interval.
*/
function createSkillStatsReader(query, ttlMs = 3e5, options = {}) {
	const checkpoint = options.checkpoint ?? {
		windowDays: 0,
		frozenBefore: 0,
		frozenSessions: {},
		lastFullReconcile: 0
	};
	const now = options.now ?? (() => Date.now());
	let cached = checkpoint.lastTotals !== void 0 ? [...checkpoint.lastTotals] : void 0;
	let cachedAt = 0;
	let refreshing = null;
	let lastScanDurationMs = 0;
	const reader = async () => {
		const startedAt = now();
		const base = typeof ttlMs === "function" ? ttlMs() : ttlMs;
		const ttl = Math.max(base, lastScanDurationMs * 3);
		if (cached !== void 0 && startedAt - cachedAt < ttl) return cached;
		if (refreshing === null) {
			const windowDays = options.windowDays?.() ?? 0;
			refreshing = (options.persistence !== void 0 ? (async () => {
				let liveIds = /* @__PURE__ */ new Set();
				if (options.listLiveIds !== void 0) try {
					liveIds = new Set((await options.listLiveIds()).map((id) => String(id)));
				} catch {}
				return scanCold(options.persistence, checkpoint, startedAt, windowDays, liveIds, async (id) => {
					return await options.readLiveSession?.(id);
				});
			})() : scan(query, checkpoint, startedAt, windowDays).then(({ stats }) => stats)).then((stats) => {
				cached = stats;
				cachedAt = now();
				lastScanDurationMs = Math.max(0, cachedAt - startedAt);
				checkpoint.lastTotals = stats;
				options.onCheckpoint?.({
					...checkpoint,
					frozenSessions: { ...checkpoint.frozenSessions },
					...checkpoint.coldRevisions !== void 0 ? { coldRevisions: { ...checkpoint.coldRevisions } } : {}
				});
			}).catch(() => {}).finally(() => {
				refreshing = null;
			});
		}
		return cached ?? [];
	};
	reader.source = options.persistence !== void 0 ? "cold" : "query";
	return reader;
}
// src/data-migrate.ts
/**
* 旧版本数据的一次性搬迁：`$DSH_HOME` 根下的两处旧位置 → `$DSH_HOME/plugin/data/
* custom-instruction-manager/`。
*
* 要搬的是两样东西，都在旧版本里散落在 `$DSH_HOME` 根部：
*  - `dsh-skill-hub.json`（技能开关、来源、市场源、回收站记录）→ `state.json`
*  - `skill-hub/tokenizers/`（25 MB 词表）→ `tokenizer/`
*
* 为什么同步、且在 apply() 里跑：记录文件是懒加载的，任何一条路由都可能先读到
* 它；搬迁要是异步的就存在「路由先读到空状态、随后才被迁过来」的窗口，用户会
* 看到开关全丢。这里只做几次 exists/rename，微秒级，启动时一次性成本可以忽略。
*
* 三条安全规则：目标已存在就**不覆盖**（用户可能已经在新位置有数据）；任何一步
* 失败只记日志、不抛（最坏情况是旧数据留在原地、词表重新下载）；重复执行无副作用。
*/
/** 目录里是否已经有东西（目标非空才阻止搬迁）。 */
function nonEmptyDir(path) {
	try {
		return readdirSync(path).length > 0;
	} catch {
		return true;
	}
}
/**
* 把 0.3.x 的两处旧数据搬到插件自己的数据目录（幂等）。
*
* @param home - DSH home 覆盖（测试注入临时目录）。
* @returns 每样东西各自的结果，供调用方决定要不要写一行日志。
*/
function migrateLegacyData(home) {
	const result = {
		state: "absent",
		tokenizers: "absent",
		dir: pluginDataDir(home)
	};
	const legacyState = legacyStatePath(home);
	if (existsSync(legacyState)) {
		const nextState = statePath(home);
		if (existsSync(nextState)) result.state = "kept";
		else try {
			mkdirSync(dirname(nextState), { recursive: true });
			renameSync(legacyState, nextState);
			result.state = "moved";
		} catch (error) {
			result.error = errorText(error);
		}
	}
	const legacyTokens = legacyTokenizerDir(home);
	if (existsSync(legacyTokens)) {
		const nextTokens = tokenizerCacheDir(home);
		if (existsSync(nextTokens) && nonEmptyDir(nextTokens)) result.tokenizers = "kept";
		else try {
			mkdirSync(dirname(nextTokens), { recursive: true });
			if (existsSync(nextTokens)) rmdirSync(nextTokens);
			renameSync(legacyTokens, nextTokens);
			result.tokenizers = "moved";
			try {
				rmdirSync(dirname(legacyTokens));
			} catch {}
		} catch (error) {
			result.error = errorText(error);
		}
	}
	return result;
}
// src/index.ts
/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
const name = "skill-hub";
/** Services required before the skill-hub surfaces can mount. `settings` is deliberately NOT here: the plugin reads its own volatile config refs and only reaches for the settings service when it is present (issue #11). */
const inject = ["webServer", "skills"];
/**
* The durable field schemas, plain (non-volatile) so the same definitions can
* back both the live view below and the wire form the settings page renders
* from `.toJSON()`. `description` is what the auto-generated page shows with
* each row; `role('secret')` makes the settings layer redact the value on
* every wire read.
*/
const ConfigFields = {
	enabled: z.boolean().default(HUB_CONFIG_DEFAULTS.enabled).description("关闭后技能中枢的路由与入口全部下线。"),
	dotModelColor: z.string().pattern(HEX_COLOR_RE).description("技能行与聊天「/」菜单中「模型可调」圆点的颜色（#rrggbb）。"),
	dotUserColor: z.string().pattern(HEX_COLOR_RE).description("技能行与聊天「/」菜单中「仅用户可调」圆点的颜色（#rrggbb）。"),
	showUseCount: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseCount).description("在技能名旁显示调用次数。"),
	showUseTime: z.boolean().default(HUB_CONFIG_DEFAULTS.showUseTime).description("在技能名行显示最近调用时间。"),
	showGroupSummary: z.boolean().default(HUB_CONFIG_DEFAULTS.showGroupSummary).description("在分组标题后汇总调用次数与最近调用时间。"),
	statsWindowDays: z.number().min(0).max(3650).default(HUB_CONFIG_DEFAULTS.statsWindowDays).description("只统计最近 N 天的使用次数；0 = 全部历史。"),
	statsScanMinutes: z.number().min(1).max(1440).default(HUB_CONFIG_DEFAULTS.statsScanMinutes).description("后台扫描会话日志的间隔（分钟，最小 1）。"),
	excludeDirs: z.array(z.string()).default([...HUB_CONFIG_DEFAULTS.excludeDirs]).description("AGENTS.md 页扫描项目时跳过的目录名（任意层级）；默认跳过 .agent-work。"),
	githubToken: z.string().role("secret").description("市场/来源走 GitHub API：匿名每小时 60 次，填 token 后 5000 次。留空即匿名（或跟随 GITHUB_TOKEN 环境变量）。")
};
/**
* The live plugin config the settings page edits. Field order here is the row
* order the auto-generated page renders.
*/
const Config = z.object({
	enabled: ConfigFields.enabled.volatile(),
	dotModelColor: ConfigFields.dotModelColor.volatile(),
	dotUserColor: ConfigFields.dotUserColor.volatile(),
	showUseCount: ConfigFields.showUseCount.volatile(),
	showUseTime: ConfigFields.showUseTime.volatile(),
	showGroupSummary: ConfigFields.showGroupSummary.volatile(),
	statsWindowDays: ConfigFields.statsWindowDays.volatile(),
	statsScanMinutes: ConfigFields.statsScanMinutes.volatile(),
	excludeDirs: ConfigFields.excludeDirs.volatile(),
	githubToken: ConfigFields.githubToken.volatile()
});
/**
* The settings namespace this plugin's config lives under, narrowed to the
* settings package's branded type. The browser half resolves the same form
* through `ctx.configForms.get(HUB_ENTRY_ID)`.
*/
const ENTRY_ID = HUB_ENTRY_ID;
/** Every config field, in the order the settings page renders them (used to walk the volatile refs). */
const CONFIG_FIELDS = [
	"enabled",
	"dotModelColor",
	"dotUserColor",
	"showUseCount",
	"showUseTime",
	"showGroupSummary",
	"statsWindowDays",
	"statsScanMinutes",
	"excludeDirs",
	"githubToken"
];
/**
* Mount the skill hub routes.
* @param ctx - host plugin context carrying webServer/skills/settings.
*/
function apply(ctx, config) {
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
	const readConfig = () => {
		const out = {};
		for (const field of CONFIG_FIELDS) {
			const ref = config?.[field];
			const value = ref !== void 0 && typeof ref.get === "function" ? ref.get() : ref;
			if (value !== void 0) out[field] = value;
		}
		return out;
	};
	const current = () => resolveHubConfig(readConfig());
	/** The Settings service, when this deployment mounts it. Absent ⇒ no user layer to read or write. */
	const settingsOf = () => ctx.get("settings");
	const migration = migrateLegacyData();
	const store = new SkillHubStore();
	let disposeRoutes;
	let disposeProvider;
	let providerControl;
	let stats;
	const saved = () => {
		return (settingsOf()?.describe().find((entry) => entry.ns === ENTRY_ID))?.user ?? {};
	};
	const updateConfig = async (patch) => {
		const ops = [];
		for (const [field, value] of Object.entries(patch)) if (value === void 0) ops.push({
			op: "unset",
			path: [field]
		});
		else ops.push({
			op: "set",
			path: [field],
			value
		});
		const settings = settingsOf();
		if (settings === void 0) throw new Error("this deployment does not mount the settings service; config is read-only");
		if (ops.length > 0) {
			await settings.mutate(ENTRY_ID, ops);
			sync();
		}
		return current();
	};
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
	const mounted = () => {
		const fiber = ctx.fiber;
		return fiber === void 0 || fiber.uid !== null;
	};
	/** Logger for continuations that may outlive the fiber (#19). */
	const logInfo = (message) => {
		if (mounted()) ctx.logger.info(message);
	};
	const logWarn = (message, error) => {
		if (!mounted()) return;
		if (error === void 0) ctx.logger.warn(message);
		else ctx.logger.warn(message, error);
	};
	if (migration.state === "moved" || migration.tokenizers === "moved") logInfo(`[dsh-skill-hub] moved legacy data into ${migration.dir} (state: ${migration.state}, tokenizers: ${migration.tokenizers})`);
	if (migration.error !== void 0) logWarn("[dsh-skill-hub] legacy data migration failed; the old files stay where they are", migration.error);
	const sync = () => {
		if (!mounted()) return;
		if (disposeProvider !== void 0) {
			disposeProvider();
			disposeProvider = void 0;
		}
		const value = current();
		setGithubToken(value.githubToken);
		if (value.enabled) {
			providerControl = void 0;
			disposeProvider = ctx.effect(() => ctx.skills.registerProvider((control) => {
				providerControl = control;
				return new SkillHubProvider(control);
			}), "dsh-skill-hub: provider");
		}
		ctx.logger.info(`[dsh-skill-hub] surfaces synced: enabled=${value.enabled}`);
		if (disposeRoutes !== void 0) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
		disposeRoutes = ctx.effect(() => {
			const deps = {
				skills: ctx.skills,
				store,
				fence: hostTrustFence(() => ctx.get("connection"), () => ctx.logger.warn("[dsh-skill-hub] Connection service absent: routes fall back to literal-loopback; reverse-proxy deployments will 403 until it mounts")),
				invalidate: () => {
					providerControl?.invalidate();
				},
				mcp: createMcpAccess((name) => ctx.get(name)),
				mcpConfig: createMcpConfig((name) => ctx.get(name)),
				stats,
				config: current,
				saved,
				updateConfig
			};
			hydrateAgentsRoster(deps);
			const disposers = makeRoutes(deps).map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "dsh-skill-hub: routes");
	};
	sync();
	(async () => {
		const home = dshHome();
		const agentsHome = process.env.DSH_AGENTS_HOME ?? join(homedir(), ".agents");
		for (const root of [join(home, "skills"), join(agentsHome, "skills")]) try {
			const c = await cleanupLeftoverImportDirs(root);
			if (c > 0) logInfo(`[dsh-skill-hub] startup cleaned ${c} leftover import temp dir(s) in ${root}`);
		} catch (error) {
			logWarn("[dsh-skill-hub] startup cleanup failed", error);
		}
	})();
	(async () => {
		try {
			const legacy = await store.getConfig();
			if (!mounted()) return;
			if (Object.keys(legacy).length > 0 && Object.keys(saved()).length === 0) {
				const settings = settingsOf();
				if (settings !== void 0) await settings.update(ENTRY_ID, legacy);
			}
		} catch (error) {
			logWarn("[dsh-skill-hub] sidecar config migration into the settings namespace failed", error);
		}
	})();
	let statsQuery;
	let statsPersistence;
	let statsGeneration = 0;
	const wireStats = () => {
		const query = statsQuery;
		if (query === void 0) return;
		const generation = ++statsGeneration;
		const cold = statsPersistence;
		(async () => {
			const checkpoint = await store.getSkillStatsState().catch(() => void 0);
			if (generation !== statsGeneration || !mounted()) return;
			const scanMinutes = () => {
				const value = current().statsScanMinutes;
				return typeof value === "number" && value >= 1 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsScanMinutes;
			};
			const windowDays = () => {
				const value = current().statsWindowDays;
				return typeof value === "number" && value >= 0 ? Math.floor(value) : HUB_CONFIG_DEFAULTS.statsWindowDays;
			};
			const reader = createSkillStatsReader(query, () => scanMinutes() * 6e4, {
				checkpoint,
				windowDays,
				...cold === void 0 ? {} : {
					persistence: cold,
					listLiveIds: async () => {
						try {
							return (await query.listSessions()).filter((record) => record.live === true).map((record) => record.header.id);
						} catch {
							return [];
						}
					},
					readLiveSession: async (id) => {
						try {
							return await query.readSession(id);
						} catch {
							return;
						}
					}
				},
				onCheckpoint: (next) => {
					store.saveSkillStatsState(next).catch((error) => {
						if (mounted()) ctx.logger.warn("[dsh-skill-hub] persisting skill-stats checkpoint failed", error);
					});
				}
			});
			if (generation !== statsGeneration || !mounted()) return;
			ctx.logger.info(`[dsh-skill-hub] stats seam: ${cold === void 0 ? "session-query (fallback)" : "session-persistence (cold)"}`);
			stats = reader;
			sync();
		})();
	};
	ctx.inject(["sessionQuery"], (sctx) => {
		statsQuery = sctx.sessionQuery;
		wireStats();
		sctx.inject(["sessionPersistence"], (pctx) => {
			(async () => {
				const raw = pctx.sessionPersistence;
				const seam = asPersistenceSeam(raw);
				if (seam === void 0) {
					if (mounted()) ctx.logger.warn("[dsh-skill-hub] sessionPersistence shape mismatch, staying on query fallback");
					return;
				}
				try {
					await seam.list();
				} catch (error) {
					if (mounted()) ctx.logger.warn("[dsh-skill-hub] persistence seam probe failed, staying on query fallback", error);
					return;
				}
				if (!mounted()) return;
				statsPersistence = seam;
				wireStats();
			})();
		});
	});
}
export { Config, ENTRY_ID, apply, inject, name };

//# sourceMappingURL=index.js.map
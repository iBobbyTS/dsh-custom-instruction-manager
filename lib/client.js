window.__ModuleLoader__.load({
	id: "dsh-skill-hub",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		// src/protocol/api.ts
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
		TOKEN_MODELS.filter((model) => model.preset).map((model) => model.id);
		// src/protocol/sources.ts
		/** 项目级技能来源（它们有 workspace 归属，不属于「个人」组）。 */
		function isProjectSource(source) {
			return source === "project-dsh" || source === "project-agents";
		}
		// src/client/api.ts
		/**
		* Browser-side API client for the /api/skill-hub route family. The only
		* data access path the panel uses — plain fetch, same origin.
		*/
		/** Error carrying the route's JSON error message. */
		var SkillHubApiError = class extends Error {
			code;
			body;
			constructor(message, code, body) {
				super(message);
				this.code = code;
				this.body = body;
				this.name = "SkillHubApiError";
			}
		};
		/** Parse a JSON response or throw a SkillHubApiError. */
		async function readJson(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new SkillHubApiError("HTTP " + response.status + ": invalid JSON response");
			}
			if (!response.ok) {
				const record = typeof body === "object" && body !== null ? body : {};
				throw new SkillHubApiError(typeof record.error === "string" ? record.error : "HTTP " + response.status, typeof record.code === "string" ? record.code : void 0, body);
			}
			return body;
		}
		/**
		* Resolve one route path against the page's base.
		*
		* Every route in this family is registered on the server as a root-absolute
		* path (`/api/skill-hub/...`), which is right there but wrong in a browser
		* behind a reverse proxy that owns a path prefix: the page loads from
		* `https://host/app/dsh/` while a root-absolute URL drops the prefix entirely,
		* so the gateway answers 404 HTML and `readJson` reports "invalid JSON
		* response" (issue #18). Resolving against `document.baseURI` is the host's own
		* convention — `dsh-client-connection` opens its browser carrier with
		* `new URL(path.slice(1), document.baseURI)` — so a root deployment resolves to
		* exactly the same absolute path while a prefixed one keeps its prefix, and the
		* gateway strips it before forwarding: the server still receives
		* `/api/skill-hub/*`.
		*
		* `SKILL_HUB_API_ROOT` must stay absolute (the same constant registers the
		* routes on the server), which is why the prefix is applied here at the single
		* outbound boundary rather than in the constants.
		* @param path - one route path, root-absolute unless it is already a full URL.
		* @returns the URL to fetch.
		*/
		function resolveApiUrl(path) {
			if (!path.startsWith("/")) return path;
			if (typeof document === "undefined") return path;
			try {
				return new URL(path.slice(1), document.baseURI).href;
			} catch {
				return path;
			}
		}
		/**
		* Fetch with a hard timeout: a hung connection (proxy, stalled keep-alive,
		* host wedged) must never leave the panel stuck on "loading" forever — it
		* fails fast and surfaces the error banner instead.
		*/
		async function fetchWithTimeout(input, init, ms = 1e4) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), ms);
			try {
				return await fetch(typeof input === "string" ? resolveApiUrl(input) : input, {
					...init,
					signal: controller.signal
				});
			} finally {
				clearTimeout(timer);
			}
		}
		/** The browser half's only data entry point. */
		var SkillHubApi = class {
			/** One GET round trip (query already encoded by the caller). */
			async get(path, query = "", ms) {
				return readJson(await fetchWithTimeout(path + query, void 0, ms));
			}
			/** One POST round trip (body omitted for routes that take none). */
			async post(path, body, ms) {
				return readJson(await fetchWithTimeout(path, body !== void 0 ? {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				} : { method: "POST" }, ms));
			}
			/** Catalog lookup options (cwd selects a workspace's project skills). */
			catalog(options) {
				const query = options?.cwd !== void 0 && options.cwd !== "" ? "?cwd=" + encodeURIComponent(options.cwd) : "";
				return this.get(SKILL_HUB_API.catalog, query);
			}
			/** One skill's detail (cwd selects a workspace's project skills). */
			async skill(name, options) {
				const cwd = options?.cwd !== void 0 && options.cwd !== "" ? "&cwd=" + encodeURIComponent(options.cwd) : "";
				return (await this.get(SKILL_HUB_API.skill, "?name=" + encodeURIComponent(name) + cwd)).skill;
			}
			/**
			* 改写一个技能文件的调用方式（frontmatter 的 disable-model-invocation /
			* user-invocable）。dsh 注册表没有写入口，值只能落在文件里。
			*/
			setInvocation(payload) {
				return this.post(SKILL_HUB_API.skillInvocation, payload);
			}
			/**
			* Move one writable skill into the system trash (~/.Trash, timestamped on a
			* name clash) so Finder keeps the recovery path. Project skills pass cwd.
			*/
			deleteSkill(name, cwd) {
				return this.post(SKILL_HUB_API.skillDelete, {
					name,
					...cwd !== void 0 && cwd !== "" ? { cwd } : {}
				});
			}
			/** Reveal one skill file in the OS file manager (Finder). */
			revealSkill(name, cwd) {
				return this.post(SKILL_HUB_API.skillReveal, {
					name,
					...cwd !== void 0 && cwd !== "" ? { cwd } : {}
				});
			}
			create(payload) {
				return this.post(SKILL_HUB_API.create, payload);
			}
			stats() {
				return this.get(SKILL_HUB_API.stats);
			}
			/** The user's added market sources. */
			market() {
				return this.get(SKILL_HUB_API.market);
			}
			/** Add a market source repo; resolves with the fresh list plus the resolved slug. */
			addMarketSource(repo) {
				return this.post(SKILL_HUB_API.marketSource, { repo });
			}
			/** Remove a market source repo; resolves with the fresh list. */
			removeMarketSource(repo) {
				return this.post(SKILL_HUB_API.marketSourceDelete, { repo });
			}
			/** Stars + downloads per market source (hourly server-side cache; refresh=1 refetches stale entries). */
			marketStats(refresh = false) {
				const query = refresh ? "?refresh=1" : "";
				return this.get(SKILL_HUB_API.marketStats, query, refresh ? 6e4 : void 0);
			}
			/** Check every market source for updates (throttled server-side). */
			marketCheck() {
				return this.get(SKILL_HUB_API.marketCheck);
			}
			/** Align a market source to its pinned ref; resolves with tracked skills. */
			marketSync(repo) {
				return this.post(SKILL_HUB_API.marketSync, { repo });
			}
			/** Releases + branches of a market source for the version picker. */
			marketSourceVersions(repo) {
				return this.get(SKILL_HUB_API.marketSourceVersions, "?repo=" + encodeURIComponent(repo));
			}
			/** Pin a market source to an explicit ref (branch picker). */
			setMarketSourceRef(repo, ref) {
				return this.post(SKILL_HUB_API.marketSourceRef, {
					repo,
					ref
				});
			}
			/** Check the hub's own latest GitHub release. */
			updateCheck() {
				return this.get(SKILL_HUB_API.update);
			}
			/** Discover importable skills in a GitHub repo. */
			repoDiscover(repo) {
				return this.get(SKILL_HUB_API.repo, "?repo=" + encodeURIComponent(repo));
			}
			/** Install selected repo skills into the user-dsh root (records the source). Returns jobId for polling. */
			repoImport(repo, paths, ref) {
				const payload = {
					repo,
					paths,
					...ref !== void 0 && ref !== "" ? { ref } : {}
				};
				return this.post(SKILL_HUB_API.repoImport, payload);
			}
			/** Poll import job progress (B方案轮询) */
			repoImportProgress(jobId) {
				return this.get(SKILL_HUB_API.repoImportProgress, "?jobId=" + encodeURIComponent(jobId));
			}
			/** Cancel a running import job (选项2：唯有取消才停) */
			repoImportCancel(jobId) {
				return this.post(SKILL_HUB_API.repoImportCancel, { jobId });
			}
			/** Read the hub's runtime config (effective values + saved overrides). */
			config() {
				return this.get(SKILL_HUB_API.config);
			}
			/** Persist a config patch (only the fields in the patch change); resolves with the fresh config. */
			updateConfig(patch) {
				return this.post(SKILL_HUB_API.config, patch);
			}
			/**
			* AGENTS.md 页：上一次完成的索引缓存（不触发扫描）。
			*
			* `cached=false` 表示这个 host 进程还没扫过，面板据此跳过「先铺缓存」。
			*/
			agentsCache() {
				return this.get(SKILL_HUB_API.agents);
			}
			/**
			* AGENTS.md 页：分批扫描的一步（一个作用域一步）。
			*
			* 第 0 步不带 scanId；后续步骤带上第 0 步返回的 id，`code='expired'` 时
			* 说明这一轮已被别的扫描顶掉，从第 0 步重来即可。
			*/
			agentsScan(scanId, step) {
				const query = "?step=" + step + (scanId !== void 0 && scanId !== "" ? "&scan=" + encodeURIComponent(scanId) : "");
				return this.get(SKILL_HUB_API.agentsScan, query);
			}
			/** AGENTS.md 页：按清单里的绝对路径读取一个文件的正文与元数据。 */
			async agentsFile(path) {
				return (await this.get(SKILL_HUB_API.agentsFile, "?path=" + encodeURIComponent(path))).file;
			}
			/**
			* 写回一份指令文件的整份原文。
			*
			* 请求带载入时的 mtime/size：磁盘在编辑期间被别处改过时，host 回 409，
			* 这里抛 code='stale' 的 SkillHubApiError（body.latest 是最新内容）。
			*/
			saveAgentsFile(payload) {
				return this.post(SKILL_HUB_API.agentsFileSave, payload);
			}
			/**
			* 写回技能正文（frontmatter 由 host 原样保留）。
			* 冲突语义与 {@link saveAgentsFile} 相同：code='stale' + body.latest。
			*/
			saveSkillContent(payload) {
				return this.post(SKILL_HUB_API.skillContent, payload);
			}
			/** MCP 分类页：当前进程里配置的 MCP 服务器、它们的工具与可写性。 */
			mcp() {
				return this.get(SKILL_HUB_API.mcp);
			}
			/** 启用/禁用一台 MCP 服务器；响应里带回刷新后的列表（省一次往返）。 */
			toggleMcp(entryId, enabled) {
				return this.post(SKILL_HUB_API.mcpToggle, {
					entryId,
					enabled
				});
			}
			/**
			* 新建（不传 entryId）或编辑一台 MCP 服务器。
			*
			* 保存落在 profile 补丁里：本页建的行写进本插件的受管块，其余行交给 dsh
			* 的配置编辑服务。字段校验失败时 host 回 400 + `fields`，错误体在
			* SkillHubApiError.body 里。
			*/
			saveMcpServer(server, entryId) {
				const payload = entryId === void 0 ? { server } : {
					entryId,
					server
				};
				return this.post(SKILL_HUB_API.mcpSave, payload);
			}
			/** 删除本页管理的 MCP 服务器。 */
			removeMcpServer(entryId) {
				return this.post(SKILL_HUB_API.mcpRemove, { entryId });
			}
			/**
			* 数一段文件原文在各模型词表下的 token 数。
			*
			* 超时给到 150s，而不是其余接口的 10s：第一次计数要先下载词表（DeepSeek
			* 6 MB + GLM 19 MB），用默认超时会让首次进入详情页必然失败。词表落到宿主
			* 本机缓存后，后续计数是毫秒级。
			* @param text - 文件原文，原样传递（不 trim）。
			* @returns 每个模型一条结果（失败项带 error，另一个模型不受影响）。
			*/
			async countTokens(text) {
				const request = { text };
				return (await this.post(SKILL_HUB_API.tokens, request, 15e4)).entries;
			}
			/** 可选 token 模型（含选中与已下载状态）——「管理模型」的数据源。 */
			async tokenModels() {
				return (await this.get(SKILL_HUB_API.tokensModels)).models;
			}
			/**
			* 勾选/取消一个模型：勾选会先下载词表（19 MB 级），取消则删掉那份文件。
			* 超时同样给到 150s——首次下载 6 MB / 19 MB。
			* @returns 改完之后的完整模型列表。
			*/
			async selectTokenModel(id, selected) {
				const request = {
					id,
					selected
				};
				return (await this.post(SKILL_HUB_API.tokensSelect, request, 15e4)).models;
			}
			/** 系统集合组 + origin 映射。 */
			groups() {
				return this.get(SKILL_HUB_API.groups);
			}
			/** 来源列表 + 派生 origin 映射 + 集合组 + 回收站。 */
			sources() {
				return this.get(SKILL_HUB_API.sources);
			}
			/** 检查指定（或全部）来源的上游更新。 */
			checkSources(repo) {
				const payload = repo !== void 0 ? { repo } : {};
				return this.post(SKILL_HUB_API.sourceCheck, payload);
			}
			/** 同步一个来源的所选（或全部）技能到上游最新版本。 */
			syncSource(repo, skills) {
				const payload = skills !== void 0 ? {
					repo,
					skills
				} : { repo };
				return this.post(SKILL_HUB_API.sourceSync, payload);
			}
			/** 跟进上游删除：把所选技能移入回收站。 */
			confirmDeleteSource(repo, skills) {
				const payload = {
					repo,
					skills
				};
				return this.post(SKILL_HUB_API.sourceDelete, payload);
			}
			/** 从回收站恢复一个技能。 */
			restoreSource(name) {
				const payload = { name };
				return this.post(SKILL_HUB_API.sourceRestore, payload);
			}
			/** Permanently delete every skill currently in the trash. */
			clearTrash() {
				return this.post(SKILL_HUB_API.sourceTrashClear);
			}
			/** Auto-fix a fixable diagnostic (e.g. unquoted colon). */
			fixDiagnostic(path) {
				return this.post(SKILL_HUB_API.diagnosticFix, { path });
			}
		};
		// src/client/locales/common.ts
		/** 面板框架与通用：入口/视图切换/面板/图例/报错/更新检查/新建表单/诊断修复。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhCommon = {
			"entry.label": "其他插件 (AGENTS, Skill, MCP, etc.)",
			"view.sources": "来源",
			"view.market": "市场",
			"view.flat": "平铺",
			"view.grouped": "分组",
			"panel.title": "其他插件",
			"category.label": "内容分类",
			"category.agents": "AGENTS.md",
			"category.skills": "Skill",
			"category.mcp": "MCP",
			"category.hooks": "Hook",
			"category.about": "关于",
			"category.pending": "「{name}」还没有接入数据。接入后会像「Skill」一样支持浏览与来源同步。",
			"agents.user": "用户级",
			"agents.none": "无 AGENTS.md",
			"agents.exclude": "排除目录",
			"agents.excludeHint": "扫描项目时跳过这些目录名（任意层级、精确匹配）。默认跳过 .agent-work；这里只影响本页，不影响 Skill 页。",
			"agents.excludeEmpty": "没有排除目录（会扫描全部目录）。",
			"agents.placeholder": "目录名，如 .agent-work",
			"agents.add": "添加",
			"agents.remove": "移除",
			"agents.reset": "恢复默认",
			"agents.rescan": "重新扫描",
			"agents.scanningPercent": "扫描中（{percent}%）",
			"agents.loading": "正在扫描指令文件…",
			"agents.scope": "所属",
			"agents.size": "大小",
			"agents.modifiedAt": "修改时间",
			"agents.reading": "读取文件正文…",
			"agents.readError": "读取失败：{error}",
			"agents.error": "扫描失败：{error}",
			"about.title": "关于「其他插件」",
			"about.plugin": "插件",
			"about.pluginName": "自定义指令管理器",
			"about.version": "版本",
			"about.update": "更新",
			"about.unknownVersion": "未知",
			"about.idle": "点击「检查更新」查询最新发布版本。",
			"managed.user": "User Managed",
			"managed.project": "Project Managed",
			"panel.new": "新建技能",
			"panel.search": "搜索技能…",
			"legend.model": "模型可调 — Agent 可自动调用",
			"legend.user": "用户可调 — 仅显式点名时触发",
			"legend.hint": "无圆点 — 不可被调用。",
			"panel.diagnostics": "发现诊断",
			"panel.empty": "没有匹配的技能。",
			"panel.emptyAll": "本地还没有技能。点击「新建技能」创建第一个。",
			"panel.loading": "读取中…",
			"panel.incomplete": "（目录可能不完整）",
			"panel.workspacePlaceholder": "工作区路径（回车应用）",
			"panel.workspaceHint": "填写项目路径后，面板同时显示该项目 .dsh/skills 与 .agents/skills 下的技能（只读）；留空回车恢复用户级视图。",
			"panel.workspaceClear": "清除工作区",
			"update.check": "检查更新",
			"update.checking": "检查中…",
			"update.upToDate": "已是最新版本 v{version}",
			"update.available": "发现新版本 v{version}（当前 v{current}）",
			"update.newVersion": "新版本 v{version}",
			"update.error": "检查更新失败：{error}",
			"update.unavailable": "暂无可用的发布版本",
			"diag.fix": "修复",
			"diag.fixing": "修复中…",
			"diag.fixed": "已修复",
			"diag.fixConfirm": "用自动修复重写以下文件的 frontmatter？建议先备份：{path}",
			"form.capabilityHint": "能力怎么选：重复方法 → 技能；外部系统 → MCP；长期资料 → 知识库。",
			"form.descPlaceholder": "一句话说明用途（含触发词），Agent 靠它自动激活技能",
			"form.name": "技能名（kebab-case，如 code-review）",
			"form.desc": "描述（一句话路由说明）",
			"form.root": "目标目录",
			"form.submit": "创建",
			"form.cancel": "取消",
			"form.busy": "创建中…",
			"form.success": "已创建：",
			"form.error": "创建失败：",
			"err.dismiss": "知道了"
		};
		const enCommon = {
			"entry.label": "Other Plugins (AGENTS, Skill, MCP, etc.)",
			"view.sources": "Sources",
			"view.market": "Market",
			"view.flat": "Flat",
			"view.grouped": "Grouped",
			"panel.title": "Other Plugins",
			"category.label": "Content categories",
			"category.agents": "AGENTS.md",
			"category.skills": "Skill",
			"category.mcp": "MCP",
			"category.hooks": "Hook",
			"category.about": "About",
			"category.pending": "“{name}” has no data source yet. Once wired up it will browse and sync sources like Skill.",
			"agents.user": "User level",
			"agents.none": "No AGENTS.md",
			"agents.exclude": "Excluded dirs",
			"agents.excludeHint": "Directory names skipped while scanning a project (any depth, exact match). .agent-work is skipped by default; this only affects this page, not the Skill tab.",
			"agents.excludeEmpty": "No excluded directories (every directory is scanned).",
			"agents.placeholder": "Directory name, e.g. .agent-work",
			"agents.add": "Add",
			"agents.remove": "Remove",
			"agents.reset": "Restore defaults",
			"agents.rescan": "Rescan",
			"agents.scanningPercent": "Scanning ({percent}%)",
			"agents.loading": "Scanning instruction files…",
			"agents.scope": "Scope",
			"agents.size": "Size",
			"agents.modifiedAt": "Modified",
			"agents.reading": "Reading file…",
			"agents.readError": "Could not read file: {error}",
			"agents.error": "Scan failed: {error}",
			"about.title": "About “Other Plugins”",
			"about.plugin": "Plugin",
			"about.pluginName": "Custom Instruction Manager",
			"about.version": "Version",
			"about.update": "Updates",
			"about.unknownVersion": "Unknown",
			"about.idle": "Press “Check for updates” to look up the latest release.",
			"managed.user": "User Managed",
			"managed.project": "Project Managed",
			"panel.new": "New Skill",
			"panel.search": "Search skills…",
			"legend.model": "Model-invocable — agents may call automatically",
			"legend.user": "User-invocable — explicit invocation only",
			"legend.hint": "No dot — not invocable.",
			"panel.diagnostics": "Discovery diagnostics",
			"panel.empty": "No matching skills.",
			"panel.emptyAll": "No skills installed yet. Create the first one.",
			"panel.loading": "Loading…",
			"panel.incomplete": "(catalog may be incomplete)",
			"panel.workspacePlaceholder": "Workspace path (Enter to apply)",
			"panel.workspaceHint": "Enter a project path to also show that workspace's .dsh/skills and .agents/skills skills (read-only); clear + Enter to return to the user-level view.",
			"panel.workspaceClear": "Clear workspace",
			"update.check": "Check for updates",
			"update.checking": "Checking…",
			"update.upToDate": "Up to date: v{version}",
			"update.available": "Update available: v{version} (current v{current})",
			"update.newVersion": "New version v{version}",
			"update.error": "Update check failed: {error}",
			"update.unavailable": "No release available",
			"diag.fix": "Fix",
			"diag.fixing": "Fixing…",
			"diag.fixed": "Fixed",
			"diag.fixConfirm": "Rewrite the frontmatter of this file with the auto-fix? Back it up first: {path}",
			"form.capabilityHint": "Choosing a capability: repeatable method → skill; external system → MCP; long-term knowledge → knowledge base.",
			"form.descPlaceholder": "One line on what it does (with trigger words) — agents auto-activate from this",
			"form.name": "Skill name (kebab-case, e.g. code-review)",
			"form.desc": "Description (one routing sentence)",
			"form.root": "Target root",
			"form.submit": "Create",
			"form.cancel": "Cancel",
			"form.busy": "Creating…",
			"form.success": "Created: ",
			"form.error": "Create failed: ",
			"err.dismiss": "Dismiss"
		};
		// src/client/locales/detail.ts
		/** 技能详情。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhDetail = {
			"detail.copyMention": "复制 $mention",
			"detail.copyPath": "复制路径",
			"detail.copied": "已复制",
			"detail.back": "返回列表",
			"detail.managedBy": "管理方",
			"detail.addedAt": "添加时间",
			"detail.updatedAt": "更新时间",
			"detail.path": "路径",
			"detail.whenToUse": "适用场景",
			"detail.uses": "调用次数",
			"detail.loading": "读取技能正文…",
			"detail.invocation": "调用方式",
			"detail.modelInvocable": "模型可调",
			"detail.modelInvocableHint": "Agent 可自动调用；取消勾选写入 disable-model-invocation: true",
			"detail.userInvocable": "用户可调",
			"detail.userInvocableHint": "仅显式点名时触发；取消勾选写入 user-invocable: false",
			"detail.invocationReadonly": "该技能由内置或插件提供者注册，没有可写的技能文件，调用方式只读。",
			"detail.invocationSaved": "调用方式已写入",
			"detail.editSave": "保存",
			"detail.editSaving": "保存中…",
			"detail.editDiscardAll": "放弃所有编辑",
			"detail.editShortcut": "⌘S 保存",
			"detail.editSkillBody": "技能正文",
			"detail.editAgentFile": "指令文件正文",
			"detail.editDiscard": "放弃所有编辑？未保存的修改会丢失。",
			"detail.editSaved": "已保存到磁盘",
			"detail.editUpstream": "已保存。此技能跟随 {repo}，同步会用上游版本覆盖本地修改。",
			"detail.editConflictTitle": "文件已被修改",
			"detail.editConflictText": "这个文件在你编辑期间被别处改过（例如 dsh 会话里的 agent）。你的草稿还没写进磁盘。",
			"detail.editConflictCopyReload": "复制并重新加载",
			"detail.editConflictContinue": "继续编辑",
			"detail.editConflictOverwrite": "仍然覆盖"
		};
		const enDetail = {
			"detail.copyMention": "Copy $mention",
			"detail.copyPath": "Copy path",
			"detail.copied": "Copied",
			"detail.back": "Back to list",
			"detail.managedBy": "Managed by",
			"detail.addedAt": "Added",
			"detail.updatedAt": "Updated",
			"detail.path": "Path",
			"detail.whenToUse": "When to use",
			"detail.uses": "Uses",
			"detail.loading": "Loading skill body…",
			"detail.invocation": "Invocation",
			"detail.modelInvocable": "Model-invocable",
			"detail.modelInvocableHint": "The agent may load it on its own; clearing this writes disable-model-invocation: true",
			"detail.userInvocable": "User-invocable",
			"detail.userInvocableHint": "Only explicit /name mentions; clearing this writes user-invocable: false",
			"detail.invocationReadonly": "Registered by a bundled or plugin provider: there is no writable skill file, so the invocation policy is read-only.",
			"detail.invocationSaved": "Invocation policy written",
			"detail.editSave": "Save",
			"detail.editSaving": "Saving…",
			"detail.editDiscardAll": "Discard all edits",
			"detail.editShortcut": "⌘S saves",
			"detail.editSkillBody": "Skill body",
			"detail.editAgentFile": "Instruction file body",
			"detail.editDiscard": "Discard all edits? Unsaved changes will be lost.",
			"detail.editSaved": "Saved to disk",
			"detail.editUpstream": "Saved. This skill follows {repo}; syncing overwrites local changes with the upstream version.",
			"detail.editConflictTitle": "File changed on disk",
			"detail.editConflictText": "This file was changed elsewhere while you were editing (for example by an agent in a dsh session). Your draft has not been written to disk.",
			"detail.editConflictCopyReload": "Copy and reload",
			"detail.editConflictContinue": "Keep editing",
			"detail.editConflictOverwrite": "Overwrite anyway"
		};
		// src/client/locales/market.ts
		/** 市场与仓库扫描导入。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhMarket = {
			"market.syncHint": "将同步到上游最新版并提示可更新的本地技能",
			"market.addPlaceholder": "owner/repo 或 https://github.com/…",
			"market.addSource": "添加源",
			"market.noSources": "还没有市场源。从下方内置市场添加，或输入一个 GitHub 仓库。",
			"market.title": "市场",
			"market.catalogHint": "精选技能仓库，添加后即可扫描安装，并持续检查更新。",
			"market.catalog.anthropics": "Anthropic 官方技能合集（Claude Skills）",
			"market.catalog.superpowers": "Superpowers 社区技能合集",
			"market.catalog.mattpocock": "Matt Pocock 技能集",
			"market.catalog.openDesign": "设计技能合集（design-templates）",
			"market.add": "添加",
			"market.installed": "已装 {count}",
			"market.updatable": "可更新 {count}",
			"market.deletedUpstream": "上游已删 {count}",
			"market.checkAll": "检查全部",
			"market.updateAll": "全部更新",
			"market.updateAllConfirmTitle": "批量更新全部技能？",
			"market.updateAllConfirmText": "将把以下来源的可更新技能更新到上游最新版本（覆盖本地修改）：",
			"market.updateAllItem": "{repo}（{count} 个技能）",
			"market.updateAllDone": "已更新 {count} 个来源",
			"market.deleteSource": "移除源",
			"market.scan": "扫描",
			"market.scanning": "扫描中…",
			"market.checkUpdate": "检查更新",
			"market.checking": "检查中…",
			"market.upToDate": "已是最新",
			"market.update": "更新",
			"market.updateCount": "更新 {count} 个",
			"market.syncing": "同步中…",
			"market.updated": "有更新",
			"market.newRelease": "新版本 v{version}",
			"market.branchTitle": "选择分支",
			"market.branchHint": "该仓库没有正式发布，选择要跟踪的分支（默认为 main）：",
			"market.branchConfirm": "确定",
			"market.versionTitle": "切换跟踪版本",
			"market.versionText": "选择 {repo} 要跟踪的版本，切换后建议重新扫描并同步已装技能",
			"market.versionCurrent": "当前 {ref}",
			"market.versionReleases": "发布版",
			"market.versionBranches": "分支",
			"market.versionCustom": "自定义（tag / 分支 / commit）",
			"market.versionConfirm": "切换到 {ref}",
			"market.versionHint": "点击切换跟踪版本",
			"market.unpinned": "未定版",
			"market.starsHint": "GitHub 星标 {count} 个",
			"market.downloadsHint": "发布附件累计下载 {count} 次",
			"market.syncTitle": "同步本地技能",
			"market.syncText": "市场源已对齐到 {ref}，要同步更新以下本地技能吗？",
			"market.syncNone": "该来源还没有导入本地技能。",
			"market.syncCancel": "跳过",
			"market.removeHint": "移除源不影响已安装的技能。",
			"repo.scanTitle": "扫描结果",
			"repo.close": "关闭",
			"repo.searchPlaceholder": "搜索技能名…",
			"repo.allRoots": "全部 {count}",
			"repo.selection": "已选 {selected}/{total} · {size} · 显示 {shown}/{filtered}（过滤后）",
			"repo.noMatch": "无匹配技能",
			"repo.loadMore": "加载更多 {step} (剩余 {remaining})",
			"repo.skillProgress": "{done}/{total} 个技能",
			"repo.ready": "发现 {count} 个可导入技能",
			"repo.truncated": "⚠ 仓库过大，仅展示部分技能（GitHub 截断），可缩小仓库或指定子目录",
			"repo.empty": "没有找到可导入技能。",
			"repo.selectVisible": "全选当前显示",
			"repo.selectAllN": "全选全部 {count}",
			"repo.clearAll": "清空",
			"repo.import": "导入所选 ({count})",
			"repo.importing": "导入中…",
			"repo.existing": "已存在",
			"repo.files": "{count} 个文件 · {size}",
			"repo.imported": "导入成功 {count} 个",
			"repo.skippedExisting": "跳过已存在 {count} 个",
			"repo.replaced": "已替换禁用占位 {count} 个（旧目录已移入回收站）",
			"repo.failed": "失败 {count} 个",
			"repo.cancel": "取消",
			"repo.cancelled": "已取消 · 已导入 {imported}/{total} 已保留，临时文件已清理",
			"repo.importingCurrent": "正在导入: {name} ({done}/{total})",
			"repo.root.self": "仓库根",
			"repo.root.skills": "skills",
			"repo.root.designTemplates": "design-templates",
			"repo.root.generic": "{root}"
		};
		const enMarket = {
			"market.syncHint": "Sync to the latest upstream and report local skills that can update",
			"market.addPlaceholder": "owner/repo or https://github.com/…",
			"market.addSource": "Add source",
			"market.noSources": "No market sources yet. Add one from the built-in catalog below, or enter a GitHub repo.",
			"market.title": "Market",
			"market.catalogHint": "Curated skill repos — add one to scan and install, with ongoing update checks.",
			"market.catalog.anthropics": "Official Anthropic skill collection (Claude Skills)",
			"market.catalog.superpowers": "Superpowers community skill collection",
			"market.catalog.mattpocock": "Matt Pocock skill collection",
			"market.catalog.openDesign": "Design skill collection (design-templates)",
			"market.add": "Add",
			"market.installed": "{count} installed",
			"market.updatable": "{count} updatable",
			"market.deletedUpstream": "{count} deleted upstream",
			"market.checkAll": "Check all",
			"market.updateAll": "Update all",
			"market.updateAllConfirmTitle": "Update every skill?",
			"market.updateAllConfirmText": "The updatable skills of these sources will be overwritten with their latest upstream versions:",
			"market.updateAllItem": "{repo} ({count} skills)",
			"market.updateAllDone": "Updated {count} sources",
			"market.deleteSource": "Remove source",
			"market.scan": "Scan",
			"market.scanning": "Scanning…",
			"market.checkUpdate": "Check for updates",
			"market.checking": "Checking…",
			"market.upToDate": "Up to date",
			"market.update": "Update",
			"market.updateCount": "Update {count}",
			"market.syncing": "Syncing…",
			"market.updated": "Updates available",
			"market.newRelease": "New release v{version}",
			"market.branchTitle": "Choose a branch",
			"market.branchHint": "This repo has no releases. Pick a branch to track (main by default):",
			"market.branchConfirm": "Confirm",
			"market.versionTitle": "Switch tracked version",
			"market.versionText": "Pick the version for {repo} to track; rescan and sync installed skills afterwards",
			"market.versionCurrent": "current {ref}",
			"market.versionReleases": "Releases",
			"market.versionBranches": "Branches",
			"market.versionCustom": "Custom (tag / branch / commit)",
			"market.versionConfirm": "Switch to {ref}",
			"market.versionHint": "Click to switch the tracked version",
			"market.unpinned": "unpinned",
			"market.starsHint": "{count} GitHub stars",
			"market.downloadsHint": "{count} release asset downloads",
			"market.syncTitle": "Update local skills",
			"market.syncText": "Market source aligned to {ref}. Update these local skills?",
			"market.syncNone": "No local skills tracked from this repo yet.",
			"market.syncCancel": "Skip",
			"market.removeHint": "Removing a source does not affect installed skills.",
			"repo.scanTitle": "Scan result",
			"repo.close": "Close",
			"repo.searchPlaceholder": "Search skill name…",
			"repo.allRoots": "All {count}",
			"repo.selection": "Selected {selected}/{total} · {size} · showing {shown}/{filtered} (filtered)",
			"repo.noMatch": "No matching skills",
			"repo.loadMore": "Load {step} more ({remaining} left)",
			"repo.skillProgress": "{done}/{total} skills",
			"repo.ready": "{count} importable skills found",
			"repo.truncated": "⚠ Repo too large, only partial skills shown (GitHub truncated)",
			"repo.empty": "No importable skills found.",
			"repo.selectVisible": "Select visible",
			"repo.selectAllN": "Select all {count}",
			"repo.clearAll": "Clear",
			"repo.import": "Import selected ({count})",
			"repo.importing": "Importing…",
			"repo.existing": "Existing",
			"repo.files": "{count} files · {size}",
			"repo.imported": "Imported {count}",
			"repo.skippedExisting": "Skipped existing {count}",
			"repo.replaced": "Replaced {count} disabled placeholder(s) — old dir moved to trash",
			"repo.failed": "Failed {count}",
			"repo.cancel": "Cancel",
			"repo.cancelled": "Cancelled · {imported}/{total} kept, temp files cleaned",
			"repo.importingCurrent": "Importing: {name} ({done}/{total})",
			"repo.root.self": "Repo root",
			"repo.root.skills": "Skills",
			"repo.root.designTemplates": "Templates",
			"repo.root.generic": "{root}"
		};
		// src/client/locales/mcp.ts
		/**
		* MCP 分类页的文案。工具名/命令等动态值走插值，不在这里。
		*
		* 状态词只用「已加载 / 启动中 / 启动失败 / 已禁用」：dsh 没有暴露 MCP 会话的
		* 连接状态，写「已连接」就是把不知道的事说成知道。
		*/
		const zhMcp = {
			"mcp.refresh": "刷新",
			"mcp.loading": "正在读取 MCP 服务器…",
			"mcp.summary": "{servers} 台服务器 · {tools} 个工具",
			"mcp.error": "读取 MCP 服务器失败：{error}",
			"mcp.noManager": "当前部署没有提供 dsh 的插件管理服务，只能查看，不能开关。",
			"mcp.empty": "这台 dsh 还没有配置 MCP 服务器。配置写在 {path} 里（每台服务器一行 @deepseek-ai/dsh-mcp-client）。",
			"mcp.emptyNoPath": "这台 dsh 还没有配置 MCP 服务器。",
			"mcp.transport.stdio": "stdio",
			"mcp.transport.http": "HTTP",
			"mcp.status.running": "已加载",
			"mcp.status.starting": "启动中",
			"mcp.status.failed": "启动失败",
			"mcp.status.disabled": "已禁用",
			"mcp.toolCount": "{count} 个工具",
			"mcp.readonly.management": "dsh 自己管理的插件，面板不能开关",
			"mcp.readonly.unaddressable": "这一行在补丁里没有 id，面板无法定位，因此不能开关",
			"mcp.readonly.noManager": "当前部署没有插件管理服务，这一页只能读",
			"mcp.readonly.badge": "只读",
			"mcp.detail.command": "命令",
			"mcp.detail.cwd": "工作目录",
			"mcp.detail.env": "环境变量",
			"mcp.detail.url": "地址",
			"mcp.detail.headers": "请求头",
			"mcp.detail.timeout": "调用超时",
			"mcp.detail.failFast": "启动失败即中止",
			"mcp.detail.patch": "补丁行",
			"mcp.detail.revealShow": "显示值",
			"mcp.detail.revealHide": "隐藏值",
			"mcp.tools": "工具",
			"mcp.noTools": "这个服务器当前没有注册工具（可能还没连上，或它不暴露工具）。",
			"mcp.toolParams": "参数：{params}",
			"mcp.orphan": "未归属的工具（{count}）",
			"mcp.orphanHint": "这些工具以 mcp__ 开头，但归属不到本页列出的服务器：常见原因是它来自 agent preset 里的服务器，或名字被截断/改写过。",
			"mcp.toggleApplied": "已生效。",
			"mcp.toggleRestart": "已保存，需要重启 dsh 才生效（{reason}）。",
			"mcp.toggleOverridden": "已保存，但被更高优先级的配置覆盖，当前状态没有变化。",
			"mcp.toggleFailed": "开关失败：{error}",
			"mcp.yes": "是",
			"mcp.no": "否",
			"mcp.restart.noHmr": "当前部署没有热重载",
			"mcp.restart.packageMoved": "插件的安装位置变了",
			"mcp.restart.hostModule": "改动落在运行中进程自身加载的模块上",
			"mcp.restart.unmanaged": "该插件在 Loader 之外运行",
			"mcp.restart.moduleComparison": "无法比较已加载模块与磁盘",
			"mcp.restart.unknown": "未知原因",
			"mcp.toggleCode.unaddressable": "这一行在补丁里没有 id，无法定位",
			"mcp.toggleCode.managementRequired": "dsh 自己管理的插件不能从这里开关",
			"mcp.toggleCode.unknownPlugin": "找不到这一行（列表可能已过期，刷新后再试）",
			"mcp.toggleFailedGeneric": "未知原因",
			"mcp.add": "新增服务器",
			"mcp.edit": "编辑",
			"mcp.delete": "删除",
			"mcp.editBlocked.unaddressable": "这一行在补丁里没有唯一 id，面板无法定位，不能编辑",
			"mcp.editBlocked.noEditor": "当前部署没有提供 dsh 的配置编辑服务，这一行只能开关",
			"mcp.editBlocked.invalidConfig": "这一行的配置被手工改成了面板无法安全重写的形状",
			"mcp.form.createTitle": "新增 MCP 服务器",
			"mcp.form.editTitle": "编辑 {name}",
			"mcp.form.name": "名称（serverName）",
			"mcp.form.nameHint": "决定工具名前缀 mcp__{name}__：字母、数字、下划线、连字符，最多 32 个字符。",
			"mcp.form.transport": "传输",
			"mcp.form.command": "命令",
			"mcp.form.args": "参数（每行一个）",
			"mcp.form.cwd": "工作目录",
			"mcp.form.env": "环境变量（每行 KEY=VALUE）",
			"mcp.form.url": "地址",
			"mcp.form.headers": "请求头（每行 KEY: VALUE）",
			"mcp.form.timeout": "调用超时（毫秒）",
			"mcp.form.failFast": "启动失败即中止",
			"mcp.form.maxInstruction": "服务说明上限（字节，留空用默认）",
			"mcp.form.invalidLine": "{field} 第 {line} 行缺少 {sep}",
			"mcp.form.save": "保存",
			"mcp.form.saving": "正在保存…",
			"mcp.field.required": "必填",
			"mcp.field.invalid": "格式不正确",
			"mcp.field.duplicate": "已经有同名的服务器",
			"mcp.field.range": "必须是正整数",
			"mcp.saveApplied": "已保存并生效。",
			"mcp.removeApplied": "已删除并生效。",
			"mcp.removeRestart": "已删除，重启 dsh 后生效（{reason}）。",
			"mcp.saveRestart": "已保存，需要重启 dsh 才生效（{reason}）。",
			"mcp.saveFailed": "保存失败：{error}",
			"mcp.removeFailed": "删除失败：{error}",
			"mcp.deleteConfirmTitle": "删除 MCP 服务器",
			"mcp.deleteConfirmText": "删除「{name}」后，它的工具会从模型可用的工具里消失。",
			"mcp.restart.loadPending": "Loader 还没应用这次改动",
			"mcp.managedBadge": "本页管理"
		};
		const enMcp = {
			"mcp.refresh": "Refresh",
			"mcp.loading": "Reading MCP servers…",
			"mcp.summary": "{servers} servers · {tools} tools",
			"mcp.error": "Failed to read MCP servers: {error}",
			"mcp.noManager": "This deployment has no dsh plugin manager, so servers can be inspected but not toggled.",
			"mcp.empty": "No MCP server is configured on this dsh yet. Servers live in {path}, one @deepseek-ai/dsh-mcp-client row each.",
			"mcp.emptyNoPath": "No MCP server is configured on this dsh yet.",
			"mcp.transport.stdio": "stdio",
			"mcp.transport.http": "HTTP",
			"mcp.status.running": "Loaded",
			"mcp.status.starting": "Starting",
			"mcp.status.failed": "Failed",
			"mcp.status.disabled": "Disabled",
			"mcp.toolCount": "{count} tools",
			"mcp.readonly.management": "Managed by dsh itself; the panel cannot toggle it",
			"mcp.readonly.unaddressable": "This row has no id in the patch, so the panel cannot address it",
			"mcp.readonly.noManager": "This deployment has no plugin manager; the page is read-only",
			"mcp.readonly.badge": "read-only",
			"mcp.detail.command": "Command",
			"mcp.detail.cwd": "Working directory",
			"mcp.detail.env": "Environment",
			"mcp.detail.url": "URL",
			"mcp.detail.headers": "Headers",
			"mcp.detail.timeout": "Call timeout",
			"mcp.detail.failFast": "Abort on startup failure",
			"mcp.detail.patch": "Patch row",
			"mcp.detail.revealShow": "Show values",
			"mcp.detail.revealHide": "Hide values",
			"mcp.tools": "Tools",
			"mcp.noTools": "This server registers no tools right now (not connected yet, or it exposes none).",
			"mcp.toolParams": "Params: {params}",
			"mcp.orphan": "Unattributed tools ({count})",
			"mcp.orphanHint": "These tools start with mcp__ but own no server listed here — usually because they belong to a server inside an agent preset, or their names were truncated or rewritten.",
			"mcp.toggleApplied": "Applied.",
			"mcp.toggleRestart": "Saved; restart dsh to apply it ({reason}).",
			"mcp.toggleOverridden": "Saved, but a higher-priority setting overrides it; nothing changed at runtime.",
			"mcp.toggleFailed": "Toggle failed: {error}",
			"mcp.yes": "Yes",
			"mcp.no": "No",
			"mcp.restart.noHmr": "this deployment has no hot reload",
			"mcp.restart.packageMoved": "the package moved",
			"mcp.restart.hostModule": "the change touches a module the running process loads",
			"mcp.restart.unmanaged": "the plugin runs outside a Loader entry",
			"mcp.restart.moduleComparison": "loaded modules cannot be compared with disk",
			"mcp.restart.unknown": "unknown reason",
			"mcp.toggleCode.unaddressable": "this row has no id in the patch, so it cannot be located",
			"mcp.toggleCode.managementRequired": "dsh manages this plugin itself",
			"mcp.toggleCode.unknownPlugin": "that row no longer exists (the list may be stale — refresh)",
			"mcp.toggleFailedGeneric": "unknown reason",
			"mcp.add": "Add server",
			"mcp.edit": "Edit",
			"mcp.delete": "Delete",
			"mcp.editBlocked.unaddressable": "This row has no unique id in the patch, so the panel cannot locate it",
			"mcp.editBlocked.noEditor": "This deployment has no dsh config editor, so this row can only be toggled",
			"mcp.editBlocked.invalidConfig": "This row was hand-edited into a shape the panel cannot rewrite safely",
			"mcp.form.createTitle": "Add MCP server",
			"mcp.form.editTitle": "Edit {name}",
			"mcp.form.name": "Name (serverName)",
			"mcp.form.nameHint": "Sets the tool-name prefix mcp__{name}__: letters, digits, underscores and hyphens, at most 32 characters.",
			"mcp.form.transport": "Transport",
			"mcp.form.command": "Command",
			"mcp.form.args": "Arguments (one per line)",
			"mcp.form.cwd": "Working directory",
			"mcp.form.env": "Environment (KEY=VALUE per line)",
			"mcp.form.url": "URL",
			"mcp.form.headers": "Headers (KEY: VALUE per line)",
			"mcp.form.timeout": "Call timeout (ms)",
			"mcp.form.failFast": "Abort on startup failure",
			"mcp.form.maxInstruction": "Instructions limit (bytes; blank uses the default)",
			"mcp.form.invalidLine": "{field} line {line} has no {sep}",
			"mcp.form.save": "Save",
			"mcp.form.saving": "Saving…",
			"mcp.field.required": "Required",
			"mcp.field.invalid": "Invalid",
			"mcp.field.duplicate": "A server with this name already exists",
			"mcp.field.range": "Must be a positive integer",
			"mcp.saveApplied": "Saved and applied.",
			"mcp.removeApplied": "Removed and applied.",
			"mcp.removeRestart": "Removed; restart dsh to apply it ({reason}).",
			"mcp.saveRestart": "Saved; restart dsh to apply it ({reason}).",
			"mcp.saveFailed": "Save failed: {error}",
			"mcp.removeFailed": "Delete failed: {error}",
			"mcp.deleteConfirmTitle": "Delete MCP server",
			"mcp.deleteConfirmText": "Deleting \"{name}\" removes its tools from what the model can call.",
			"mcp.restart.loadPending": "the Loader has not applied the change yet",
			"mcp.managedBadge": "Managed here"
		};
		// src/client/locales/settings.ts
		/** 设置卡。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhSettings = {
			"settings.title": "自定义指令管理器",
			"settings.description": "管理 AGENTS.md 指令文件与本地技能目录：浏览、编辑、来源同步与新建。",
			"settings.enabled": "启用插件",
			"settings.enabledHint": "关闭后本插件的路由与入口全部下线。",
			"settings.dotModelColor": "模型可调圆点颜色",
			"settings.dotModelColorHint": "技能行/聊天 / 菜单中「模型可调」蓝色圆点的颜色（#rrggbb）。",
			"settings.dotUserColor": "用户可调圆点颜色",
			"settings.dotUserColorHint": "技能行/聊天 / 菜单中「仅用户可调」绿色圆点的颜色（#rrggbb）。",
			"settings.showUseCount": "显示调用次数",
			"settings.showUseCountHint": "在技能名旁显示琥珀色调用次数。",
			"settings.showUseTime": "显示最近调用时间",
			"settings.showUseTimeHint": "在技能名行右侧显示相对时间（如「3 天前」）。",
			"settings.showGroupSummary": "显示分组汇总",
			"settings.showGroupSummaryHint": "在分组标题后汇总调用次数与最近调用时间。",
			"settings.statsWindowDays": "统计窗口（天）",
			"settings.statsWindowDaysHint": "只统计最近 N 天的使用次数，默认 14 天；0 = 全部历史。改动立即生效。",
			"settings.statsScanMinutes": "自动统计间隔（分钟）",
			"settings.statsScanMinutesHint": "后台扫描会话日志的间隔，最小 1 分钟；扫描耗时会自动拉长间隔。",
			"settings.githubToken": "GitHub Token",
			"settings.githubTokenHint": "市场/来源走 GitHub API，匿名每小时 60 次，填 token 后 5000 次。细粒度 token 无需任何权限。明文存本地设置，仅经 dsh 的 /api 信任栅栏可读（回环 / 绑定地址 / --trusted-host）；留空即匿名（或跟随 GITHUB_TOKEN 环境变量）。",
			"settings.githubTokenPlaceholder": "ghp_… / github_pat_…（留空为匿名）",
			"settings.inherit": "继承",
			"settings.overridden": "已覆盖",
			"settings.reset": "恢复默认",
			"settings.unsaved": "未保存",
			"settings.save": "保存",
			"settings.saving": "保存中…",
			"settings.discard": "放弃修改",
			"settings.saveFailed": "本部署没有接受这些值，已保留供你修改。",
			"settings.readOnly": "本部署的设置为只读。",
			"settings.notExposed": "本部署没有挂载该设置命名空间。",
			"settings.collapse": "收起设置",
			"settings.expand": "展开设置"
		};
		const enSettings = {
			"settings.title": "Custom Instruction Manager",
			"settings.description": "Manage AGENTS.md instruction files and the local skill catalog: browse, edit, sync, and scaffold.",
			"settings.enabled": "Enable plugin",
			"settings.enabledHint": "Disables this plugin’s routes and entries.",
			"settings.dotModelColor": "Model-invocable dot color",
			"settings.dotModelColorHint": "Color of the blue \"model-callable\" dot in the skill panel and the chat / menu (#rrggbb).",
			"settings.dotUserColor": "User-invocable dot color",
			"settings.dotUserColorHint": "Color of the green \"user-only\" dot in the skill panel and the chat / menu (#rrggbb).",
			"settings.showUseCount": "Show invocation count",
			"settings.showUseCountHint": "Show the amber invocation count beside each skill name.",
			"settings.showUseTime": "Show last-used time",
			"settings.showUseTimeHint": "Show relative last-used time on the name row (e.g. \"3 d ago\").",
			"settings.showGroupSummary": "Show group summaries",
			"settings.showGroupSummaryHint": "Summarize invocation count and last-used time after group titles.",
			"settings.statsWindowDays": "Stats window (days)",
			"settings.statsWindowDaysHint": "Count only usage within the last N days (default 14); 0 = full history. Changes apply immediately.",
			"settings.statsScanMinutes": "Auto stats interval (minutes)",
			"settings.statsScanMinutesHint": "How often the background session-log scan runs (min 1); heavy scans automatically stretch it.",
			"settings.githubToken": "GitHub token",
			"settings.githubTokenHint": "Market/sources use the GitHub API: 60 req/h anonymous, 5000/hr with a token. A fine-grained token needs no permissions. Stored plaintext in local settings, reachable only through dsh's /api trust fence (loopback / bind address / --trusted-host); empty means anonymous (or GITHUB_TOKEN env).",
			"settings.githubTokenPlaceholder": "ghp_… / github_pat_… (empty = anonymous)",
			"settings.inherit": "Inherit",
			"settings.overridden": "Overridden",
			"settings.reset": "Reset to default",
			"settings.unsaved": "Unsaved",
			"settings.save": "Save",
			"settings.saving": "Saving…",
			"settings.discard": "Discard",
			"settings.saveFailed": "The deployment did not accept these values; they were left for you to correct.",
			"settings.readOnly": "This deployment stores settings read-only.",
			"settings.notExposed": "This deployment does not expose the settings namespace.",
			"settings.collapse": "Hide settings",
			"settings.expand": "Show settings"
		};
		// src/client/locales/skills.ts
		/** 技能浏览：行徽章/分组/过滤排序/相对时间。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhSkills = {
			"groups.collapseAll": "全部折叠",
			"groups.expandAll": "全部展开",
			"groups.noCollections": "暂无来源组。从市场导入技能后自动按来源聚合。",
			"groups.personal": "用户级",
			"groups.project": "项目级",
			"groups.managedBy": "管理方",
			"groups.subdivide": "细分",
			"groups.merge": "合并",
			"filter.allSources": "全部来源",
			"filter.title": "筛选",
			"filter.source": "来源",
			"filter.invocation": "调用方式",
			"filter.clear": "清除筛选",
			"filter.private": "个人",
			"sort.name": "按名称",
			"sort.added": "按添加时间",
			"sort.uses": "按调用次数",
			"time.justNow": "刚刚",
			"time.minutesAgo": "{value} 分钟前",
			"time.hoursAgo": "{value} 小时前",
			"time.daysAgo": "{value} 天前",
			"time.weeksAgo": "{value} 周前",
			"badge.source.project-dsh": "项目 .dsh",
			"badge.source.project-agents": "项目 .agents",
			"badge.source.custom": "自定义",
			"badge.source.runtime": "运行时",
			"badge.source.user-dsh": "用户 .dsh",
			"badge.source.user-agents": "用户 .agents",
			"badge.source.bundled": "内置",
			"row.readonly": "只读",
			"row.delete": "删除",
			"row.reveal": "在 Finder 中显示",
			"row.revealUnavailable": "内置技能位于应用包内，无法在 Finder 中显示",
			"row.menu": "{name} 的更多操作",
			"row.open": "查看 {name} 详情（回车）",
			"row.duplicate": "重名",
			"row.duplicateHint": "同名技能存在多个来源，当前显示为优先级最高的版本",
			"filter.invocationAll": "全部调用",
			"filter.modelOnly": "模型可调",
			"filter.userOnly": "用户可调",
			"filter.showing": "显示 {shown}/{total}{filtered}",
			"filter.filteredSuffix": " · 已筛选",
			"filter.shortened": "短描述 {count} 条，悬浮看全文"
		};
		const enSkills = {
			"groups.collapseAll": "Collapse all",
			"groups.expandAll": "Expand all",
			"groups.noCollections": "No source groups yet. Import skills from the market to group them by source.",
			"groups.personal": "User-level",
			"groups.project": "Project",
			"groups.managedBy": "Managed by",
			"groups.subdivide": "Split",
			"groups.merge": "Merge",
			"filter.allSources": "All sources",
			"filter.title": "Filter",
			"filter.source": "Source",
			"filter.invocation": "Invocation",
			"filter.clear": "Clear filters",
			"filter.private": "Personal",
			"sort.name": "By name",
			"sort.added": "By added",
			"sort.uses": "By uses",
			"time.justNow": "just now",
			"time.minutesAgo": "{value} min ago",
			"time.hoursAgo": "{value} h ago",
			"time.daysAgo": "{value} d ago",
			"time.weeksAgo": "{value} w ago",
			"badge.source.project-dsh": "project .dsh",
			"badge.source.project-agents": "project .agents",
			"badge.source.custom": "custom",
			"badge.source.runtime": "runtime",
			"badge.source.user-dsh": "user .dsh",
			"badge.source.user-agents": "user .agents",
			"badge.source.bundled": "bundled",
			"row.readonly": "read-only",
			"row.delete": "Delete",
			"row.reveal": "Show in Finder",
			"row.revealUnavailable": "Bundled skills live inside the application bundle and cannot be revealed",
			"row.menu": "More actions for {name}",
			"row.open": "View {name} details (Enter)",
			"row.duplicate": "duplicate",
			"row.duplicateHint": "Multiple sources provide this name; the highest-priority one is shown",
			"filter.invocationAll": "All",
			"filter.modelOnly": "Model",
			"filter.userOnly": "User",
			"filter.showing": "Showing {shown}/{total}{filtered}",
			"filter.filteredSuffix": " · filtered",
			"filter.shortened": "{count} short descriptions, hover for full text"
		};
		// src/client/locales/sources.ts
		/** 来源跟踪与回收站（含删除确认）。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhSources = {
			"delete.confirmTitle": "删除技能？",
			"delete.confirmText": "确定把「{name}」移入废纸篓吗？文件会移到 ~/.Trash（重名时追加时间戳），可在 Finder 中恢复。",
			"delete.confirm": "移入废纸篓",
			"source.commit": "已同步版本",
			"source.unverified": "尚未核对上游",
			"source.check": "检查更新",
			"source.checkHint": "点击检查上游更新",
			"source.checking": "检查中…",
			"source.upToDate": "已是最新",
			"source.updated": "有更新 {count} 个",
			"source.deleted": "上游已删除 {count} 个",
			"source.error": "检查失败",
			"source.throttled": "刚刚检查过",
			"source.sync": "同步",
			"source.syncing": "同步中…",
			"source.syncConfirmTitle": "同步技能？",
			"source.syncConfirmText": "将用上游最新版本覆盖本地对以下技能的所有修改：",
			"source.followDelete": "跟进删除",
			"source.deleteConfirmTitle": "跟进上游删除？",
			"source.deleteConfirmText": "以下技能已从上游仓库移除，本地目录将移入回收站（可恢复）：",
			"source.trash": "回收站",
			"source.restore": "恢复",
			"source.clearTrash": "清空回收站",
			"source.clearTrashConfirmTitle": "清空回收站？",
			"source.clearTrashConfirmText": "回收站里的技能会被永久删除，无法恢复。此操作不可撤销。",
			"source.clearTrashConfirm": "永久删除"
		};
		const enSources = {
			"delete.confirmTitle": "Delete skill?",
			"delete.confirmText": "Move \"{name}\" to the Trash? Its files go to ~/.Trash (a timestamp is appended on a name clash) and stay restorable in Finder.",
			"delete.confirm": "Move to Trash",
			"source.commit": "Synced commit",
			"source.unverified": "upstream not verified yet",
			"source.check": "Check for updates",
			"source.checkHint": "Click to check the upstream for updates",
			"source.checking": "Checking…",
			"source.upToDate": "Up to date",
			"source.updated": "{count} updates",
			"source.deleted": "{count} deleted upstream",
			"source.error": "Check failed",
			"source.throttled": "Checked recently",
			"source.sync": "Sync",
			"source.syncing": "Syncing…",
			"source.syncConfirmTitle": "Sync skills?",
			"source.syncConfirmText": "This overwrites local changes to these skills with the latest upstream version:",
			"source.followDelete": "Follow deletion",
			"source.deleteConfirmTitle": "Follow upstream deletion?",
			"source.deleteConfirmText": "These skills were removed upstream; their local directories move to trash (restorable):",
			"source.trash": "Trash",
			"source.restore": "Restore",
			"source.clearTrash": "Empty trash",
			"source.clearTrashConfirmTitle": "Empty the trash?",
			"source.clearTrashConfirmText": "Skills in the trash will be permanently deleted and cannot be restored.",
			"source.clearTrashConfirm": "Delete permanently"
		};
		// src/client/locales/tokens.ts
		/** Token 统计表（详情页）。从 locales.ts 按前缀拆出，键集合与文件无关。 */
		const zhTokens = {
			"tokens.title": "Token 统计",
			"tokens.model": "模型",
			"tokens.tokens": "Tokens",
			"tokens.manage": "管理模型",
			"tokens.none": "未选择模型",
			"tokens.downloaded": "已下载",
			"tokens.sizeMb": "{mb} MB · 未下载",
			"tokens.downloading": "下载中…",
			"tokens.removing": "删除中…",
			"tokens.loadingModels": "读取模型列表…"
		};
		const enTokens = {
			"tokens.title": "Token counts",
			"tokens.model": "Model",
			"tokens.tokens": "Tokens",
			"tokens.manage": "Manage models",
			"tokens.none": "No model selected",
			"tokens.downloaded": "Downloaded",
			"tokens.sizeMb": "{mb} MB · not downloaded",
			"tokens.downloading": "Downloading…",
			"tokens.removing": "Removing…",
			"tokens.loadingModels": "Loading models…"
		};
		// src/client/locales.ts
		/**
		*  locales 按视图拆分后的聚合入口：各域字典在 ./locales/<domain>.ts，
		*  这里合并为面板消费的 zh/en。老 `from './locales.ts'` 写法保持可用，
		*  HubKey 的完备性仍由 `en: Record<HubKey, string>` 在类型层兜底
		*  （缺键即编译报错）。
		*/
		const zh = {
			...zhCommon,
			...zhSkills,
			...zhMarket,
			...zhMcp,
			...zhSources,
			...zhDetail,
			...zhSettings,
			...zhTokens
		};
		const en = {
			...enCommon,
			...enSkills,
			...enMarket,
			...enMcp,
			...enSources,
			...enDetail,
			...enSettings,
			...enTokens
		};
		/** Interpolate a {name} template with the given values. */
		function t(dict, key, values) {
			let text = dict[key] ?? key;
			if (values !== void 0) for (const [name, value] of Object.entries(values)) text = text.replaceAll("{" + name + "}", String(value));
			return text;
		}
		// src/client/icons.tsx
		/** ic_ds_chevron_down_outline_14 */
		function IconChevronDownOutline14({ size = 14, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 14 14",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
					fill: "currentColor"
				})
			});
		}
		/** ic_ds_trash_outline_16 */
		function IconTrashOutline16({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z",
					fill: "currentColor"
				})
			});
		}
		/** ic_ds_skill_outline_16 */
		function IconSkillOutline16({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M12.5113 15.4067C12.4395 15.6249 12.1308 15.6249 12.059 15.4067L11.643 14.1416C11.454 13.567 11.0033 13.1164 10.4288 12.9274L9.16369 12.5113C8.94544 12.4395 8.94544 12.1308 9.16369 12.059L10.4288 11.643C11.0033 11.454 11.454 11.0033 11.643 10.4288L12.059 9.16369C12.1308 8.94544 12.4395 8.94544 12.5113 9.16369L12.9274 10.4288C13.1164 11.0033 13.567 11.454 14.1416 11.643L15.4067 12.059C15.6249 12.1308 15.6249 12.4395 15.4067 12.5113L14.1416 12.9274C13.567 13.1164 13.1164 13.567 12.9274 14.1416L12.5113 15.4067Z",
					fill: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M9.02246 0.546878C9.9822 0.546878 10.7564 0.545403 11.374 0.612307C12.0042 0.680586 12.5515 0.826244 13.0273 1.17188C13.3052 1.37376 13.5501 1.61868 13.752 1.89649C14.0975 2.37225 14.2432 2.91984 14.3115 3.54981C14.3784 4.16727 14.377 4.94206 14.377 5.90137V8.51367C13.9611 8.29533 13.5071 8.13985 13.0273 8.06055V5.90137C13.0273 4.9121 13.0259 4.22322 12.9688 3.69532C12.9129 3.18044 12.8098 2.89782 12.6592 2.69043C12.5406 2.52724 12.3966 2.38326 12.2334 2.26465C12.026 2.11404 11.7437 2.0109 11.2285 1.95508C10.7005 1.89789 10.0122 1.89649 9.02246 1.89649H6.55371C5.56395 1.89649 4.87569 1.89787 4.34766 1.95508C3.83242 2.01092 3.55022 2.11398 3.34278 2.26465C3.17953 2.38329 3.03564 2.52719 2.91699 2.69043C2.76642 2.89782 2.66325 3.18042 2.60742 3.69532C2.55027 4.22322 2.54883 4.9121 2.54883 5.90137V10.0986C2.54883 11.0878 2.55031 11.7768 2.60742 12.3047C2.66326 12.8196 2.76642 13.1032 2.91699 13.3105C3.03558 13.4736 3.17966 13.6178 3.34278 13.7363C3.5502 13.8869 3.83265 13.9901 4.34766 14.0459C4.87568 14.1031 5.56398 14.1035 6.55371 14.1035H8.08399C8.27443 14.6025 8.55077 15.0585 8.89551 15.4541H6.55371C5.59402 15.4541 4.81976 15.4546 4.20215 15.3877C3.57204 15.3194 3.02468 15.1738 2.54883 14.8281C2.27111 14.6263 2.02606 14.3813 1.82422 14.1035C1.47883 13.6278 1.33293 13.08 1.26465 12.4502C1.19783 11.8327 1.19922 11.0579 1.19922 10.0986V5.90137C1.19922 4.94206 1.1978 4.16727 1.26465 3.54981C1.33295 2.91984 1.47867 2.37225 1.82422 1.89649C2.02613 1.61864 2.27098 1.37379 2.54883 1.17188C3.02472 0.826181 3.57197 0.6806 4.20215 0.612307C4.81976 0.545393 5.594 0.546877 6.55371 0.546878H9.02246ZM9.19629 9.14649H4.5459V7.84571H9.19629V9.14649ZM11.0303 6.10645H4.5459V4.80567H11.0303V6.10645Z",
					fill: "currentColor"
				})]
			});
		}
		/** ic_ds_ellipsis_outline_16 — 行操作菜单的「…」触发器（fill-only，与 dsh 一致）。 */
		function IconEllipsisOutline16({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M3 9C3.55228 9 4 8.55228 4 8C4 7.44772 3.55228 7 3 7C2.44772 7 2 7.44772 2 8C2 8.55228 2.44772 9 3 9Z",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M8 9C8.55228 9 9 8.55228 9 8C9 7.44772 8.55228 7 8 7C7.44772 7 7 7.44772 7 8C7 8.55228 7.44772 9 8 9Z",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M13 9C13.5523 9 14 8.55228 14 8C14 7.44772 13.5523 7 13 7C12.4477 7 12 7.44772 12 8C12 8.55228 12.4477 9 13 9Z",
						fill: "currentColor"
					})
				]
			});
		}
		/** ic_ds_folder_close_outline_16 — 菜单里的「在 Finder 中显示」。 */
		function IconFolderCloseOutline16({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				strokeWidth: 1,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z",
					stroke: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.63501 7.66614H12.3647",
					stroke: "currentColor"
				})]
			});
		}
		// src/client/grouping.ts
		/**
		* 技能是否有真实磁盘文件（用户根 / 项目根）。bundled 与第三方 provider
		* 注册的技能只存在于应用包或 provider 内存里，Finder 打不开。
		*/
		function isFileSource(source) {
			return source === "user-dsh" || source === "user-agents" || isProjectSource(source);
		}
		/**
		* Stable React key for one catalog row.
		*
		* A skill NAME is not unique in the catalog: the host keys project skills by
		* `<name>+<workspace>+<source>` on purpose, so the same name may legitimately
		* appear twice (two workspaces owning a skill of that name, or the same name
		* coming from different roots/providers). Keying rows by name alone collides
		* inside one list, and React then mis-reconciles the list: switching the
		* 平铺/分组 view leaves the stale rows in the DOM and they pile up on every
		* further switch. The identity below matches the host's logical key.
		*/
		function skillRowKey(skill) {
			return "skill\0" + skill.source + "\0" + (skill.workspace ?? "") + "\0" + skill.name;
		}
		/** Origin-repo filter value: skills with no source record (private skills). */
		const PRIVATE_SOURCE = "private";
		/**
		* Apply the origin filter ('all' or a specific origin repo; skills without a
		* source record count as PRIVATE_SOURCE). The origins map is the store's
		* skillName → repo derivation, so filtering follows the tracked source
		* records instead of the filesystem root a skill happens to live under.
		* 项目级技能（有 workspace 归属）永远不算「个人」。
		*/
		function filterBySource(skills, source, origins) {
			if (source === "all") return [...skills];
			return skills.filter((skill) => {
				if (isProjectSource(skill.source)) return false;
				return (origins[skill.name] ?? "private") === source;
			});
		}
		/** Derive the user-facing 管理方 for one skill (origin repo wins). */
		function managedByOf(skill, origin) {
			if (origin !== void 0 && origin !== "") return {
				kind: "repo",
				repo: origin
			};
			if (skill.source === "user-dsh" || skill.source === "user-agents") return { kind: "user" };
			if (isProjectSource(skill.source)) return { kind: "project" };
			return {
				kind: "provider",
				provider: skill.provider
			};
		}
		/** Stable bucket key for a managed-by value (collapsed-state state). */
		function managedKey(managed) {
			switch (managed.kind) {
				case "repo": return "repo:" + managed.repo;
				case "provider": return "provider:" + managed.provider;
				default: return managed.kind;
			}
		}
		/**
		* Group the personal (untracked, non-project) skills by 管理方 — user-owned
		* skills collapse into one "User Managed" bucket instead of the misleading
		* `skill-hub` provider id; bundled / third-party providers keep their id.
		*
		* Bucket order follows first appearance in the incoming (already sorted)
		* list, so the chosen sort key still decides the subgroup order.
		*/
		function personalManagedBuckets(skills) {
			const buckets = [];
			const byKey = /* @__PURE__ */ new Map();
			for (const skill of skills) {
				const managed = managedByOf(skill);
				const key = "managed:" + managedKey(managed);
				let bucket = byKey.get(key);
				if (bucket === void 0) {
					bucket = {
						key,
						managed,
						skills: []
					};
					byKey.set(key, bucket);
					buckets.push(bucket);
				}
				bucket.skills.push(skill);
			}
			return buckets;
		}
		/**
		* Match origin collections against the currently visible skills, dropping
		* collections with no visible member. Without this, a stale origin (skill
		* deleted on disk) renders a group header with zero rows — an empty shell the
		* sources tab otherwise never shows (project/personal groups already
		* disappear when they have nothing to display).
		*/
		function visibleCollections(collections, visibleSkills) {
			const visible = [];
			for (const collection of collections) {
				const skills = visibleSkills.filter((skill) => collection.skillNames.includes(skill.name));
				if (skills.length > 0) visible.push({
					collection,
					skills
				});
			}
			return visible;
		}
		/**
		* Sort a skill list in place-safe copy order: name ascending, added
		* descending (newest first, unknown addedAt last), or uses descending
		* (most-called first). Unknown values always trail.
		*/
		function sortSkills(skills, key, getUses) {
			const list = [...skills];
			if (key === "name") list.sort((a, b) => a.name.localeCompare(b.name));
			else if (key === "added") list.sort((a, b) => (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity));
			else if (key === "uses") list.sort((a, b) => (getUses?.(b.name) ?? 0) - (getUses?.(a.name) ?? 0));
			return list;
		}
		/**
		* Rank one workspace path in the dsh sidebar (registry) order.
		* Unknown paths — including the cwd-scoped pseudo workspace and project skills
		* whose workspace is unset — trail every known one, so a partially known order
		* still renders deterministically.
		*/
		function workspaceRank(path, order) {
			if (path === void 0) return order.length;
			const index = order.indexOf(path);
			return index === -1 ? order.length : index;
		}
		/** Format an epoch-ms timestamp as a short relative time bucket. */
		function formatRelativeTime(ms, now = Date.now()) {
			const diff = Math.max(0, now - ms);
			const minutes = Math.floor(diff / 6e4);
			if (minutes < 1) return { key: "time.justNow" };
			if (minutes < 60) return {
				key: "time.minutesAgo",
				value: minutes
			};
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return {
				key: "time.hoursAgo",
				value: hours
			};
			const days = Math.floor(hours / 24);
			if (days < 7) return {
				key: "time.daysAgo",
				value: days
			};
			return {
				key: "time.weeksAgo",
				value: Math.floor(days / 7)
			};
		}
		// src/client/helpers.ts
		/**
		* Shared panel helpers: the active-dictionary pick (document-language
		* based, family precedent) plus a small error-message extractor.
		*/
		/**
		* Locale the panel renders in: the DSH UI language, taken from
		* `documentElement.lang` (dsh sets it from its own language matching), never
		* from the browser/Electron default. Needed because the desktop app starts
		* its renderer with `--lang=en-US` — packaged builds ship no `.lproj`, so
		* Chromium falls back to English — while the UI text itself is Chinese.
		* An unqualified `toLocaleString()` would therefore print US dates next to
		* Chinese labels; every panel-side date goes through this instead.
		*
		* Tags outside the two shipped dictionaries fall back to `zh`, exactly like
		* the dictionary, so text and dates can never disagree.
		*/
		function panelLocale() {
			return (typeof document !== "undefined" ? document.documentElement.lang : "zh").toLowerCase().startsWith("en") ? "en" : "zh";
		}
		/** Active dictionary, picked by the document language at call time. */
		let cachedDictionaryLang = "";
		let cachedDictionary = null;
		function dictionary() {
			const key = panelLocale();
			if (cachedDictionary === null || cachedDictionaryLang !== key) {
				cachedDictionaryLang = key;
				cachedDictionary = key === "en" ? { ...en } : { ...zh };
			}
			return cachedDictionary;
		}
		/** Translate a key with optional {name} template params (current language). */
		function tt(key, values) {
			return t(dictionary(), key, values);
		}
		/** User-facing label for one managed-by value. */
		function managedByText(managed) {
			switch (managed.kind) {
				case "repo": return managed.repo;
				case "user": return tt("managed.user");
				case "project": return tt("managed.project");
				case "provider": return managed.provider;
			}
		}
		/** Human-readable error text from an unknown thrown value. */
		function errorMessage(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		/**
		* Whether a displayName is worth showing beside the kebab-case name.
		* Pure case/punctuation variants (e.g. "Code Review" vs "code-review") are redundant.
		*/
		function isDisplayNameDistinct(name, displayName) {
			if (displayName === void 0) return false;
			const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
			return normalize(displayName) !== normalize(name);
		}
		/**
		* Copy text to the clipboard. Uses the async API with a positioned-textarea
		* fallback for insecure contexts. Resolves true only when the copy succeeded.
		*/
		async function copyTextToClipboard(text) {
			if (navigator.clipboard?.writeText !== void 0) try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch {}
			try {
				const ta = document.createElement("textarea");
				ta.value = text;
				ta.setAttribute("readonly", "");
				ta.style.position = "fixed";
				ta.style.top = "0";
				ta.style.opacity = "0";
				document.body.appendChild(ta);
				ta.select();
				const ok = document.execCommand("copy");
				ta.remove();
				return ok;
			} catch {
				return false;
			}
		}
		// src/client/panel/format.ts
		/** Model-invocable dot color default. Single source for the TS side; the
		*  panel's CSS mirrors it via --hub-model (panel.module.css). */
		const DEFAULT_DOT_MODEL_COLOR = "#2f81f7";
		/** User-invocable dot color default. Single source for the TS side; the
		*  panel's CSS mirrors it via --hub-user (panel.module.css). */
		const DEFAULT_DOT_USER_COLOR = "#3fb950";
		/** Dot inline style from the user-chosen color (undefined keeps the CSS default). */
		function dotStyle(color) {
			if (color === void 0) return void 0;
			return {
				background: color,
				borderColor: color
			};
		}
		/** Localized relative-time text for a Unix-ms timestamp. */
		function relativeTimeText(ms) {
			const rt = formatRelativeTime(ms);
			return tt(rt.key, rt.value !== void 0 ? { value: rt.value } : void 0);
		}
		/**
		* Absolute time for the detail meta, formatted in the panel's language
		* ("2026/08/10 20:16:51" / "Aug 10, 2026, 8:16:51 PM"). The locale comes
		* from DSH's UI language, not from `Intl`'s default, which the desktop app
		* pins to en-US via `--lang` (see `panelLocale`).
		*
		* Chinese uses an explicit YYYY/MM/DD HH:mm:ss pattern: ICU's own zh
		* `dateStyle` renders "2026年8月10日 20:16:51", which is noisier than this
		* panel's metadata lines need and was explicitly not wanted.
		*/
		function dateFormatter(locale) {
			if (locale === "zh") return new Intl.DateTimeFormat("zh", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hourCycle: "h23"
			});
			return new Intl.DateTimeFormat("en", {
				dateStyle: "medium",
				timeStyle: "medium"
			});
		}
		let cachedDateFormatter;
		let cachedDateLocale = "";
		function formatDateTime(ms) {
			const locale = panelLocale();
			if (cachedDateFormatter === void 0 || cachedDateLocale !== locale) {
				cachedDateFormatter = dateFormatter(locale);
				cachedDateLocale = locale;
			}
			return cachedDateFormatter.format(new Date(ms));
		}
		/** Short form of a commit SHA for display. */
		function shortSha(sha) {
			return sha.length > 7 ? sha.slice(0, 7) : sha;
		}
		/**
		* Human byte size for file metadata ("824 B" / "1.2 KB" / "3.4 MB"). One
		* decimal under 10 units so small instruction files stay readable, no decimal
		* once the number is large enough that it adds noise.
		*/
		function formatBytes$1(bytes) {
			if (!Number.isFinite(bytes) || bytes < 0) return "—";
			if (bytes < 1024) return Math.round(bytes) + " B";
			const units = [
				"KB",
				"MB",
				"GB"
			];
			let value = bytes / 1024;
			let unit = 0;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return (value >= 10 ? value.toFixed(0) : value.toFixed(1)) + " " + units[unit];
		}
		// src/client/slash-dots.tsx
		/** The core plugin's skill source identity on the '/' trigger. */
		const SKILL_SOURCE = {
			trigger: "/",
			name: "skill"
		};
		/** How long one catalog-derived modelInvocable map stays hot before refresh. */
		const MODEL_TTL_MS = 6e4;
		/**
		* Find the core `/skill` source through the runtime registry, or undefined.
		* The lookup never throws: a missing/reshaped registry just means no dots. Exported
		* for unit tests; the apply path only calls it indirectly through setupSkillSlashDots.
		* @param service - the ctx.inputTriggers service face.
		* @returns the registered skill source, or undefined.
		*/
		function findSkillSource(service) {
			const live = service.live;
			if (live?.sources === void 0) return void 0;
			return live.sources.find((source) => source.trigger === SKILL_SOURCE.trigger && source.name === SKILL_SOURCE.name);
		}
		/** One catalog-derived name → modelInvocable snapshot with a load timestamp. */
		let modelCache;
		/**
		* Clear the modelInvocable cache. Called on connection/reset so a fresh
		* catalog wins after reconnect; exported for deterministic unit tests.
		*/
		function resetModelCache() {
			modelCache = void 0;
		}
		/**
		* Resolve name → modelInvocable from the hub's catalog, cached for
		* MODEL_TTL_MS. A failed load caches the failure briefly so a downed route
		* doesn't hammer the host on every keystroke; the returned map is empty then
		* (callers fall back to the model dot for unknown names).
		* @param api - the hub browser API.
		* @returns name → whether the model may call the skill.
		*/
		async function modelInvocableMap(api) {
			const now = Date.now();
			const cached = modelCache;
			if (cached !== void 0 && now - cached.at < MODEL_TTL_MS) return "failed" in cached ? /* @__PURE__ */ new Map() : cached.map;
			try {
				const catalog = await api.catalog();
				const map = new Map(catalog.skills.map((skill) => [skill.name, skill.invocation.modelInvocable]));
				modelCache = {
					at: now,
					map
				};
				return map;
			} catch (error) {
				console.error("[dsh-skill-hub] slash dot color lookup failed:", error);
				modelCache = {
					at: now,
					failed: true
				};
				return /* @__PURE__ */ new Map();
			}
		}
		/**
		* 通过直接操作已渲染的 `[role="option"]` 列表注入彩色点，
		* 绕过 MenuView 对 `icon` 的枚举限制。
		* @param modelByName - 技能名 → 模型可调用性；不在表内的候选不注点。
		* @param modelColor - 模型可调用技能的点色。
		* @param userColor - 仅用户可调用技能的点色。
		*/
		function injectDotsViaDOM(modelByName, modelColor, userColor) {
			if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined") return;
			const run = () => {
				const listbox = document.querySelector("[class*=\"_3e4SsG_menu\"]")?.querySelector("[role=\"listbox\"]") ?? document.querySelector("[role=\"listbox\"]");
				if (listbox === null) return;
				const options = listbox.querySelectorAll("[role=\"option\"]");
				for (const opt of options) {
					if (opt.querySelector("[data-skill-dot]") !== null) continue;
					const nameEl = opt.querySelector("[class*=\"itemName\"]");
					if (nameEl === null) continue;
					const name = (nameEl.textContent ?? "").trim();
					if (name.length === 0) continue;
					if (!modelByName.has(name)) continue;
					const color = modelByName.get(name) ?? true ? modelColor : userColor;
					const wrapper = document.createElement("span");
					wrapper.setAttribute("data-skill-dot", "");
					wrapper.setAttribute("aria-hidden", "true");
					wrapper.style.width = "16px";
					wrapper.style.height = "16px";
					wrapper.style.display = "inline-flex";
					wrapper.style.justifyContent = "center";
					wrapper.style.alignItems = "center";
					wrapper.style.flex = "none";
					const dot = document.createElement("span");
					dot.style.display = "inline-block";
					dot.style.width = "6px";
					dot.style.height = "6px";
					dot.style.borderRadius = "3px";
					dot.style.background = color;
					dot.style.flex = "none";
					wrapper.appendChild(dot);
					nameEl.parentElement?.insertBefore(wrapper, nameEl);
				}
			};
			requestAnimationFrame(() => setTimeout(run, 0));
		}
		/**
		* Wrap the core skill source so every menu row carries the invocation dot.
		* Exported for unit tests; production wiring goes through setupSkillSlashDots.
		* @param source - the registered `/skill` source.
		* @param api - hub browser API for the modelInvocable lookup.
		* @param scope - hub settings scope for the dot colors.
		* @returns a disposer restoring the original candidates.
		*/
		function wrapSkillSource(source, api, scope) {
			const original = source.candidates;
			source.candidates = async (session, req) => {
				const items = await original(session, req);
				if (req.signal.aborted) return items;
				const modelByName = await modelInvocableMap(api);
				if (req.signal.aborted) return items;
				const snapshot = scope.getSnapshot();
				injectDotsViaDOM(modelByName, snapshot.value?.dotModelColor ?? "#2f81f7", snapshot.value?.dotUserColor ?? "#3fb950");
				return items;
			};
			return () => {
				source.candidates = original;
			};
		}
		/**
		* Mount the slash-menu dots on the registered `/skill` source. Idempotent and
		* defensive: if the core source isn't registered yet (or the registry shape
		* changes), it retries briefly and then gives up silently — the chat keeps
		* working, it simply shows no dots. The returned disposer restores the
		* original candidates and clears the model cache.
		* @param ctx - the client root context (inputTriggers + events).
		* @param api - hub browser API.
		* @param scope - hub settings scope for dot colors.
		* @returns a cleanup function for `ctx.effect`.
		*/
		function setupSkillSlashDots(ctx, api, scope) {
			const inputTriggers = ctx.get("inputTriggers");
			if (inputTriggers === void 0) return () => {};
			let disposed = false;
			let restore;
			let attempts = 0;
			const attempt = () => {
				if (disposed) return;
				const source = findSkillSource(inputTriggers);
				if (source === void 0) {
					if (attempts < 10) {
						attempts += 1;
						setTimeout(attempt, 100);
					}
					return;
				}
				restore = wrapSkillSource(source, api, scope);
			};
			attempt();
			const clearCache = () => {
				resetModelCache();
			};
			const offReset = ctx.on("connection/reset", clearCache);
			return () => {
				disposed = true;
				offReset();
				restore?.();
				restore = void 0;
			};
		}
		// \0dsh-css:src/client/settings-card.module.css.mjs
		const css$1 = ".KApx_W_card{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:var(--dsw-radius-md,12px);list-style:none;transition:border-color .16s,background .16s}.KApx_W_card:hover{border-color:var(--dsw-alias-label-dimmed)}.KApx_W_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.KApx_W_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;border-radius:var(--dsw-radius-md,12px);background:0 0;border:0;align-items:center;gap:12px;padding:12px 16px;display:flex}.KApx_W_header:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}.KApx_W_headText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.KApx_W_name{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}.KApx_W_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.KApx_W_versionTag{opacity:.5;white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:1px;margin-left:6px;font-size:12px;font-weight:400}.KApx_W_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.KApx_W_chevron,.KApx_W_chevronOpen{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.KApx_W_chevronOpen{transform:rotate(180deg)}.KApx_W_body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.KApx_W_readOnly,.KApx_W_notExposed{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:18px}.KApx_W_footer{border-top:.5px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.KApx_W_failed{min-width:0;color:var(--dsw-alias-state-error-primary,#ec1313);flex:1;margin:0;font-size:12px;line-height:18px}.KApx_W_discard,.KApx_W_save{appearance:none;font:inherit;cursor:pointer;border-radius:var(--dsw-radius-md,12px);border:0;height:32px;padding:0 12px;font-size:13px;line-height:20px}.KApx_W_discard{color:var(--dsw-alias-label-primary);background:0 0}.KApx_W_discard:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.KApx_W_save{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground)}.KApx_W_save:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary))}.KApx_W_discard:disabled,.KApx_W_save:disabled{opacity:.45;cursor:default}.KApx_W_discard:focus-visible,.KApx_W_save:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.KApx_W_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.KApx_W_field+.KApx_W_field{border-top:.5px solid var(--dsw-alias-border-l2)}.KApx_W_head{align-items:center;gap:8px;display:flex}.KApx_W_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:20px}.KApx_W_badges{align-items:center;gap:8px;display:inline-flex}.KApx_W_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.KApx_W_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:18px}.KApx_W_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.KApx_W_reset:disabled{cursor:default}.KApx_W_input{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);height:36px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-md,12px);background:0 0;padding:0 12px;font-size:13px;line-height:20px}.KApx_W_input:focus-visible{border-color:var(--dsw-alias-state-business-primary,#4176e6);outline:none}.KApx_W_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.KApx_W_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}.KApx_W_colorRow{align-items:center;gap:8px;display:flex}.KApx_W_colorInput{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md,12px);cursor:pointer;background:0 0;width:36px;height:36px;padding:0}.KApx_W_colorInput:disabled{opacity:.5;cursor:default}.KApx_W_colorInput::-webkit-color-swatch-wrapper{padding:2px}.KApx_W_colorInput::-webkit-color-swatch{border:none;border-radius:4px}.KApx_W_colorText{flex:1;min-width:0}.KApx_W_switchRow{align-items:center;gap:12px;display:flex}.KApx_W_switchText{flex:1;min-width:0}.KApx_W_switch,.KApx_W_switchOn{box-sizing:border-box;background:var(--dsw-alias-border-l3);cursor:pointer;border:0;border-radius:999px;flex:none;width:36px;height:20px;padding:2px;transition:background .15s}.KApx_W_switchOn{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary))}.KApx_W_switch:disabled,.KApx_W_switchOn:disabled{opacity:.5;cursor:default}.KApx_W_switchThumb{background:var(--dsw-alias-switch-thumb,#adb2b8);border-radius:50%;width:16px;height:16px;transition:transform .15s,background .15s;display:block;transform:translate(0)}.KApx_W_switchOn .KApx_W_switchThumb{background:var(--dsw-alias-label-primary-foreground,#0f1115);transform:translate(16px)}";
		const tagId$1 = "dsh-skill-hub/settings-card.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-skill-hub";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var settings_card_module_css_default = {
			"badge": "KApx_W_badge",
			"badges": "KApx_W_badges",
			"body": "KApx_W_body",
			"card": "KApx_W_card",
			"cardOpen": "KApx_W_cardOpen",
			"chevron": "KApx_W_chevron",
			"chevronOpen": "KApx_W_chevronOpen",
			"colorInput": "KApx_W_colorInput",
			"colorRow": "KApx_W_colorRow",
			"colorText": "KApx_W_colorText",
			"description": "KApx_W_description",
			"discard": "KApx_W_discard",
			"failed": "KApx_W_failed",
			"field": "KApx_W_field",
			"footer": "KApx_W_footer",
			"head": "KApx_W_head",
			"headText": "KApx_W_headText",
			"header": "KApx_W_header",
			"hint": "KApx_W_hint",
			"input": "KApx_W_input",
			"label": "KApx_W_label",
			"name": "KApx_W_name",
			"notExposed": "KApx_W_notExposed",
			"pending": "KApx_W_pending",
			"readOnly": "KApx_W_readOnly",
			"reset": "KApx_W_reset",
			"save": "KApx_W_save",
			"switch": "KApx_W_switch",
			"switchOn": "KApx_W_switchOn",
			"switchRow": "KApx_W_switchRow",
			"switchText": "KApx_W_switchText",
			"switchThumb": "KApx_W_switchThumb",
			"versionTag": "KApx_W_versionTag"
		};
		// src/client/settings-card.tsx
		/**
		* Shared chrome for the plugin settings card, aligned with the official
		* dsh-client-ui-settings-plugins PluginCard design language: the same tokens,
		* disclosure header, field rhythm, and copy. Renders nothing while the
		* namespace is unavailable — a deployment that does not compose the owning
		* plugin should show no trace of it.
		*/
		/**
		* Render one plugin settings card.
		* @param props - the plugin's copy keys, its form state, and its controls.
		* @returns the card, or nothing while the namespace is still loading.
		*/
		function PluginSettingsCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const { state } = props;
			if (!state.available) return null;
			const title = props.t(props.titleKey);
			const blocked = !state.dirty || state.invalid || state.saving;
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: settings_card_module_css_default.header,
				"aria-expanded": open,
				"aria-label": props.t(open ? "settings.collapse" : "settings.expand") + ": " + title,
				onClick: () => {
					setOpen(!open);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: settings_card_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.name,
							children: [title, props.version !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: settings_card_module_css_default.versionTag,
								children: ["v", props.version]
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.description,
							children: props.t(props.descriptionKey)
						})]
					}),
					state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.pending,
						children: props.t("settings.unsaved")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, { className: open ? settings_card_module_css_default.chevronOpen : settings_card_module_css_default.chevron })
				]
			});
			if (!state.exposed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: settings_card_module_css_default.card + (open ? " " + settings_card_module_css_default.cardOpen : ""),
				children: [header, open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: settings_card_module_css_default.body,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.notExposed,
						role: "status",
						children: props.t("settings.notExposed")
					})
				}) : null]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: settings_card_module_css_default.card + (open ? " " + settings_card_module_css_default.cardOpen : ""),
				children: [header, open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.body,
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.readOnly,
							role: "status",
							children: props.t("settings.readOnly")
						}) : null,
						props.children,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_css_default.footer,
							children: [
								state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: settings_card_module_css_default.failed,
									role: "status",
									children: props.t("settings.saveFailed")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.discard,
									disabled: !state.dirty || state.saving,
									onClick: props.onDiscard,
									children: props.t("settings.discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.save,
									disabled: blocked,
									onClick: props.onSave,
									children: props.t(!state.saving ? "settings.save" : "settings.saving")
								})
							]
						})
					]
				}) : null]
			});
		}
		/**
		* The head row every staged field shares: the label (plain text when the
		* control has no id) plus the overridden badge and its reset button.
		*/
		function FieldShell(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.head,
				children: [props.id !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
					className: settings_card_module_css_default.label,
					htmlFor: props.id,
					children: props.label
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: settings_card_module_css_default.label,
					children: props.label
				}), props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: settings_card_module_css_default.badges,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.badge,
						children: props.overriddenLabel
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: settings_card_module_css_default.reset,
						disabled: props.disabled,
						onClick: props.onReset,
						children: props.resetLabel
					})]
				}) : null]
			});
		}
		function SwitchField(props) {
			const checked = props.text !== "false";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: settings_card_module_css_default.field,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.switchRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.switchText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, { ...props }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.hint,
							children: props.hint
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: checked ? settings_card_module_css_default.switchOn : settings_card_module_css_default.switch,
						role: "switch",
						"aria-checked": checked,
						"aria-label": props.label,
						disabled: props.disabled,
						onClick: () => {
							props.onEdit(String(!checked));
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: settings_card_module_css_default.switchThumb })
					})]
				})
			});
		}
		function ColorField(props) {
			const value = HEX_COLOR_RE.test(props.text) ? props.text : props.defaultColor;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, { ...props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.colorRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: props.id,
							type: "color",
							className: settings_card_module_css_default.colorInput,
							value,
							disabled: props.disabled,
							onChange: (event) => {
								props.onEdit(event.target.value);
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "text",
							className: settings_card_module_css_default.input + " " + settings_card_module_css_default.colorText,
							value: props.text,
							disabled: props.disabled,
							placeholder: props.inheritLabel,
							onChange: (event) => {
								props.onEdit(event.target.value.trim());
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		function SecretField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, { ...props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						type: "password",
						autoComplete: "off",
						spellCheck: false,
						className: settings_card_module_css_default.input,
						value: props.text,
						disabled: props.disabled,
						placeholder: props.placeholder,
						"aria-invalid": props.invalid === true,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		function NumberField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, { ...props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						type: "text",
						inputMode: "numeric",
						className: settings_card_module_css_default.input,
						value: props.text,
						disabled: props.disabled,
						placeholder: props.inheritLabel,
						"aria-invalid": props.invalid === true,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		// node_modules/.pnpm/zustand@4.4.7_@types+react@18.3.31_immer@10.2.0_react@18.3.1/node_modules/zustand/esm/vanilla.mjs
		const createStoreImpl = (createState) => {
			let state;
			const listeners = /* @__PURE__ */ new Set();
			const setState = (partial, replace) => {
				const nextState = typeof partial === "function" ? partial(state) : partial;
				if (!Object.is(nextState, state)) {
					const previousState = state;
					state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
					listeners.forEach((listener) => listener(state, previousState));
				}
			};
			const getState = () => state;
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			};
			const destroy = () => {
				listeners.clear();
			};
			const api = {
				setState,
				getState,
				subscribe,
				destroy
			};
			state = createState(setState, getState, api);
			return api;
		};
		const createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;
		// node_modules/.pnpm/zustand@4.4.7_@types+react@18.3.31_immer@10.2.0_react@18.3.1/node_modules/zustand/esm/middleware.mjs
		const subscribeWithSelectorImpl = (fn) => (set, get, api) => {
			const origSubscribe = api.subscribe;
			api.subscribe = (selector, optListener, options) => {
				let listener = selector;
				if (optListener) {
					const equalityFn = (options == null ? void 0 : options.equalityFn) || Object.is;
					let currentSlice = selector(api.getState());
					listener = (state) => {
						const nextSlice = selector(state);
						if (!equalityFn(currentSlice, nextSlice)) {
							const previousSlice = currentSlice;
							optListener(currentSlice = nextSlice, previousSlice);
						}
					};
					if (options == null ? void 0 : options.fireImmediately) optListener(currentSlice, currentSlice);
				}
				return origSubscribe(listener);
			};
			return fn(set, get, api);
		};
		const subscribeWithSelector = subscribeWithSelectorImpl;
		// node_modules/.pnpm/immer@10.2.0/node_modules/immer/dist/immer.mjs
		var NOTHING = Symbol.for("immer-nothing");
		var DRAFTABLE = Symbol.for("immer-draftable");
		var DRAFT_STATE = Symbol.for("immer-state");
		function die(error, ...args) {
			throw new Error(`[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`);
		}
		var getPrototypeOf = Object.getPrototypeOf;
		function isDraft(value) {
			return !!value && !!value[DRAFT_STATE];
		}
		function isDraftable(value) {
			if (!value) return false;
			return isPlainObject(value) || Array.isArray(value) || !!value[DRAFTABLE] || !!value.constructor?.[DRAFTABLE] || isMap(value) || isSet(value);
		}
		var objectCtorString = Object.prototype.constructor.toString();
		var cachedCtorStrings = /* @__PURE__ */ new WeakMap();
		function isPlainObject(value) {
			if (!value || typeof value !== "object") return false;
			const proto = Object.getPrototypeOf(value);
			if (proto === null || proto === Object.prototype) return true;
			const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
			if (Ctor === Object) return true;
			if (typeof Ctor !== "function") return false;
			let ctorString = cachedCtorStrings.get(Ctor);
			if (ctorString === void 0) {
				ctorString = Function.toString.call(Ctor);
				cachedCtorStrings.set(Ctor, ctorString);
			}
			return ctorString === objectCtorString;
		}
		function each(obj, iter, strict = true) {
			if (getArchtype(obj) === 0) (strict ? Reflect.ownKeys(obj) : Object.keys(obj)).forEach((key) => {
				iter(key, obj[key], obj);
			});
			else obj.forEach((entry, index) => iter(index, entry, obj));
		}
		function getArchtype(thing) {
			const state = thing[DRAFT_STATE];
			return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
		}
		function has(thing, prop) {
			return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
		}
		function set(thing, propOrOldValue, value) {
			const t = getArchtype(thing);
			if (t === 2) thing.set(propOrOldValue, value);
			else if (t === 3) thing.add(value);
			else thing[propOrOldValue] = value;
		}
		function is(x, y) {
			if (x === y) return x !== 0 || 1 / x === 1 / y;
			else return x !== x && y !== y;
		}
		function isMap(target) {
			return target instanceof Map;
		}
		function isSet(target) {
			return target instanceof Set;
		}
		function latest(state) {
			return state.copy_ || state.base_;
		}
		function shallowCopy(base, strict) {
			if (isMap(base)) return new Map(base);
			if (isSet(base)) return new Set(base);
			if (Array.isArray(base)) return Array.prototype.slice.call(base);
			const isPlain = isPlainObject(base);
			if (strict === true || strict === "class_only" && !isPlain) {
				const descriptors = Object.getOwnPropertyDescriptors(base);
				delete descriptors[DRAFT_STATE];
				let keys = Reflect.ownKeys(descriptors);
				for (let i = 0; i < keys.length; i++) {
					const key = keys[i];
					const desc = descriptors[key];
					if (desc.writable === false) {
						desc.writable = true;
						desc.configurable = true;
					}
					if (desc.get || desc.set) descriptors[key] = {
						configurable: true,
						writable: true,
						enumerable: desc.enumerable,
						value: base[key]
					};
				}
				return Object.create(getPrototypeOf(base), descriptors);
			} else {
				const proto = getPrototypeOf(base);
				if (proto !== null && isPlain) return { ...base };
				const obj = Object.create(proto);
				return Object.assign(obj, base);
			}
		}
		function freeze(obj, deep = false) {
			if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj;
			if (getArchtype(obj) > 1) Object.defineProperties(obj, {
				set: dontMutateMethodOverride,
				add: dontMutateMethodOverride,
				clear: dontMutateMethodOverride,
				delete: dontMutateMethodOverride
			});
			Object.freeze(obj);
			if (deep) Object.values(obj).forEach((value) => freeze(value, true));
			return obj;
		}
		function dontMutateFrozenCollections() {
			die(2);
		}
		var dontMutateMethodOverride = { value: dontMutateFrozenCollections };
		function isFrozen(obj) {
			if (obj === null || typeof obj !== "object") return true;
			return Object.isFrozen(obj);
		}
		var plugins = {};
		function getPlugin(pluginKey) {
			const plugin = plugins[pluginKey];
			if (!plugin) die(0, pluginKey);
			return plugin;
		}
		var currentScope;
		function getCurrentScope() {
			return currentScope;
		}
		function createScope(parent_, immer_) {
			return {
				drafts_: [],
				parent_,
				immer_,
				canAutoFreeze_: true,
				unfinalizedDrafts_: 0
			};
		}
		function usePatchesInScope(scope, patchListener) {
			if (patchListener) {
				getPlugin("Patches");
				scope.patches_ = [];
				scope.inversePatches_ = [];
				scope.patchListener_ = patchListener;
			}
		}
		function revokeScope(scope) {
			leaveScope(scope);
			scope.drafts_.forEach(revokeDraft);
			scope.drafts_ = null;
		}
		function leaveScope(scope) {
			if (scope === currentScope) currentScope = scope.parent_;
		}
		function enterScope(immer2) {
			return currentScope = createScope(currentScope, immer2);
		}
		function revokeDraft(draft) {
			const state = draft[DRAFT_STATE];
			if (state.type_ === 0 || state.type_ === 1) state.revoke_();
			else state.revoked_ = true;
		}
		function processResult(result, scope) {
			scope.unfinalizedDrafts_ = scope.drafts_.length;
			const baseDraft = scope.drafts_[0];
			if (result !== void 0 && result !== baseDraft) {
				if (baseDraft[DRAFT_STATE].modified_) {
					revokeScope(scope);
					die(4);
				}
				if (isDraftable(result)) {
					result = finalize(scope, result);
					if (!scope.parent_) maybeFreeze(scope, result);
				}
				if (scope.patches_) getPlugin("Patches").generateReplacementPatches_(baseDraft[DRAFT_STATE].base_, result, scope.patches_, scope.inversePatches_);
			} else result = finalize(scope, baseDraft, []);
			revokeScope(scope);
			if (scope.patches_) scope.patchListener_(scope.patches_, scope.inversePatches_);
			return result !== NOTHING ? result : void 0;
		}
		function finalize(rootScope, value, path) {
			if (isFrozen(value)) return value;
			const useStrictIteration = rootScope.immer_.shouldUseStrictIteration();
			const state = value[DRAFT_STATE];
			if (!state) {
				each(value, (key, childValue) => finalizeProperty(rootScope, state, value, key, childValue, path), useStrictIteration);
				return value;
			}
			if (state.scope_ !== rootScope) return value;
			if (!state.modified_) {
				maybeFreeze(rootScope, state.base_, true);
				return state.base_;
			}
			if (!state.finalized_) {
				state.finalized_ = true;
				state.scope_.unfinalizedDrafts_--;
				const result = state.copy_;
				let resultEach = result;
				let isSet2 = false;
				if (state.type_ === 3) {
					resultEach = new Set(result);
					result.clear();
					isSet2 = true;
				}
				each(resultEach, (key, childValue) => finalizeProperty(rootScope, state, result, key, childValue, path, isSet2), useStrictIteration);
				maybeFreeze(rootScope, result, false);
				if (path && rootScope.patches_) getPlugin("Patches").generatePatches_(state, path, rootScope.patches_, rootScope.inversePatches_);
			}
			return state.copy_;
		}
		function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
			if (childValue == null) return;
			if (typeof childValue !== "object" && !targetIsSet) return;
			const childIsFrozen = isFrozen(childValue);
			if (childIsFrozen && !targetIsSet) return;
			if (isDraft(childValue)) {
				const res = finalize(rootScope, childValue, rootPath && parentState && parentState.type_ !== 3 && !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0);
				set(targetObject, prop, res);
				if (isDraft(res)) rootScope.canAutoFreeze_ = false;
				else return;
			} else if (targetIsSet) targetObject.add(childValue);
			if (isDraftable(childValue) && !childIsFrozen) {
				if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) return;
				if (parentState && parentState.base_ && parentState.base_[prop] === childValue && childIsFrozen) return;
				finalize(rootScope, childValue);
				if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && (isMap(targetObject) ? targetObject.has(prop) : Object.prototype.propertyIsEnumerable.call(targetObject, prop))) maybeFreeze(rootScope, childValue);
			}
		}
		function maybeFreeze(scope, value, deep = false) {
			if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) freeze(value, deep);
		}
		function createProxyProxy(base, parent) {
			const isArray = Array.isArray(base);
			const state = {
				type_: isArray ? 1 : 0,
				scope_: parent ? parent.scope_ : getCurrentScope(),
				modified_: false,
				finalized_: false,
				assigned_: {},
				parent_: parent,
				base_: base,
				draft_: null,
				copy_: null,
				revoke_: null,
				isManual_: false
			};
			let target = state;
			let traps = objectTraps;
			if (isArray) {
				target = [state];
				traps = arrayTraps;
			}
			const { revoke, proxy } = Proxy.revocable(target, traps);
			state.draft_ = proxy;
			state.revoke_ = revoke;
			return proxy;
		}
		var objectTraps = {
			get(state, prop) {
				if (prop === DRAFT_STATE) return state;
				const source = latest(state);
				if (!has(source, prop)) return readPropFromProto(state, source, prop);
				const value = source[prop];
				if (state.finalized_ || !isDraftable(value)) return value;
				if (value === peek(state.base_, prop)) {
					prepareCopy(state);
					return state.copy_[prop] = createProxy(value, state);
				}
				return value;
			},
			has(state, prop) {
				return prop in latest(state);
			},
			ownKeys(state) {
				return Reflect.ownKeys(latest(state));
			},
			set(state, prop, value) {
				const desc = getDescriptorFromProto(latest(state), prop);
				if (desc?.set) {
					desc.set.call(state.draft_, value);
					return true;
				}
				if (!state.modified_) {
					const current2 = peek(latest(state), prop);
					const currentState = current2?.[DRAFT_STATE];
					if (currentState && currentState.base_ === value) {
						state.copy_[prop] = value;
						state.assigned_[prop] = false;
						return true;
					}
					if (is(value, current2) && (value !== void 0 || has(state.base_, prop))) return true;
					prepareCopy(state);
					markChanged(state);
				}
				if (state.copy_[prop] === value && (value !== void 0 || prop in state.copy_) || Number.isNaN(value) && Number.isNaN(state.copy_[prop])) return true;
				state.copy_[prop] = value;
				state.assigned_[prop] = true;
				return true;
			},
			deleteProperty(state, prop) {
				if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
					state.assigned_[prop] = false;
					prepareCopy(state);
					markChanged(state);
				} else delete state.assigned_[prop];
				if (state.copy_) delete state.copy_[prop];
				return true;
			},
			getOwnPropertyDescriptor(state, prop) {
				const owner = latest(state);
				const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
				if (!desc) return desc;
				return {
					writable: true,
					configurable: state.type_ !== 1 || prop !== "length",
					enumerable: desc.enumerable,
					value: owner[prop]
				};
			},
			defineProperty() {
				die(11);
			},
			getPrototypeOf(state) {
				return getPrototypeOf(state.base_);
			},
			setPrototypeOf() {
				die(12);
			}
		};
		var arrayTraps = {};
		each(objectTraps, (key, fn) => {
			arrayTraps[key] = function() {
				arguments[0] = arguments[0][0];
				return fn.apply(this, arguments);
			};
		});
		arrayTraps.deleteProperty = function(state, prop) {
			return arrayTraps.set.call(this, state, prop, void 0);
		};
		arrayTraps.set = function(state, prop, value) {
			return objectTraps.set.call(this, state[0], prop, value, state[0]);
		};
		function peek(draft, prop) {
			const state = draft[DRAFT_STATE];
			return (state ? latest(state) : draft)[prop];
		}
		function readPropFromProto(state, source, prop) {
			const desc = getDescriptorFromProto(source, prop);
			return desc ? `value` in desc ? desc.value : desc.get?.call(state.draft_) : void 0;
		}
		function getDescriptorFromProto(source, prop) {
			if (!(prop in source)) return void 0;
			let proto = getPrototypeOf(source);
			while (proto) {
				const desc = Object.getOwnPropertyDescriptor(proto, prop);
				if (desc) return desc;
				proto = getPrototypeOf(proto);
			}
		}
		function markChanged(state) {
			if (!state.modified_) {
				state.modified_ = true;
				if (state.parent_) markChanged(state.parent_);
			}
		}
		function prepareCopy(state) {
			if (!state.copy_) state.copy_ = shallowCopy(state.base_, state.scope_.immer_.useStrictShallowCopy_);
		}
		var Immer2 = class {
			constructor(config) {
				this.autoFreeze_ = true;
				this.useStrictShallowCopy_ = false;
				this.useStrictIteration_ = true;
				/**
				* The `produce` function takes a value and a "recipe function" (whose
				* return value often depends on the base state). The recipe function is
				* free to mutate its first argument however it wants. All mutations are
				* only ever applied to a __copy__ of the base state.
				*
				* Pass only a function to create a "curried producer" which relieves you
				* from passing the recipe function every time.
				*
				* Only plain objects and arrays are made mutable. All other objects are
				* considered uncopyable.
				*
				* Note: This function is __bound__ to its `Immer` instance.
				*
				* @param {any} base - the initial state
				* @param {Function} recipe - function that receives a proxy of the base state as first argument and which can be freely modified
				* @param {Function} patchListener - optional function that will be called with all the patches produced here
				* @returns {any} a new state, or the initial state if nothing was modified
				*/
				this.produce = (base, recipe, patchListener) => {
					if (typeof base === "function" && typeof recipe !== "function") {
						const defaultBase = recipe;
						recipe = base;
						const self = this;
						return function curriedProduce(base2 = defaultBase, ...args) {
							return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
						};
					}
					if (typeof recipe !== "function") die(6);
					if (patchListener !== void 0 && typeof patchListener !== "function") die(7);
					let result;
					if (isDraftable(base)) {
						const scope = enterScope(this);
						const proxy = createProxy(base, void 0);
						let hasError = true;
						try {
							result = recipe(proxy);
							hasError = false;
						} finally {
							if (hasError) revokeScope(scope);
							else leaveScope(scope);
						}
						usePatchesInScope(scope, patchListener);
						return processResult(result, scope);
					} else if (!base || typeof base !== "object") {
						result = recipe(base);
						if (result === void 0) result = base;
						if (result === NOTHING) result = void 0;
						if (this.autoFreeze_) freeze(result, true);
						if (patchListener) {
							const p = [];
							const ip = [];
							getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
							patchListener(p, ip);
						}
						return result;
					} else die(1, base);
				};
				this.produceWithPatches = (base, recipe) => {
					if (typeof base === "function") return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
					let patches, inversePatches;
					return [
						this.produce(base, recipe, (p, ip) => {
							patches = p;
							inversePatches = ip;
						}),
						patches,
						inversePatches
					];
				};
				if (typeof config?.autoFreeze === "boolean") this.setAutoFreeze(config.autoFreeze);
				if (typeof config?.useStrictShallowCopy === "boolean") this.setUseStrictShallowCopy(config.useStrictShallowCopy);
				if (typeof config?.useStrictIteration === "boolean") this.setUseStrictIteration(config.useStrictIteration);
			}
			createDraft(base) {
				if (!isDraftable(base)) die(8);
				if (isDraft(base)) base = current(base);
				const scope = enterScope(this);
				const proxy = createProxy(base, void 0);
				proxy[DRAFT_STATE].isManual_ = true;
				leaveScope(scope);
				return proxy;
			}
			finishDraft(draft, patchListener) {
				const state = draft && draft[DRAFT_STATE];
				if (!state || !state.isManual_) die(9);
				const { scope_: scope } = state;
				usePatchesInScope(scope, patchListener);
				return processResult(void 0, scope);
			}
			/**
			* Pass true to automatically freeze all copies created by Immer.
			*
			* By default, auto-freezing is enabled.
			*/
			setAutoFreeze(value) {
				this.autoFreeze_ = value;
			}
			/**
			* Pass true to enable strict shallow copy.
			*
			* By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
			*/
			setUseStrictShallowCopy(value) {
				this.useStrictShallowCopy_ = value;
			}
			/**
			* Pass false to use faster iteration that skips non-enumerable properties
			* but still handles symbols for compatibility.
			*
			* By default, strict iteration is enabled (includes all own properties).
			*/
			setUseStrictIteration(value) {
				this.useStrictIteration_ = value;
			}
			shouldUseStrictIteration() {
				return this.useStrictIteration_;
			}
			applyPatches(base, patches) {
				let i;
				for (i = patches.length - 1; i >= 0; i--) {
					const patch = patches[i];
					if (patch.path.length === 0 && patch.op === "replace") {
						base = patch.value;
						break;
					}
				}
				if (i > -1) patches = patches.slice(i + 1);
				const applyPatchesImpl = getPlugin("Patches").applyPatches_;
				if (isDraft(base)) return applyPatchesImpl(base, patches);
				return this.produce(base, (draft) => applyPatchesImpl(draft, patches));
			}
		};
		function createProxy(value, parent) {
			const draft = isMap(value) ? getPlugin("MapSet").proxyMap_(value, parent) : isSet(value) ? getPlugin("MapSet").proxySet_(value, parent) : createProxyProxy(value, parent);
			(parent ? parent.scope_ : getCurrentScope()).drafts_.push(draft);
			return draft;
		}
		function current(value) {
			if (!isDraft(value)) die(10, value);
			return currentImpl(value);
		}
		function currentImpl(value) {
			if (!isDraftable(value) || isFrozen(value)) return value;
			const state = value[DRAFT_STATE];
			let copy;
			let strict = true;
			if (state) {
				if (!state.modified_) return state.base_;
				state.finalized_ = true;
				copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
				strict = state.scope_.immer_.shouldUseStrictIteration();
			} else copy = shallowCopy(value, true);
			each(copy, (key, childValue) => {
				set(copy, key, currentImpl(childValue));
			}, strict);
			if (state) state.finalized_ = false;
			return copy;
		}
		var produce = new Immer2().produce;
		// node_modules/.pnpm/@deepseek-ai+dsh-client-store@0.2.2-rc.1_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-client-store/lib/index.js
		/**
		* React-free snapshot store engine (zustand vanilla + immer + subscribeWithSelector +
		* rafFlush middleware + opt-in persist + dev freeze) plus the declarative
		* shell over it: {@link defineStore} bakes an init/persist/actions literal
		* into a {@link StoreHandle}, the registration-side store seat of slot
		* terminals. Engine products are bare observables — subscribe/getSnapshot/
		* update/set, NO selector hook. Hook synthesis is ui-renderer's (the one
		* uSES bridge, cached per source at the binding site).
		*/
		/**
		* Notify an observer set without allowing one callback to starve the rest.
		* @param listeners - current observer callbacks; copied before dispatch.
		* @param label - diagnostic owner prefix.
		* @param args - callback arguments.
		*/
		function notifySubscribers(listeners, label, ...args) {
			for (const listener of [...listeners]) try {
				listener(...args);
			} catch (error) {
				console.error(`${label} subscriber failed:`, error);
			}
		}
		/** Batches subscriber notification into one flush per animation frame. */
		function rafBatch(notify) {
			const schedule = typeof requestAnimationFrame === "function" ? (fn) => {
				requestAnimationFrame(() => {
					fn();
				});
			} : (fn) => {
				queueMicrotask(fn);
			};
			let scheduled = false;
			return () => {
				if (scheduled) return;
				scheduled = true;
				schedule(() => {
					scheduled = false;
					notify();
				});
			};
		}
		/**
		* Create a snapshot store.
		*
		* Flush default is 'sync' (controlled inputs need same-tick echo); frame-driven
		* stores opt into 'raf', where a frame's worth of updates coalesces into one
		* notification. Known raf-mode tradeoff: a component mounting mid-frame reads
		* fresh state while existing subscribers hear it next flush — transient
		* frame-level skew, same nature as the object layer's microtask batching.
		*
		* @param init - initial state.
		* @param opts - flush mode and opt-in persistence (localStorage, keyed by name).
		* @returns the store.
		*/
		function createSnapshotStore(init, opts) {
			const withSelector = subscribeWithSelector(() => init);
			const api = createStore()(withSelector);
			if (opts?.persist) attachPersistence(api, opts.persist.name);
			let subscribe = (fn) => api.subscribe(() => {
				notifySubscribers([fn], "[client-store]");
			});
			if (opts?.flush === "raf") {
				const listeners = /* @__PURE__ */ new Set();
				const flush = rafBatch(() => {
					notifySubscribers(listeners, "[client-store]");
				});
				api.subscribe(flush);
				subscribe = (fn) => {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				};
			}
			return {
				getSnapshot: () => api.getState(),
				subscribe: (fn) => subscribe(fn),
				update: (mutator) => {
					api.setState(produce(api.getState(), (draft) => {
						mutator(draft);
					}), true);
				},
				set: (next) => {
					api.setState(devFreeze(next), true);
				}
			};
		}
		/**
		* Whole-value JSON persistence to localStorage. Hand-rolled instead of the
		* zustand persist middleware: its write path spreads state into an object
		* (`partialize({ ...get() })`), exploding primitive state (a persisted string
		* draft becomes {0:'h',1:'e',...}) — not fixable via merge/deserialize options
		* because the corruption happens before serialization. Storage failures
		* (quota, private mode) only disable persistence, never break the store.
		*/
		function attachPersistence(api, name) {
			if (typeof localStorage === "undefined") return;
			try {
				const raw = localStorage.getItem(name);
				if (raw !== null) api.setState(devFreeze(JSON.parse(raw)), true);
			} catch (error) {
				console.error(`snapshot store '${name}' rehydration failed:`, error);
			}
			api.subscribe((state) => {
				try {
					localStorage.setItem(name, JSON.stringify(state));
				} catch (error) {
					console.error(`snapshot store '${name}' persistence failed:`, error);
				}
			});
		}
		/** Deep-freeze draftable wholesale-set state outside production: set() bypasses immer's freeze. */
		function devFreeze(value) {
			return value;
		}
		// src/client/settings-form.ts
		/**
		* Settings-card form machinery, vendored from the dsh-web-ui family bucket
		* (packages/dsh-task-board/src/client/settings-form.ts) and re-typed. Stages
		* one card's edits over one settings namespace and writes them on save.
		*
		* The Host is the only authority on whether a value was accepted — its
		* validators own the constraints no schema can express — so the outcome is
		* read back from the section rather than predicted here. A save that did not
		* land keeps its drafts, so the user can correct them instead of retyping.
		*/
		/** A boolean field, edited through true/false draft text. */
		function booleanField(field) {
			return {
				field,
				format: (value) => typeof value === "boolean" ? String(value) : "",
				parse: (text) => {
					if (text === "true") return {
						kind: "set",
						value: true
					};
					if (text === "false") return {
						kind: "set",
						value: false
					};
				}
			};
		}
		/** A #rrggbb color field, edited through hex draft text. */
		function colorField(field) {
			return {
				field,
				format: (value) => typeof value === "string" && HEX_COLOR_RE.test(value) ? value : "",
				parse: (text) => {
					if (HEX_COLOR_RE.test(text)) return {
						kind: "set",
						value: text
					};
				}
			};
		}
		/**
		* A secret field (API token): the stored value is never echoed back into the
		* draft (format always yields ''), so typing is always a fresh set and Reset
		* always unsets. An empty draft stages nothing.
		*/
		function secretField(field) {
			return {
				field,
				format: () => "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return void 0;
					if (!GITHUB_TOKEN_RE.test(trimmed)) return void 0;
					return {
						kind: "set",
						value: trimmed
					};
				}
			};
		}
		/**
		* A numeric field with range clamping. Integer by default: a fractional draft
		* is truncated so "5.5 分钟" cannot sneak past an integer-only schema.
		*/
		function numberField(field, options = {}) {
			const min = options.min ?? Number.NEGATIVE_INFINITY;
			const max = options.max ?? Number.POSITIVE_INFINITY;
			const integer = options.integer ?? true;
			return {
				field,
				format: (value) => typeof value === "number" && Number.isFinite(value) ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return void 0;
					const parsed = integer ? Math.trunc(Number(trimmed)) : Number(trimmed);
					if (!Number.isFinite(parsed) || parsed < min || parsed > max) return void 0;
					return {
						kind: "set",
						value: parsed
					};
				}
			};
		}
		/** Stages one card's edits and writes them through the settings transport. */
		var CardForm = class {
			scope;
			specs = /* @__PURE__ */ new Map();
			staged = /* @__PURE__ */ new Map();
			listeners = /* @__PURE__ */ new Set();
			saving = false;
			failed = false;
			/** @param scope - the bound settings scope for this card's namespace. */
			constructor(scope, specs) {
				this.scope = scope;
				for (const spec of specs) this.specs.set(spec.field, spec);
				scope.subscribe(() => {
					this.publish();
				});
			}
			/** Publish a projection of this form, rebuilt whenever the scope or a draft changes. */
			bind(project) {
				const store = createSnapshotStore(project());
				this.listeners.add(() => {
					store.set(project());
				});
				return store;
			}
			/** Read the card-level state: what the Host serves, and what a save would do. */
			shell() {
				const snapshot = this.scope.getSnapshot();
				const plan = this.plan();
				return {
					available: snapshot.status !== "loading",
					exposed: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: plan.length > 0,
					invalid: plan.some((item) => item.run === void 0),
					saving: this.saving,
					failed: this.failed
				};
			}
			/** Read one field's state from the effective section and its staged draft. */
			field(field) {
				const spec = this.specOf(field);
				const staged = this.staged.get(field);
				if (staged === void 0) return {
					text: spec.format(this.sectionValue(field)),
					overridden: this.stored(field),
					invalid: false
				};
				const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
				return {
					text: staged.text,
					overridden: write?.kind === "set",
					invalid: write === void 0
				};
			}
			/** The actions the card's slot registration injects. */
			actions() {
				return {
					edit: (field, text) => {
						this.stage(field, {
							text,
							clear: false
						});
					},
					resetField: (field) => {
						this.stage(field, {
							text: this.specOf(field).format(this.baseValue(field)),
							clear: true
						});
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged.size === 0 && !this.failed) return;
						this.staged.clear();
						this.failed = false;
						this.publish();
					}
				};
			}
			/** Write every staged edit, then re-seed from what the Host accepted. */
			async save() {
				const plan = this.plan();
				const writes = plan.flatMap((item) => item.run === void 0 ? [] : [item.run]);
				if (plan.length === 0 || this.saving || writes.length !== plan.length) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				for (const write of writes) landed = await write() && landed;
				if (landed) this.staged.clear();
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
			/** Every staged edit a save would write, in staging order. */
			plan() {
				const plan = [];
				for (const [field, staged] of this.staged) {
					const spec = this.specOf(field);
					if (staged.clear) {
						if (this.stored(field)) plan.push({
							field,
							run: () => this.clear(field)
						});
						continue;
					}
					if (staged.text === spec.format(this.sectionValue(field))) continue;
					const write = spec.parse(staged.text);
					if (write === void 0) plan.push({
						field,
						run: void 0
					});
					else if (write.kind === "clear") plan.push({
						field,
						run: () => this.clear(field)
					});
					else plan.push({
						field,
						run: () => this.store(field, write.value)
					});
				}
				return plan;
			}
			async clear(field) {
				await this.scope.unset(field);
				return !this.stored(field);
			}
			async store(field, value) {
				await this.scope.set(field, value);
				return this.userRecord()?.[field] === value;
			}
			userRecord() {
				const user = this.scope.getSnapshot().user;
				return typeof user === "object" && user !== null ? user : void 0;
			}
			stage(field, edit) {
				this.staged.set(field, edit);
				this.failed = false;
				this.publish();
			}
			specOf(field) {
				const spec = this.specs.get(field);
				if (spec === void 0) throw new Error("settings card has no field " + field);
				return spec;
			}
			sectionValue(field) {
				return this.scope.getSnapshot().value?.[field];
			}
			baseValue(field) {
				const base = this.scope.getSnapshot().base;
				return typeof base === "object" && base !== null ? base[field] : void 0;
			}
			stored(field) {
				const user = this.userRecord();
				return user !== void 0 && Object.hasOwn(user, field);
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
		};
		// src/client/SkillHubSettingsCard.tsx
		/**
		* The dsh-skill-hub plugin settings card: bridges the hub's settings
		* namespace (bound through the official settings transport) onto the
		* family-style staged card form (enabled master switch + display knobs).
		* Registered into `plugins.bundle.config` under the bundle's package name, so
		* the Plugins manager renders it on dsh-skill-hub's own page. That slot is
		* dispatched with `view: 'page'` only, so the card always renders its full
		* form (no `summary` one-liner variant).
		*/
		/** Bridges the hub's config scope onto the card's staged form. */
		var SkillHubSettingsCardController = class {
			form;
			store;
			/** @param scope - the hub settings scope the card edits (FormScope-compatible). */
			constructor(scope) {
				this.form = new CardForm(scope, [
					booleanField("enabled"),
					colorField("dotModelColor"),
					colorField("dotUserColor"),
					booleanField("showUseCount"),
					booleanField("showUseTime"),
					booleanField("showGroupSummary"),
					numberField("statsWindowDays", {
						min: 0,
						max: 3650
					}),
					numberField("statsScanMinutes", {
						min: 1,
						max: 1440
					}),
					secretField("githubToken")
				]);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				return {
					...this.form.shell(),
					enabled: this.form.field("enabled"),
					dotModelColor: this.form.field("dotModelColor"),
					dotUserColor: this.form.field("dotUserColor"),
					showUseCount: this.form.field("showUseCount"),
					showUseTime: this.form.field("showUseTime"),
					showGroupSummary: this.form.field("showGroupSummary"),
					statsWindowDays: this.form.field("statsWindowDays"),
					statsScanMinutes: this.form.field("statsScanMinutes"),
					githubToken: this.form.field("githubToken")
				};
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot hook and its form actions.
			*/
			inject() {
				return {
					hooks: { skillHubSettingsCard: this.store },
					...this.form.actions()
				};
			}
		};
		/** The card's field rows in render order; the rendered DOM order follows it. */
		const FIELD_ROWS = [
			{
				kind: "switch",
				field: "enabled",
				label: "settings.enabled",
				hint: "settings.enabledHint"
			},
			{
				kind: "color",
				field: "dotModelColor",
				id: "skill-hub-dot-model-color",
				label: "settings.dotModelColor",
				hint: "settings.dotModelColorHint",
				defaultColor: DEFAULT_DOT_MODEL_COLOR
			},
			{
				kind: "color",
				field: "dotUserColor",
				id: "skill-hub-dot-user-color",
				label: "settings.dotUserColor",
				hint: "settings.dotUserColorHint",
				defaultColor: DEFAULT_DOT_USER_COLOR
			},
			{
				kind: "switch",
				field: "showUseCount",
				label: "settings.showUseCount",
				hint: "settings.showUseCountHint"
			},
			{
				kind: "switch",
				field: "showUseTime",
				label: "settings.showUseTime",
				hint: "settings.showUseTimeHint"
			},
			{
				kind: "switch",
				field: "showGroupSummary",
				label: "settings.showGroupSummary",
				hint: "settings.showGroupSummaryHint"
			},
			{
				kind: "number",
				field: "statsWindowDays",
				id: "skill-hub-stats-window-days",
				label: "settings.statsWindowDays",
				hint: "settings.statsWindowDaysHint"
			},
			{
				kind: "number",
				field: "statsScanMinutes",
				id: "skill-hub-stats-scan-minutes",
				label: "settings.statsScanMinutes",
				hint: "settings.statsScanMinutesHint"
			},
			{
				kind: "secret",
				field: "githubToken",
				id: "skill-hub-github-token",
				label: "settings.githubToken",
				hint: "settings.githubTokenHint",
				placeholder: "settings.githubTokenPlaceholder"
			}
		];
		/**
		* Render the dsh-skill-hub card.
		* @param props - locale copy, the card snapshot, and its form actions.
		* @returns the card.
		*/
		function SkillHubSettingsCard(props) {
			const { t } = props;
			const state = props.useSkillHubSettingsCard((snapshot) => snapshot);
			const [version, setVersion] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				let cancelled = false;
				new SkillHubApi().config().then((res) => {
					if (!cancelled && res.ok) setVersion(res.pluginVersion);
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, []);
			const disabled = !state.writable;
			const fieldProps = {
				overriddenLabel: t("settings.overridden"),
				resetLabel: t("settings.reset"),
				disabled
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginSettingsCard, {
				t,
				titleKey: "settings.title",
				descriptionKey: "settings.description",
				version,
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: FIELD_ROWS.map((row) => {
					const value = state[row.field];
					const common = {
						label: t(row.label),
						hint: t(row.hint),
						...fieldProps,
						...value,
						onEdit: (text) => {
							props.edit(row.field, text);
						},
						onReset: () => {
							props.resetField(row.field);
						}
					};
					if (row.kind === "switch") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchField, { ...common }, row.field);
					if (row.kind === "color") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorField, {
						...common,
						id: row.id,
						inheritLabel: t("settings.inherit"),
						defaultColor: row.defaultColor
					}, row.field);
					if (row.kind === "number") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
						...common,
						id: row.id,
						inheritLabel: t("settings.inherit")
					}, row.field);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SecretField, {
						...common,
						id: row.id,
						placeholder: t(row.placeholder)
					}, row.field);
				})
			});
		}
		// \0dsh-css:src/client/panel/panel.module.css.mjs
		const css = ".jbF1yq_pageShell{--hub-content-width:var(--hub-user-width,960px);flex-direction:column;flex:1;min-height:0;display:flex;position:relative;overflow:hidden}.jbF1yq_scrollArea{scrollbar-gutter:stable;flex-direction:column;flex:1;min-height:0;display:flex;overflow:auto}.jbF1yq_widthHandle{z-index:0;width:min(10px, calc((100% - var(--hub-content-width)) / 2 - 24px - 24px));cursor:col-resize;position:absolute;top:0;bottom:0}.jbF1yq_widthHandle[data-side=left]{right:calc(50% + var(--hub-content-width) / 2 + 24px)}.jbF1yq_widthHandle[data-side=right]{left:calc(50% + var(--hub-content-width) / 2 + 24px)}.jbF1yq_widthHandle:after{content:\"\";background:linear-gradient(to bottom, transparent calc(var(--hub-width-handle-pointer-y,50%) - 36px), var(--dsw-alias-scrollbar-bg-l1,#80808059) calc(var(--hub-width-handle-pointer-y,50%) - 8px), var(--dsw-alias-scrollbar-bg-l1,#80808059) calc(var(--hub-width-handle-pointer-y,50%) + 8px), transparent calc(var(--hub-width-handle-pointer-y,50%) + 36px));opacity:0;pointer-events:none;border-radius:2px;width:2px;position:absolute;top:0;bottom:0}.jbF1yq_widthHandle[data-side=left]:after{right:4px}.jbF1yq_widthHandle[data-side=right]:after{left:4px}.jbF1yq_widthHandle:hover:after,.jbF1yq_widthHandle[data-dragging]:after{opacity:1}.jbF1yq_widthHandle[data-dragging]{z-index:8}.jbF1yq_panel{padding:calc(28px + var(--dsh-frame-top-clearance,0px)) clamp(24px, 4vw, 48px) 48px;width:100%;max-width:calc(var(--hub-content-width) + 2 * clamp(24px, 4vw, 48px));box-sizing:border-box;--hub-model:#2f81f7;--hub-user:#3fb950;--hub-accent:var(--dsw-alias-state-business-primary,#4176e6);--hub-focus:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176e6));--hub-focus-width:var(--dsw-focus-ring-width,2px);--hub-brand:var(--dsw-alias-button-primary-fill,#0f1115);--hub-brand-hover:var(--dsw-alias-button-primary-hover,#ebeef2);--hub-on-brand:var(--dsw-alias-label-primary-foreground,#fff);--hub-text:var(--dsw-alias-label-primary,#0f1115);--hub-text-2:var(--dsw-alias-label-secondary,#61666b);--hub-text-3:var(--dsw-alias-label-tertiary,#81858c);--hub-text-4:var(--dsw-alias-label-caption,#adb2b8);--hub-surface:var(--dsw-alias-bg-module-platform,#f5f6f7);--hub-layer:var(--dsw-alias-bg-layer-1,#fff);--hub-hover:var(--dsw-alias-interactive-bg-hover,#2631480f);--hub-active:var(--dsw-alias-interactive-bg-active,#2631481a);--hub-border:var(--dsw-alias-border-l2,#0000001a);--hub-border-2:var(--dsw-alias-border-l3,#0000001f);--hub-danger:var(--dsw-alias-state-error-primary,#ec1313);--hub-success:var(--dsw-alias-state-success-primary,#22c55e);--hub-warn:var(--dsw-alias-state-warn-primary,#f59e0b);--hub-skeleton:var(--dsw-alias-bg-skeleton,#0000000a);--hub-elevation:var(--dsw-elevation-prominent,0 0 0 .5px #00000014, 0 3px 8px #0000000a);--hub-mono:var(--dsw-font-mono,ui-monospace, SFMono-Regular, Menlo, monospace);flex-direction:column;gap:14px;margin:0 auto;display:flex}.jbF1yq_pageHeading{flex-wrap:wrap;align-items:center;gap:8px 16px;margin-bottom:10px;display:flex}.jbF1yq_title{flex:0 auto;min-width:0;max-width:100%;margin:0;font-size:20px;font-weight:500;line-height:28px}.jbF1yq_headingMeta{flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0;display:inline-flex}.jbF1yq_filterTabs{flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:0;display:flex}.jbF1yq_filterTab{height:28px;color:var(--hub-text-3);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;border-radius:14px;flex:none;align-items:center;padding:0 10px;font-size:14px;line-height:22px;display:inline-flex}.jbF1yq_filterTab:hover{background:var(--hub-hover)}.jbF1yq_filterTabActive{background:var(--hub-hover);color:var(--hub-text)}.jbF1yq_placeholder{text-align:center;color:var(--hub-text-3);flex-direction:column;align-items:center;padding:48px 20px;font-size:14px;line-height:1.6;display:flex}.jbF1yq_placeholderTitle{margin:0 0 8px;font-size:14px;font-weight:400;line-height:1.6}.jbF1yq_placeholderBody{max-width:460px;color:var(--hub-text-4);margin:0;font-size:13px;line-height:21px}.jbF1yq_about{flex-direction:column;gap:10px;padding-top:6px;display:flex}.jbF1yq_aboutTitle{margin:0;font-size:14px;font-weight:500;line-height:22px}.jbF1yq_aboutCard{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-lg,16px);flex-direction:column;margin-top:4px;padding:0 16px;display:flex}.jbF1yq_aboutRow{box-sizing:border-box;border-bottom:.5px solid var(--hub-border);align-items:center;gap:12px;min-height:52px;padding:12px 0;display:flex}.jbF1yq_aboutRow:last-child{border-bottom:0}.jbF1yq_aboutRowText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.jbF1yq_aboutRowTitle{color:var(--hub-text);font-size:14px;line-height:22px}.jbF1yq_aboutRowDesc{color:var(--hub-text-3);overflow-wrap:anywhere;font-size:12px;line-height:18px}.jbF1yq_aboutValue{color:var(--hub-text-2);font-variant-numeric:tabular-nums;flex:none;font-size:13px}.jbF1yq_aboutControl{flex:none;align-items:center;gap:10px;display:inline-flex}.jbF1yq_aboutLink{color:var(--hub-accent);font-size:13px;text-decoration:none}.jbF1yq_aboutLink:hover{text-decoration:underline}.jbF1yq_hint{color:var(--hub-text-3);font-size:12px;line-height:18px}.jbF1yq_actions{align-items:center;gap:8px;margin-left:auto;display:flex}.jbF1yq_segmented{align-items:center;gap:8px;display:inline-flex}.jbF1yq_segBtn{height:28px;color:var(--hub-text-3);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;border-radius:14px;align-items:center;padding:0 10px;font-size:14px;line-height:22px;transition:background .15s,color .15s;display:inline-flex}.jbF1yq_segBtn:hover{color:var(--hub-text);background:var(--hub-hover)}.jbF1yq_segBtnActive{background:var(--hub-hover);color:var(--hub-text)}.jbF1yq_search{box-sizing:border-box;border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);width:100%;height:36px;color:var(--hub-text);font:inherit;background:0 0;outline:none;padding:0 12px;font-size:13px;line-height:20px;transition:border-color .15s}.jbF1yq_search::placeholder{color:var(--hub-text-4)}.jbF1yq_search:focus{border-color:var(--hub-accent)}.jbF1yq_section{flex-direction:column;gap:8px;margin:0;display:flex}.jbF1yq_section+.jbF1yq_section{margin-top:18px}.jbF1yq_sectionTitle{align-items:center;gap:8px;margin:0;font-size:14px;font-weight:500;line-height:22px;display:flex}.jbF1yq_sectionHead{align-items:center;gap:8px;margin:0;display:flex}.jbF1yq_sectionHead .jbF1yq_sectionTitle{flex:1;min-width:0}.jbF1yq_list{flex-direction:column;gap:2px;display:flex}.jbF1yq_groupHead{box-sizing:border-box;align-items:center;gap:8px;min-height:28px;padding:0;display:flex}.jbF1yq_groupTitle{color:var(--hub-text);flex:1;align-items:center;gap:6px;min-width:0;font-size:14px;font-weight:500;line-height:22px;display:inline-flex}.jbF1yq_groupOps{flex-wrap:wrap;flex:none;align-items:center;gap:4px;display:inline-flex}.jbF1yq_groupTitleInner{align-items:baseline;display:inline-flex}.jbF1yq_opBtn{border-radius:var(--dsw-radius-sm,8px);height:28px;color:var(--hub-text-2);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;align-items:center;gap:4px;padding:0 10px;font-size:13px;line-height:20px;transition:background .15s,color .15s;display:inline-flex}.jbF1yq_opBtn:hover{background:var(--hub-hover);color:var(--hub-text)}.jbF1yq_opBtn:disabled{opacity:.45;cursor:default}.jbF1yq_opBtnActive{background:var(--hub-hover);color:var(--hub-text)}.jbF1yq_row{border-radius:var(--dsw-radius-md,12px);cursor:pointer;background:0 0;align-items:center;gap:14px;padding:8px;transition:background .12s;display:flex}.jbF1yq_row:hover{background:var(--hub-hover)}.jbF1yq_row:focus-visible{outline:var(--hub-focus-width) solid var(--hub-focus);outline-offset:-2px}.jbF1yq_rowStatic{cursor:default}.jbF1yq_rowStatic:hover{background:0 0}.jbF1yq_rowMain{flex:1;min-width:0}.jbF1yq_rowName{align-items:center;gap:5px;min-width:0;font-size:14px;line-height:20px;display:flex}.jbF1yq_rowNameText{text-overflow:ellipsis;white-space:nowrap;font-weight:500;overflow:hidden}.jbF1yq_rowDesc{color:var(--hub-text-3);white-space:nowrap;text-overflow:ellipsis;margin-top:2px;font-size:13px;line-height:18px;overflow:hidden}.jbF1yq_badges{flex:none;align-items:center;gap:6px;display:flex}.jbF1yq_badge{background:var(--hub-surface);height:18px;color:var(--hub-text-2);white-space:nowrap;border:0;border-radius:999px;align-items:center;padding:0 7px;font-size:11px;font-weight:500;line-height:17px;display:inline-flex}.jbF1yq_badgeReadonly{color:var(--hub-text-3)}.jbF1yq_switch{box-sizing:border-box;background:var(--dsw-alias-border-l3,var(--hub-border-2));cursor:pointer;border:0;border-radius:999px;flex:none;width:36px;height:20px;padding:2px;transition:background .18s}.jbF1yq_switch:disabled{opacity:.5;cursor:default}.jbF1yq_switchOn{background:var(--hub-brand)}.jbF1yq_switchThumb{background:var(--dsw-alias-switch-thumb,#adb2b8);border-radius:50%;width:16px;height:16px;transition:transform .18s,background .18s;display:block;transform:translate(0)}.jbF1yq_switchOn .jbF1yq_switchThumb{background:var(--dsw-alias-label-primary-foreground,#0f1115);transform:translate(16px)}.jbF1yq_empty{color:var(--hub-text-3);text-align:center;padding:48px 20px;font-size:14px;line-height:20px}.jbF1yq_diagRow{border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-state-warn-tertiary,#fef5e7);color:var(--hub-text);padding:10px 12px;font-size:12px;line-height:18px}.jbF1yq_diagPath{font-family:var(--hub-mono);color:var(--hub-text-2);word-break:break-all;font-size:11.5px;line-height:16px}.jbF1yq_diagReason{color:var(--hub-text-3);margin-top:1px}.jbF1yq_errorBanner{color:var(--hub-danger);background:color-mix(in srgb, var(--hub-danger) 10%, transparent);border-radius:var(--dsw-radius-md,12px);white-space:pre-wrap;word-break:break-all;align-items:flex-start;gap:10px;padding:10px 14px;font-size:13px;line-height:20px;display:flex}.jbF1yq_successBanner{color:var(--hub-success);background:color-mix(in srgb, var(--hub-success) 10%, transparent);border-radius:var(--dsw-radius-md,12px);white-space:pre-wrap;word-break:break-all;align-items:flex-start;gap:10px;padding:10px 14px;font-size:13px;line-height:20px;display:flex}.jbF1yq_detailHead{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.jbF1yq_back{border-radius:var(--dsw-radius-sm,8px);height:28px;color:var(--hub-text-2);font:inherit;cursor:pointer;background:0 0;border:0;align-items:center;padding:0 10px;font-size:13px;line-height:20px;display:inline-flex}.jbF1yq_back:hover{background:var(--hub-hover);color:var(--hub-text)}.jbF1yq_detailName{font-size:20px;font-weight:500;line-height:28px}.jbF1yq_detailMeta{color:var(--hub-text-3);flex-direction:column;gap:4px;font-size:12px;line-height:18px;display:flex}.jbF1yq_detailMetaLine{word-break:break-all}.jbF1yq_detailContent{font-family:var(--hub-mono);white-space:pre-wrap;word-break:break-word;background:var(--hub-layer);border:.5px solid var(--hub-border);border-radius:var(--dsw-radius-lg,16px);max-height:62vh;padding:14px 16px;font-size:12px;line-height:1.6;overflow:auto}.jbF1yq_form{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-lg,16px);background:0 0;flex-direction:column;gap:10px;padding:14px 16px;display:flex}.jbF1yq_formRow{flex-direction:column;gap:6px;display:flex}.jbF1yq_formLabel{color:var(--hub-text-3);font-size:12px;line-height:18px}.jbF1yq_input,.jbF1yq_select{box-sizing:border-box;border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);height:36px;color:var(--hub-text);font:inherit;background:0 0;outline:none;padding:0 12px;font-size:13px;transition:border-color .15s}.jbF1yq_input:focus,.jbF1yq_select:focus{border-color:var(--hub-accent)}.jbF1yq_buttons{align-items:center;gap:8px;display:flex}.jbF1yq_button{border-radius:var(--dsw-radius-md,12px);height:32px;color:var(--hub-text);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;padding:0 12px;font-size:13px;line-height:20px;transition:background .15s,opacity .15s;display:inline-flex}.jbF1yq_button:hover{background:var(--hub-hover)}.jbF1yq_button:disabled{opacity:.45;cursor:default}.jbF1yq_primary{background:var(--hub-brand);color:var(--hub-on-brand)}.jbF1yq_primary:hover{background:var(--hub-brand-hover)}.jbF1yq_danger{color:var(--hub-danger)}.jbF1yq_danger:hover{background:color-mix(in srgb, var(--hub-danger) 10%, transparent)}.jbF1yq_danger:disabled{opacity:.45;cursor:default}.jbF1yq_sm{height:28px;padding:0 10px;font-size:12px}.jbF1yq_formError{color:var(--hub-danger)}.jbF1yq_formSuccess{color:var(--hub-success)}.jbF1yq_dot{vertical-align:middle;border-radius:50%;width:7px;height:7px;margin-left:5px;display:inline-block}.jbF1yq_dots{flex:none;align-items:center;gap:3px;margin-left:5px;display:inline-flex}.jbF1yq_dots .jbF1yq_dot{margin-left:0}.jbF1yq_dotModel{background:var(--hub-model)}.jbF1yq_dotUser{background:var(--hub-user)}.jbF1yq_displayName{color:var(--hub-text-3);white-space:nowrap;text-overflow:ellipsis;flex-shrink:1;min-width:0;max-width:160px;margin-left:6px;font-size:11px;font-weight:400;overflow:hidden}.jbF1yq_legend{color:var(--hub-text-3);flex-wrap:wrap;align-items:center;gap:12px;padding:0 2px;font-size:12px;line-height:18px;display:flex}.jbF1yq_legendItem{align-items:center;gap:4px;display:inline-flex}.jbF1yq_legendItem .jbF1yq_dot{margin-left:0}.jbF1yq_legendHint{opacity:.8}.jbF1yq_badgeSource,.jbF1yq_badgeCount{color:var(--hub-text-3)}.jbF1yq_disclosure{min-width:0;color:inherit;cursor:pointer;text-align:left;background:0 0;border:none;flex:1;align-items:center;gap:7px;min-height:24px;padding:2px 0;display:flex}.jbF1yq_disclosure:hover .jbF1yq_groupTitle{opacity:1}.jbF1yq_chevron{opacity:.55;border-bottom:1.5px solid;border-right:1.5px solid;flex:none;align-self:center;width:8px;height:8px;margin-right:2px;transition:transform .15s;transform:rotate(45deg)translateY(-1px)}.jbF1yq_chevronCollapsed{transform:rotate(-45deg)translateY(-1px)}.jbF1yq_subbar{flex-wrap:wrap;align-items:center;gap:12px;display:flex}.jbF1yq_filterBar{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.jbF1yq_filterBar .jbF1yq_formLabel{margin:0}.jbF1yq_useCount{color:var(--hub-text-2);background:var(--hub-surface);vertical-align:1px;border-radius:999px;margin-left:6px;padding:0 6px;font-size:11px;font-weight:500;line-height:17px;display:inline-block}.jbF1yq_useTime{color:var(--hub-text-4);white-space:nowrap;margin-left:auto;font-size:12px;line-height:18px}.jbF1yq_sourceLink{color:inherit;opacity:.9;border-bottom:1px dotted;font-weight:500;text-decoration:none}.jbF1yq_sourceLink:hover{opacity:1}.jbF1yq_statusBadges{flex:none;align-items:center;gap:4px;display:inline-flex}.jbF1yq_statusBadge{background:var(--hub-surface);height:18px;color:var(--hub-text-2);white-space:nowrap;border:0;border-radius:999px;align-items:center;padding:0 7px;font-size:11px;font-weight:500;line-height:17px;display:inline-flex}.jbF1yq_statusOk{color:var(--hub-success);background:color-mix(in srgb, var(--hub-success) 10%, transparent);border-color:currentColor}.jbF1yq_statusUpdated{color:var(--hub-warn);background:color-mix(in srgb, var(--hub-warn) 12%, transparent)}.jbF1yq_statusError{color:var(--hub-danger);background:color-mix(in srgb, var(--hub-danger) 10%, transparent)}.jbF1yq_statusWrap{cursor:pointer;background:0 0;border:none;align-items:center;gap:4px;padding:0;font-family:inherit;display:inline-flex}.jbF1yq_statusWrap:hover .jbF1yq_statusBadge{opacity:1}.jbF1yq_statusButton{cursor:pointer;font-family:inherit}.jbF1yq_statusButton:hover{opacity:1}.jbF1yq_opDanger{color:var(--hub-danger)}.jbF1yq_opDanger:hover{background:color-mix(in srgb, var(--hub-danger) 10%, transparent);color:var(--hub-danger)}.jbF1yq_iconBtn{justify-content:center;width:28px;padding:0}.jbF1yq_rowMenu{flex:none;align-items:center;display:inline-flex;position:relative}.jbF1yq_menuTrigger{border-radius:var(--dsw-radius-xs,4px);width:24px;height:24px;color:var(--hub-text-3);cursor:pointer;opacity:0;pointer-events:none;background:0 0;border:0;justify-content:center;align-items:center;padding:0;transition:opacity .12s,color .12s;display:inline-flex}.jbF1yq_row:hover .jbF1yq_menuTrigger,.jbF1yq_row:focus-within .jbF1yq_menuTrigger,.jbF1yq_row:has(.jbF1yq_rowMenuOpen) .jbF1yq_menuTrigger{opacity:1;pointer-events:auto}.jbF1yq_menuTrigger:hover,.jbF1yq_menuTrigger:focus-visible,.jbF1yq_menuTriggerOpen{color:var(--hub-text)}.jbF1yq_menuTrigger:focus-visible{outline:var(--hub-focus-width) solid var(--hub-focus);outline-offset:2px}.jbF1yq_menuTrigger:disabled{opacity:.35;cursor:default}.jbF1yq_row:has(.jbF1yq_rowMenuOpen),.jbF1yq_row:has(.jbF1yq_rowMenuOpen):hover{background:var(--hub-hover)}@media (hover:none){.jbF1yq_menuTrigger{opacity:1;pointer-events:auto}}.jbF1yq_menuCard{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-md,12px);--menu-text:var(--dsw-alias-label-primary,#0f1115);--menu-text-3:var(--dsw-alias-label-tertiary,#81858c);--menu-hover:var(--dsw-alias-interactive-bg-hover,#2631480f);--menu-danger:var(--dsw-alias-state-error-primary,#ec1313);--menu-danger-hover:var(--dsw-alias-interactive-bg-hover-danger,#ec13130d);color:var(--menu-text);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:var(--dsw-elevation-prominent,0 0 0 .5px #00000014, 0 3px 8px #00000014, 0 0 20px #0000000f);border:0;flex-direction:column;gap:0;padding:4px;display:flex;position:fixed}.jbF1yq_menuItem{border-radius:var(--dsw-radius-md,12px);width:100%;min-height:34px;color:var(--menu-text);font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:6px 8px;font-size:13px;line-height:20px;display:flex}.jbF1yq_menuItem:hover:not(:disabled),.jbF1yq_menuItem:focus-visible:not(:disabled){background:var(--menu-hover);outline:none}.jbF1yq_menuItem:disabled{opacity:.4;cursor:default}.jbF1yq_menuIcon{width:14px;height:14px;color:var(--menu-text-3);flex:none;justify-content:center;align-items:center;display:inline-flex}.jbF1yq_menuIcon svg{width:14px;height:14px}.jbF1yq_menuLabel{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.jbF1yq_menuItemDanger,.jbF1yq_menuItemDanger .jbF1yq_menuIcon{color:var(--menu-danger)}.jbF1yq_menuItemDanger:hover:not(:disabled),.jbF1yq_menuItemDanger:focus-visible:not(:disabled){background:var(--menu-danger-hover)}.jbF1yq_sourceCard{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);flex-direction:column;gap:4px;padding:12px 14px;font-size:12px;line-height:18px;display:flex}.jbF1yq_sourceCardTitle{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.jbF1yq_dialogOverlay{z-index:50;background:var(--dsw-alias-bg-mask-1,#0006);-webkit-backdrop-filter:blur(2px);justify-content:center;align-items:center;padding:24px;display:flex;position:fixed;inset:0}.jbF1yq_dialog{background:var(--dsw-alias-bg-layer-2,#fff);min-width:min(320px,100%);max-width:380px;color:var(--hub-text);border-radius:var(--dsw-radius-lg,16px);box-shadow:var(--hub-elevation);padding:18px 18px 14px}.jbF1yq_dialogTitle{margin:0 0 8px;font-size:15px;font-weight:600;line-height:22px}.jbF1yq_dialogText{color:var(--hub-text-3);margin:0 0 10px;font-size:13px;line-height:20px}.jbF1yq_dialogList{flex-direction:column;gap:5px;max-height:200px;margin:0 0 14px;padding:0;list-style:none;display:flex;overflow:auto}.jbF1yq_dialogList li{opacity:.85;word-break:break-all;font-size:13px;line-height:20px}.jbF1yq_dialogActions{justify-content:flex-end;gap:8px;display:flex}.jbF1yq_dialogWide{width:100%;max-width:560px;max-height:calc(100vh - 48px);overflow:auto}.jbF1yq_filterBar .jbF1yq_search{flex:1;min-width:200px}.jbF1yq_filterBar .jbF1yq_formLabel{flex:none}.jbF1yq_filterBar .jbF1yq_select{flex:none;max-width:160px}.jbF1yq_filterBar .jbF1yq_segmented{flex:none}.jbF1yq_grow{flex:1}.jbF1yq_hintLine{color:var(--hub-text-3);margin:0;font-size:12px;line-height:18px}.jbF1yq_hintPadded{margin:6px 12px 2px}.jbF1yq_hintInline{margin:4px 2px}.jbF1yq_rowMuted{cursor:default;opacity:.55}.jbF1yq_actionsPadded{padding:8px 12px}.jbF1yq_actionsTop{margin-top:8px}.jbF1yq_groupTime{margin-left:6px}.jbF1yq_sectionHeadRow{align-items:center;gap:8px;display:flex}.jbF1yq_sectionTitleFill{flex:1}.jbF1yq_dialogSelect{width:100%;margin-bottom:12px}.jbF1yq_dialogRow{align-items:center;gap:8px;display:flex}.jbF1yq_workspaceBox{align-items:center;gap:6px;display:inline-flex}.jbF1yq_workspaceInput{width:200px;height:32px;font-size:13px}.jbF1yq_projectNest{flex-direction:column;gap:8px;margin:0 0 0 14px;display:flex;position:relative}.jbF1yq_projectNest:before{content:\"\";background:var(--hub-border);width:.5px;position:absolute;top:0;bottom:0;left:-7px}.jbF1yq_scanList{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);background:0 0;max-height:360px;margin-top:8px;overflow:auto}.jbF1yq_board{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);padding:10px 14px 12px}.jbF1yq_warnBanner{color:var(--hub-text);background:var(--dsw-alias-state-warn-tertiary,#fef5e7);border-radius:var(--dsw-radius-md,12px);align-items:flex-start;gap:8px;padding:10px 14px;font-size:13px;line-height:20px;display:flex}.jbF1yq_scanProgressTrack{background:var(--hub-surface);border-radius:4px;flex:1;height:6px;overflow:hidden}.jbF1yq_scanProgressFill{background:var(--hub-brand);height:100%;transition:width .2s}.jbF1yq_filterPanel{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);flex-wrap:wrap;align-items:center;gap:12px;padding:12px;display:flex}.jbF1yq_filterField{align-items:center;gap:6px;display:inline-flex}.jbF1yq_filterField .jbF1yq_formLabel{margin:0}.jbF1yq_filterField .jbF1yq_select{max-width:160px}.jbF1yq_opBtn:focus-visible,.jbF1yq_button:focus-visible,.jbF1yq_segBtn:focus-visible,.jbF1yq_disclosure:focus-visible,.jbF1yq_filterTab:focus-visible,.jbF1yq_switch:focus-visible,.jbF1yq_back:focus-visible,.jbF1yq_statusWrap:focus-visible,.jbF1yq_input:focus-visible,.jbF1yq_select:focus-visible,.jbF1yq_search:focus-visible,.jbF1yq_sourceLink:focus-visible{outline:var(--hub-focus-width) solid var(--hub-focus);outline-offset:2px}.jbF1yq_skeleton{flex-direction:column;gap:8px;padding:12px 8px;display:flex}.jbF1yq_skeletonRow{background:var(--hub-skeleton);border-radius:7px;height:14px;animation:1.4s ease-in-out infinite jbF1yq_hubPulse}.jbF1yq_skeletonRow:nth-child(2){width:82%}.jbF1yq_skeletonRow:nth-child(3){width:64%}@keyframes jbF1yq_hubPulse{0%,to{opacity:.55}50%{opacity:1}}@media (prefers-reduced-motion:reduce){.jbF1yq_panel *,.jbF1yq_panel :before,.jbF1yq_panel :after{transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}.jbF1yq_tokenBlock{flex-direction:column;align-items:flex-start;gap:6px;display:flex}.jbF1yq_tokenHead{align-items:baseline;gap:8px;display:flex}.jbF1yq_tokenTitle{color:var(--hub-text);font-size:13px;font-weight:600;line-height:20px}.jbF1yq_tokenTable{border-collapse:collapse;font-variant-numeric:tabular-nums;width:auto;font-size:12px;line-height:18px}.jbF1yq_tokenTable th{text-align:left;color:var(--hub-text-3);border-bottom:.5px solid var(--hub-border-2);white-space:nowrap;padding:0 0 6px;font-weight:500}.jbF1yq_tokenTable td{color:var(--hub-text-2);border-bottom:.5px solid var(--hub-border);vertical-align:baseline;white-space:nowrap;padding:6px 0}.jbF1yq_tokenTable tbody tr:last-child td{border-bottom:0}.jbF1yq_tokenTable th+th,.jbF1yq_tokenTable td+td{padding-left:28px}.jbF1yq_tokenNum{text-align:right;font-family:var(--hub-mono);color:var(--hub-text)}.jbF1yq_tokenFailed{color:var(--hub-danger)}.jbF1yq_tokenEmpty{color:var(--hub-text-3)}.jbF1yq_tokenManageRow td{padding-top:10px}.jbF1yq_tokenManageButton{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-sm,8px);gap:4px;height:26px;padding:0 8px;font-size:12px;line-height:18px}.jbF1yq_tokenManageButton:hover{border-color:var(--hub-text-3)}.jbF1yq_tokenManageChevron{color:var(--hub-text-3);flex:none;transition:transform .15s}.jbF1yq_tokenManageChevronOpen{transform:rotate(180deg)}.jbF1yq_tokenPicker{flex-direction:column;gap:4px;padding-top:6px;display:flex}.jbF1yq_tokenModelList{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.jbF1yq_tokenModelRow{color:var(--hub-text-2);white-space:nowrap;cursor:pointer;align-items:center;gap:6px;font-size:12px;line-height:18px;display:flex}.jbF1yq_tokenModelRow input{accent-color:var(--hub-brand);flex:none;margin:0}.jbF1yq_tokenModelName{color:var(--hub-text)}.jbF1yq_tokenModelMeta{color:var(--hub-text-3)}.jbF1yq_tokenManageError{color:var(--hub-danger);font-size:11px;line-height:16px}.jbF1yq_invocationCard{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);flex-direction:column;gap:6px;padding:12px 16px;display:flex}.jbF1yq_invocationHead{flex-wrap:wrap;align-items:baseline;gap:10px;display:flex}.jbF1yq_invocationTitle{font-size:13px;font-weight:600;line-height:20px}.jbF1yq_invocationReadonly{color:var(--hub-text-3);font-size:12px;line-height:18px}.jbF1yq_invocationRow{color:var(--hub-text);cursor:pointer;align-items:flex-start;gap:8px;font-size:13px;line-height:20px;display:flex}.jbF1yq_invocationRow input{accent-color:var(--hub-brand);flex:none;margin:2px 0 0}.jbF1yq_invocationRow:has(input:disabled){cursor:default;opacity:.55}.jbF1yq_invocationLabel{flex-direction:column;gap:1px;min-width:0;display:flex}.jbF1yq_invocationName{font-weight:500}.jbF1yq_invocationHint{color:var(--hub-text-3);font-size:12px;line-height:18px}.jbF1yq_agentsBar{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.jbF1yq_agentsPanel{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);flex-direction:column;gap:10px;padding:12px 14px;display:flex}.jbF1yq_agentsHint{color:var(--hub-text-3);margin:0;font-size:12px;line-height:18px}.jbF1yq_agentsChips{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.jbF1yq_agentsChip{background:var(--hub-hover);height:24px;color:var(--hub-text);font-family:var(--hub-mono);border-radius:999px;align-items:center;gap:2px;padding:0 4px 0 9px;font-size:12px;line-height:18px;display:inline-flex}.jbF1yq_agentsChipRemove{width:18px;height:18px;color:var(--hub-text-3);font:inherit;font-family:var(--hub-mono);cursor:pointer;background:0 0;border:0;border-radius:50%;padding:0;line-height:18px}.jbF1yq_agentsChipRemove:hover{background:var(--hub-surface);color:var(--hub-text)}.jbF1yq_agentsChipRemove:disabled{opacity:.45;cursor:default}.jbF1yq_agentsChipEmpty{color:var(--hub-text-4);font-size:12px;line-height:18px}.jbF1yq_agentsAddRow{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.jbF1yq_agentsInput{max-width:220px;height:28px}.jbF1yq_agentsEmpty{color:var(--hub-text-4);margin:0;padding:4px 8px;font-size:13px;line-height:21px}.jbF1yq_agentPath{color:var(--hub-text-3);font-family:var(--hub-mono);word-break:break-all;margin-top:2px;font-size:12px;line-height:18px}.jbF1yq_agentsGroup+.jbF1yq_agentsGroup{border-top:.5px solid var(--hub-border-2);margin-top:2px;padding-top:16px}.jbF1yq_detailSub{font-family:var(--hub-mono);color:var(--hub-text-3);word-break:break-all;font-size:13px;line-height:20px}.jbF1yq_editBlock{flex-direction:column;gap:10px;display:flex}.jbF1yq_editArea{box-sizing:border-box;resize:none;width:100%;max-height:62vh;font-family:var(--hub-mono);white-space:pre-wrap;word-break:break-word;background:var(--hub-layer);border:.5px solid var(--hub-border);border-radius:var(--dsw-radius-lg,16px);color:var(--hub-text);outline:none;padding:14px 16px;font-size:12px;line-height:1.6;transition:border-color .15s;display:block;overflow:auto}.jbF1yq_editArea:focus{border-color:var(--hub-accent)}.jbF1yq_editBar{align-items:center;gap:8px;display:flex}.jbF1yq_editHint{color:var(--hub-text-3);font-size:12px;line-height:18px}.jbF1yq_editError{color:var(--hub-danger);font-size:12px;line-height:18px}.jbF1yq_editNotice{color:var(--hub-text-2);font-size:12px;line-height:18px}.jbF1yq_mcpBar{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.jbF1yq_mcpSummary{color:var(--hub-text-3);font-size:12px;line-height:18px}.jbF1yq_mcpRow{border-radius:var(--dsw-radius-md,12px);flex-direction:column;gap:3px;padding:8px;transition:background .12s;display:flex}.jbF1yq_mcpRow:hover{background:var(--hub-hover)}.jbF1yq_mcpHead{align-items:center;gap:10px;min-width:0;display:flex}.jbF1yq_mcpName{white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:500;line-height:22px;overflow:hidden}.jbF1yq_mcpRowDisabled .jbF1yq_mcpName{color:var(--hub-text-3)}.jbF1yq_mcpToolCount{color:var(--hub-text-3);flex:none;font-size:12px;line-height:18px}.jbF1yq_mcpTarget{font-family:var(--hub-mono);color:var(--hub-text-3);white-space:nowrap;text-overflow:ellipsis;padding-left:22px;font-size:11.5px;line-height:16px;overflow:hidden}.jbF1yq_mcpReason{color:var(--hub-text-3);padding-left:22px;font-size:12px;line-height:18px}.jbF1yq_mcpDetail{border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-md,12px);background:var(--hub-layer);flex-direction:column;gap:6px;margin:4px 0 2px 22px;padding:10px 12px;display:flex}.jbF1yq_mcpMetaLine{align-items:flex-start;gap:10px;font-size:12px;line-height:18px;display:flex}.jbF1yq_mcpMetaLabel{width:92px;color:var(--hub-text-3);flex:none}.jbF1yq_mcpMetaValue{min-width:0;color:var(--hub-text-2);word-break:break-all}.jbF1yq_mcpMono{font-family:var(--hub-mono);font-size:11.5px;line-height:16px}.jbF1yq_mcpSecrets{flex-direction:column;gap:2px;display:flex}.jbF1yq_mcpSecretToggle{background:var(--hub-surface);height:18px;color:var(--hub-text-2);cursor:pointer;border:0;border-radius:999px;margin-right:8px;padding:0 6px;font-size:11px;line-height:17px}.jbF1yq_mcpSecretToggle:hover{background:var(--hub-hover);color:var(--hub-text)}.jbF1yq_mcpTools{flex-direction:column;gap:6px;display:flex}.jbF1yq_mcpTool{flex-direction:column;gap:1px;display:flex}.jbF1yq_mcpToolName{font-family:var(--hub-mono);color:var(--hub-text);font-size:11.5px;line-height:16px}.jbF1yq_mcpToolDesc{color:var(--hub-text-2);font-size:12px;line-height:17px}.jbF1yq_mcpToolParams{color:var(--hub-text-3);font-size:11.5px;line-height:16px}.jbF1yq_mcpToolEmpty{color:var(--hub-text-4);font-size:12px;line-height:18px}.jbF1yq_mcpOrphans{flex-direction:column;gap:4px;display:flex}.jbF1yq_mcpRowActions{flex:none;align-items:center;gap:4px;display:flex}.jbF1yq_mcpRowAction{border-radius:var(--dsw-radius-sm,8px);height:24px;color:var(--hub-text-2);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border:.5px solid #0000;padding:0 8px;font-size:12px;line-height:22px;transition:background .15s,color .15s}.jbF1yq_mcpRowAction:hover:not(:disabled){background:var(--hub-surface);color:var(--hub-text)}.jbF1yq_mcpRowAction:disabled{opacity:.45;cursor:default}.jbF1yq_mcpForm{flex-direction:column;gap:10px;display:flex}.jbF1yq_mcpField{flex-direction:column;gap:4px;min-width:0;display:flex}.jbF1yq_mcpFieldLabel{color:var(--hub-text-2);font-size:12px;line-height:18px}.jbF1yq_mcpInput,.jbF1yq_mcpTextarea{box-sizing:border-box;width:100%;font:inherit;color:var(--hub-text);background:var(--hub-surface);border:.5px solid var(--hub-border-2);border-radius:var(--dsw-radius-sm,8px);padding:5px 8px;font-size:13px;line-height:20px}.jbF1yq_mcpTextarea{resize:vertical;font-family:var(--hub-mono);font-size:12px;line-height:18px}.jbF1yq_mcpInput:focus-visible,.jbF1yq_mcpTextarea:focus-visible{outline:2px solid var(--hub-brand);outline-offset:1px}.jbF1yq_mcpInputError{border-color:var(--hub-danger)}.jbF1yq_mcpHint{color:var(--hub-text-3);font-size:11.5px;line-height:16px}.jbF1yq_mcpFieldError{color:var(--hub-danger);font-size:11.5px;line-height:16px}.jbF1yq_mcpFormRow{gap:10px;display:flex}.jbF1yq_mcpFormRow .jbF1yq_mcpField{flex:1}.jbF1yq_mcpCheck{align-items:center;gap:8px;font-size:13px;line-height:20px;display:flex}";
		const tagId = "dsh-skill-hub/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-skill-hub";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"about": "jbF1yq_about",
			"aboutCard": "jbF1yq_aboutCard",
			"aboutControl": "jbF1yq_aboutControl",
			"aboutLink": "jbF1yq_aboutLink",
			"aboutRow": "jbF1yq_aboutRow",
			"aboutRowDesc": "jbF1yq_aboutRowDesc",
			"aboutRowText": "jbF1yq_aboutRowText",
			"aboutRowTitle": "jbF1yq_aboutRowTitle",
			"aboutTitle": "jbF1yq_aboutTitle",
			"aboutValue": "jbF1yq_aboutValue",
			"actions": "jbF1yq_actions",
			"actionsPadded": "jbF1yq_actionsPadded",
			"actionsTop": "jbF1yq_actionsTop",
			"agentPath": "jbF1yq_agentPath",
			"agentsAddRow": "jbF1yq_agentsAddRow",
			"agentsBar": "jbF1yq_agentsBar",
			"agentsChip": "jbF1yq_agentsChip",
			"agentsChipEmpty": "jbF1yq_agentsChipEmpty",
			"agentsChipRemove": "jbF1yq_agentsChipRemove",
			"agentsChips": "jbF1yq_agentsChips",
			"agentsEmpty": "jbF1yq_agentsEmpty",
			"agentsGroup": "jbF1yq_agentsGroup",
			"agentsHint": "jbF1yq_agentsHint",
			"agentsInput": "jbF1yq_agentsInput",
			"agentsPanel": "jbF1yq_agentsPanel",
			"back": "jbF1yq_back",
			"badge": "jbF1yq_badge",
			"badgeCount": "jbF1yq_badgeCount",
			"badgeReadonly": "jbF1yq_badgeReadonly",
			"badgeSource": "jbF1yq_badgeSource",
			"badges": "jbF1yq_badges",
			"board": "jbF1yq_board",
			"button": "jbF1yq_button",
			"buttons": "jbF1yq_buttons",
			"chevron": "jbF1yq_chevron",
			"chevronCollapsed": "jbF1yq_chevronCollapsed",
			"danger": "jbF1yq_danger",
			"detailContent": "jbF1yq_detailContent",
			"detailHead": "jbF1yq_detailHead",
			"detailMeta": "jbF1yq_detailMeta",
			"detailMetaLine": "jbF1yq_detailMetaLine",
			"detailName": "jbF1yq_detailName",
			"detailSub": "jbF1yq_detailSub",
			"diagPath": "jbF1yq_diagPath",
			"diagReason": "jbF1yq_diagReason",
			"diagRow": "jbF1yq_diagRow",
			"dialog": "jbF1yq_dialog",
			"dialogActions": "jbF1yq_dialogActions",
			"dialogList": "jbF1yq_dialogList",
			"dialogOverlay": "jbF1yq_dialogOverlay",
			"dialogRow": "jbF1yq_dialogRow",
			"dialogSelect": "jbF1yq_dialogSelect",
			"dialogText": "jbF1yq_dialogText",
			"dialogTitle": "jbF1yq_dialogTitle",
			"dialogWide": "jbF1yq_dialogWide",
			"disclosure": "jbF1yq_disclosure",
			"displayName": "jbF1yq_displayName",
			"dot": "jbF1yq_dot",
			"dotModel": "jbF1yq_dotModel",
			"dotUser": "jbF1yq_dotUser",
			"dots": "jbF1yq_dots",
			"editArea": "jbF1yq_editArea",
			"editBar": "jbF1yq_editBar",
			"editBlock": "jbF1yq_editBlock",
			"editError": "jbF1yq_editError",
			"editHint": "jbF1yq_editHint",
			"editNotice": "jbF1yq_editNotice",
			"empty": "jbF1yq_empty",
			"errorBanner": "jbF1yq_errorBanner",
			"filterBar": "jbF1yq_filterBar",
			"filterField": "jbF1yq_filterField",
			"filterPanel": "jbF1yq_filterPanel",
			"filterTab": "jbF1yq_filterTab",
			"filterTabActive": "jbF1yq_filterTabActive",
			"filterTabs": "jbF1yq_filterTabs",
			"form": "jbF1yq_form",
			"formError": "jbF1yq_formError",
			"formLabel": "jbF1yq_formLabel",
			"formRow": "jbF1yq_formRow",
			"formSuccess": "jbF1yq_formSuccess",
			"groupHead": "jbF1yq_groupHead",
			"groupOps": "jbF1yq_groupOps",
			"groupTime": "jbF1yq_groupTime",
			"groupTitle": "jbF1yq_groupTitle",
			"groupTitleInner": "jbF1yq_groupTitleInner",
			"grow": "jbF1yq_grow",
			"headingMeta": "jbF1yq_headingMeta",
			"hint": "jbF1yq_hint",
			"hintInline": "jbF1yq_hintInline",
			"hintLine": "jbF1yq_hintLine",
			"hintPadded": "jbF1yq_hintPadded",
			"hubPulse": "jbF1yq_hubPulse",
			"iconBtn": "jbF1yq_iconBtn",
			"input": "jbF1yq_input",
			"invocationCard": "jbF1yq_invocationCard",
			"invocationHead": "jbF1yq_invocationHead",
			"invocationHint": "jbF1yq_invocationHint",
			"invocationLabel": "jbF1yq_invocationLabel",
			"invocationName": "jbF1yq_invocationName",
			"invocationReadonly": "jbF1yq_invocationReadonly",
			"invocationRow": "jbF1yq_invocationRow",
			"invocationTitle": "jbF1yq_invocationTitle",
			"legend": "jbF1yq_legend",
			"legendHint": "jbF1yq_legendHint",
			"legendItem": "jbF1yq_legendItem",
			"list": "jbF1yq_list",
			"mcpBar": "jbF1yq_mcpBar",
			"mcpCheck": "jbF1yq_mcpCheck",
			"mcpDetail": "jbF1yq_mcpDetail",
			"mcpField": "jbF1yq_mcpField",
			"mcpFieldError": "jbF1yq_mcpFieldError",
			"mcpFieldLabel": "jbF1yq_mcpFieldLabel",
			"mcpForm": "jbF1yq_mcpForm",
			"mcpFormRow": "jbF1yq_mcpFormRow",
			"mcpHead": "jbF1yq_mcpHead",
			"mcpHint": "jbF1yq_mcpHint",
			"mcpInput": "jbF1yq_mcpInput",
			"mcpInputError": "jbF1yq_mcpInputError",
			"mcpMetaLabel": "jbF1yq_mcpMetaLabel",
			"mcpMetaLine": "jbF1yq_mcpMetaLine",
			"mcpMetaValue": "jbF1yq_mcpMetaValue",
			"mcpMono": "jbF1yq_mcpMono",
			"mcpName": "jbF1yq_mcpName",
			"mcpOrphans": "jbF1yq_mcpOrphans",
			"mcpReason": "jbF1yq_mcpReason",
			"mcpRow": "jbF1yq_mcpRow",
			"mcpRowAction": "jbF1yq_mcpRowAction",
			"mcpRowActions": "jbF1yq_mcpRowActions",
			"mcpRowDisabled": "jbF1yq_mcpRowDisabled",
			"mcpSecretToggle": "jbF1yq_mcpSecretToggle",
			"mcpSecrets": "jbF1yq_mcpSecrets",
			"mcpSummary": "jbF1yq_mcpSummary",
			"mcpTarget": "jbF1yq_mcpTarget",
			"mcpTextarea": "jbF1yq_mcpTextarea",
			"mcpTool": "jbF1yq_mcpTool",
			"mcpToolCount": "jbF1yq_mcpToolCount",
			"mcpToolDesc": "jbF1yq_mcpToolDesc",
			"mcpToolEmpty": "jbF1yq_mcpToolEmpty",
			"mcpToolName": "jbF1yq_mcpToolName",
			"mcpToolParams": "jbF1yq_mcpToolParams",
			"mcpTools": "jbF1yq_mcpTools",
			"menuCard": "jbF1yq_menuCard",
			"menuIcon": "jbF1yq_menuIcon",
			"menuItem": "jbF1yq_menuItem",
			"menuItemDanger": "jbF1yq_menuItemDanger",
			"menuLabel": "jbF1yq_menuLabel",
			"menuTrigger": "jbF1yq_menuTrigger",
			"menuTriggerOpen": "jbF1yq_menuTriggerOpen",
			"opBtn": "jbF1yq_opBtn",
			"opBtnActive": "jbF1yq_opBtnActive",
			"opDanger": "jbF1yq_opDanger",
			"pageHeading": "jbF1yq_pageHeading",
			"pageShell": "jbF1yq_pageShell",
			"panel": "jbF1yq_panel",
			"placeholder": "jbF1yq_placeholder",
			"placeholderBody": "jbF1yq_placeholderBody",
			"placeholderTitle": "jbF1yq_placeholderTitle",
			"primary": "jbF1yq_primary",
			"projectNest": "jbF1yq_projectNest",
			"row": "jbF1yq_row",
			"rowDesc": "jbF1yq_rowDesc",
			"rowMain": "jbF1yq_rowMain",
			"rowMenu": "jbF1yq_rowMenu",
			"rowMenuOpen": "jbF1yq_rowMenuOpen",
			"rowMuted": "jbF1yq_rowMuted",
			"rowName": "jbF1yq_rowName",
			"rowNameText": "jbF1yq_rowNameText",
			"rowStatic": "jbF1yq_rowStatic",
			"scanList": "jbF1yq_scanList",
			"scanProgressFill": "jbF1yq_scanProgressFill",
			"scanProgressTrack": "jbF1yq_scanProgressTrack",
			"scrollArea": "jbF1yq_scrollArea",
			"search": "jbF1yq_search",
			"section": "jbF1yq_section",
			"sectionHead": "jbF1yq_sectionHead",
			"sectionHeadRow": "jbF1yq_sectionHeadRow",
			"sectionTitle": "jbF1yq_sectionTitle",
			"sectionTitleFill": "jbF1yq_sectionTitleFill",
			"segBtn": "jbF1yq_segBtn",
			"segBtnActive": "jbF1yq_segBtnActive",
			"segmented": "jbF1yq_segmented",
			"select": "jbF1yq_select",
			"skeleton": "jbF1yq_skeleton",
			"skeletonRow": "jbF1yq_skeletonRow",
			"sm": "jbF1yq_sm",
			"sourceCard": "jbF1yq_sourceCard",
			"sourceCardTitle": "jbF1yq_sourceCardTitle",
			"sourceLink": "jbF1yq_sourceLink",
			"statusBadge": "jbF1yq_statusBadge",
			"statusBadges": "jbF1yq_statusBadges",
			"statusButton": "jbF1yq_statusButton",
			"statusError": "jbF1yq_statusError",
			"statusOk": "jbF1yq_statusOk",
			"statusUpdated": "jbF1yq_statusUpdated",
			"statusWrap": "jbF1yq_statusWrap",
			"subbar": "jbF1yq_subbar",
			"successBanner": "jbF1yq_successBanner",
			"switch": "jbF1yq_switch",
			"switchOn": "jbF1yq_switchOn",
			"switchThumb": "jbF1yq_switchThumb",
			"title": "jbF1yq_title",
			"tokenBlock": "jbF1yq_tokenBlock",
			"tokenEmpty": "jbF1yq_tokenEmpty",
			"tokenFailed": "jbF1yq_tokenFailed",
			"tokenHead": "jbF1yq_tokenHead",
			"tokenManageButton": "jbF1yq_tokenManageButton",
			"tokenManageChevron": "jbF1yq_tokenManageChevron",
			"tokenManageChevronOpen": "jbF1yq_tokenManageChevronOpen",
			"tokenManageError": "jbF1yq_tokenManageError",
			"tokenManageRow": "jbF1yq_tokenManageRow",
			"tokenModelList": "jbF1yq_tokenModelList",
			"tokenModelMeta": "jbF1yq_tokenModelMeta",
			"tokenModelName": "jbF1yq_tokenModelName",
			"tokenModelRow": "jbF1yq_tokenModelRow",
			"tokenNum": "jbF1yq_tokenNum",
			"tokenPicker": "jbF1yq_tokenPicker",
			"tokenTable": "jbF1yq_tokenTable",
			"tokenTitle": "jbF1yq_tokenTitle",
			"useCount": "jbF1yq_useCount",
			"useTime": "jbF1yq_useTime",
			"warnBanner": "jbF1yq_warnBanner",
			"widthHandle": "jbF1yq_widthHandle",
			"workspaceBox": "jbF1yq_workspaceBox",
			"workspaceInput": "jbF1yq_workspaceInput"
		};
		// src/client/panel/PanelWidthControls.tsx
		/**
		* PanelWidthControls — reusable transcript-width mechanism for the skill-hub
		* panel, adapted from dsh's official ConversationWidthControls
		* (packages/client/ui-conversation/src/client/skeleton/
		* ConversationWidthControls.tsx, MIT License, Copyright (c) 2026 DeepSeek —
		* see THIRD_PARTY_NOTICES.md).
		*
		* Differences from the original:
		*  - no factory-slot coupling: plain props (container ref + always active);
		*  - its own localStorage key, so the chat page's preference is untouched;
		*  - the wheel-forward target is our own [data-hub-scroll] scroller;
		*  - the min width is 480 (denser panel content than the chat column).
		*
		* Mechanism (mirrors the original): two invisible absolute strips flanking
		* the centered content column; pointer capture + rAF-throttled drag reports
		* outward dx * 2 (drag one side, the centered column widens on both), the
		* resolved width is published as --hub-user-width on the shell, persisted to
		* localStorage on commit, and a ResizeObserver re-publishes on window
		* resizes. A hover/drag glow bar follows the pointer's Y.
		*/
		/** localStorage key for the dragged panel width preference (px). */
		const WIDTH_PREF_KEY = "dsh.skill-hub.panelWidth";
		/** Floor for a dragged content width; the panel stays readable below the chat column's 640. */
		const CONTENT_MIN = 480;
		/** Default content width: the built-in pages' 960px column (ui-plugin-manager / ui-schedule). */
		const CONTENT_DEFAULT = 960;
		/** Horizontal room reserved for both handles and their safe edge zones. */
		const CONTENT_EDGE_BUDGET = 176;
		const WHEEL_DELTA_LINE = 1;
		const WHEEL_DELTA_PAGE = 2;
		const FALLBACK_WHEEL_LINE_PX = 16;
		/** Read a valid persisted width preference, or null when absent or corrupt. */
		function readWidthPreference() {
			const raw = localStorage.getItem(WIDTH_PREF_KEY);
			if (raw === null) return null;
			const value = Number(raw);
			return Number.isFinite(value) && value > 0 ? value : null;
		}
		/** Resolve the width displayed for one measured shell width. */
		function resolveContentWidth(shellWidth, preference) {
			const max = Math.max(CONTENT_MIN, shellWidth - CONTENT_EDGE_BUDGET);
			if (preference !== null) return Math.min(Math.max(preference, CONTENT_MIN), max);
			return Math.min(CONTENT_DEFAULT, max);
		}
		/** Convert a wheel event's vertical delta to scrollport pixels. */
		function wheelDeltaY(event, scrollport) {
			if (event.deltaMode === WHEEL_DELTA_LINE) {
				const lineHeight = Number.parseFloat(getComputedStyle(scrollport).lineHeight);
				return event.deltaY * (Number.isFinite(lineHeight) ? lineHeight : FALLBACK_WHEEL_LINE_PX);
			}
			if (event.deltaMode === WHEEL_DELTA_PAGE) return event.deltaY * scrollport.clientHeight;
			return event.deltaY;
		}
		/** One pointer-captured panel width handle. */
		function WidthHandle(props) {
			const dragging = (0, react.useRef)(false);
			const base = (0, react.useRef)(0);
			const origin = (0, react.useRef)(0);
			const latest = (0, react.useRef)(0);
			const frame = (0, react.useRef)(null);
			const callbacks = (0, react.useRef)(props);
			callbacks.current = props;
			const outwardWidth = () => {
				const dx = latest.current - origin.current;
				const outward = callbacks.current.side === "right" ? dx : -dx;
				return base.current + outward * 2;
			};
			const cancelFrame = () => {
				if (frame.current !== null) {
					cancelAnimationFrame(frame.current);
					frame.current = null;
				}
			};
			const onPointerDown = (0, react.useCallback)((event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				event.currentTarget.setPointerCapture(event.pointerId);
				origin.current = event.clientX;
				latest.current = event.clientX;
				base.current = callbacks.current.onStart();
				dragging.current = true;
				event.currentTarget.toggleAttribute("data-dragging", true);
			}, []);
			const onPointerMove = (0, react.useCallback)((event) => {
				if (!dragging.current) return;
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				const box = event.currentTarget.getBoundingClientRect();
				event.currentTarget.style.setProperty("--hub-width-handle-pointer-y", `${event.clientY - box.top}px`);
				latest.current = event.clientX;
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					callbacks.current.onDrag(outwardWidth());
				});
			}, []);
			const onPointerUp = (0, react.useCallback)((event) => {
				if (!dragging.current) return;
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				dragging.current = false;
				event.currentTarget.toggleAttribute("data-dragging", false);
				event.currentTarget.releasePointerCapture(event.pointerId);
				cancelFrame();
				latest.current = event.clientX;
				if (latest.current !== origin.current) callbacks.current.onCommit(outwardWidth());
				callbacks.current.onEnd();
			}, []);
			const onPointerCancel = (0, react.useCallback)((event) => {
				if (!dragging.current) return;
				dragging.current = false;
				event.currentTarget.toggleAttribute("data-dragging", false);
				cancelFrame();
				callbacks.current.onEnd();
			}, []);
			const onWheel = (0, react.useCallback)((event) => {
				const shell = event.currentTarget.parentElement;
				if (shell === null) return;
				const scrollport = shell.querySelector(":scope > [data-hub-scroll]");
				if (scrollport === null) return;
				if (event.ctrlKey || event.deltaY === 0) return;
				scrollport.scrollBy({ top: wheelDeltaY(event, scrollport) });
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.widthHandle,
				"data-side": props.side,
				onPointerDown,
				onPointerMove,
				onPointerUp,
				onPointerCancel,
				onLostPointerCapture: onPointerCancel,
				onWheel
			});
		}
		/**
		* Install the panel width axis and render its drag handles.
		* @param props - Mounted shell element (the scroll container's parent).
		* @returns two width handles.
		*/
		function PanelWidthControls(props) {
			const { container } = props;
			const publishWidths = (0, react.useCallback)((shell) => {
				const target = shell.parentElement ?? shell;
				const width = shell.offsetWidth;
				target.style.setProperty("--hub-column-width", `${width}px`);
				const preference = readWidthPreference();
				if (preference === null) target.style.removeProperty("--hub-user-width");
				else target.style.setProperty("--hub-user-width", `${resolveContentWidth(width, preference)}px`);
			}, []);
			(0, react.useLayoutEffect)(() => {
				if (container === null) return;
				const observer = new ResizeObserver(() => {
					publishWidths(container);
				});
				observer.observe(container);
				publishWidths(container);
				return () => {
					observer.disconnect();
				};
			}, [container, publishWidths]);
			const onStart = (0, react.useCallback)(() => {
				if (container === null) return CONTENT_DEFAULT;
				return resolveContentWidth(container.offsetWidth, readWidthPreference());
			}, [container]);
			const onDrag = (0, react.useCallback)((width) => {
				if (container === null) return;
				(container.parentElement ?? container).style.setProperty("--hub-user-width", `${resolveContentWidth(container.offsetWidth, width)}px`);
			}, [container]);
			const onCommit = (0, react.useCallback)((width) => {
				if (container === null) return;
				localStorage.setItem(WIDTH_PREF_KEY, `${resolveContentWidth(container.offsetWidth, width)}`);
			}, [container]);
			const onEnd = (0, react.useCallback)(() => {
				if (container !== null) publishWidths(container);
			}, [container, publishWidths]);
			if (container === null) return null;
			return ["left", "right"].map((side) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WidthHandle, {
				side,
				onStart,
				onDrag,
				onCommit,
				onEnd
			}, side));
		}
		// src/client/panel/AboutView.tsx
		/** 本插件的仓库地址（package.json 的 repository/homepage）。 */
		const REPO_URL = "https://github.com/iBobbyTS/dsh-custom-instruction-manager";
		function AboutView(props) {
			const { version, status, checking, releaseUrl, latestVersion, onCheck } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.about,
				"aria-labelledby": "hub-about-title",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: panel_module_css_default.aboutTitle,
					id: "hub-about-title",
					children: tt("about.title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.aboutCard,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.aboutRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.aboutRowText,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.aboutRowTitle,
									children: tt("about.plugin")
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.aboutControl,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.aboutValue,
									children: tt("about.pluginName")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: panel_module_css_default.aboutLink,
									href: REPO_URL,
									target: "_blank",
									rel: "noreferrer",
									children: "GitHub"
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.aboutRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.aboutRowText,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.aboutRowTitle,
									children: tt("about.version")
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.aboutValue,
								children: version !== null ? "v" + version : tt("about.unknownVersion")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.aboutRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.aboutRowText,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.aboutRowTitle,
									children: tt("about.update")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.aboutRowDesc,
									children: status ?? tt("about.idle")
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.aboutControl,
								children: [releaseUrl !== null && latestVersion !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: panel_module_css_default.aboutLink,
									href: releaseUrl,
									target: "_blank",
									rel: "noreferrer",
									children: tt("update.newVersion", { version: latestVersion })
								}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.button,
									disabled: checking,
									onClick: onCheck,
									children: checking ? tt("update.checking") : tt("update.check")
								})]
							})]
						})
					]
				})]
			});
		}
		// src/client/panel/AgentsView.tsx
		/**
		* AGENTS.md 页：只读的指令文件清单。
		*
		* 分组标题是「用户级」+ 每个工作区（没有单独的「项目级」层），组内一行一个
		* 文件：大标题是真实文件名，副标题是从项目文件夹父目录算起的路径
		* （`lmdo-website`、`lmdo-website/docs`）。没有候选文件的分组保留标题，
		* 下面一行灰字「无 AGENTS.md」。
		*
		* 排除目录的编辑入口放在这一页（不放「关于」）：它是本页扫描的剪枝清单，
		* 默认 `.agent-work`，保存走 /config 并立即重扫。
		*/
		/** 目录名合法性：非空、不含路径分隔符（与 host 侧 /config 的校验一致）。 */
		function normalizeDirName(text) {
			const name = text.trim();
			if (name === "" || name.includes("/") || name.includes("\\")) return void 0;
			return name;
		}
		/** 扫描百分比：第 0 步之前 total 还是 0，按 0% 显示。 */
		function scanPercent(scan) {
			if (scan === null || scan.total <= 0) return 0;
			return Math.max(0, Math.min(100, Math.round(scan.done / scan.total * 100)));
		}
		function AgentsView(props) {
			const [editorOpen, setEditorOpen] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)("");
			const dirs = props.data?.excludeDirs ?? [];
			const scanning = props.scan !== null;
			const addDraft = () => {
				const name = normalizeDirName(draft);
				if (name === void 0) return;
				setDraft("");
				if (dirs.includes(name)) return;
				props.onSaveExcludeDirs([...dirs, name]);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.agentsBar,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: panel_module_css_default.opBtn + (editorOpen ? " " + panel_module_css_default.opBtnActive : ""),
						"aria-expanded": editorOpen,
						onClick: () => {
							setEditorOpen((open) => !open);
						},
						children: [
							tt("agents.exclude"),
							" (",
							dirs.length,
							")"
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn,
						disabled: scanning,
						onClick: props.onRefresh,
						children: scanning ? tt("agents.scanningPercent", { percent: scanPercent(props.scan) }) : tt("agents.rescan")
					})]
				}),
				editorOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.agentsPanel,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.agentsHint,
							children: tt("agents.excludeHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.agentsChips,
							children: dirs.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.agentsChipEmpty,
								children: tt("agents.excludeEmpty")
							}) : dirs.map((dir) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.agentsChip,
								children: [dir, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.agentsChipRemove,
									title: tt("agents.remove"),
									"aria-label": tt("agents.remove") + " " + dir,
									disabled: props.saving,
									onClick: () => {
										props.onSaveExcludeDirs(dirs.filter((entry) => entry !== dir));
									},
									children: "×"
								})]
							}, dir))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.agentsAddRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.search + " " + panel_module_css_default.agentsInput,
									value: draft,
									placeholder: tt("agents.placeholder"),
									"aria-label": tt("agents.placeholder"),
									disabled: props.saving,
									onChange: (event) => {
										setDraft(event.target.value);
									},
									onKeyDown: (event) => {
										if (event.key === "Enter") addDraft();
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.button,
									disabled: props.saving || normalizeDirName(draft) === void 0 || dirs.includes(normalizeDirName(draft) ?? ""),
									onClick: addDraft,
									children: tt("agents.add")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									disabled: props.saving,
									onClick: () => {
										props.onSaveExcludeDirs(null);
									},
									children: tt("agents.reset")
								})
							]
						})
					]
				}) : null,
				props.error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.errorBanner,
					children: tt("agents.error", { error: props.error })
				}) : null,
				props.data === null && scanning ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: tt("agents.loading")
				}) : null,
				(props.data?.groups ?? []).map((group, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: panel_module_css_default.section + " " + panel_module_css_default.agentsGroup,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: panel_module_css_default.sectionTitle,
						children: group.kind === "user" ? tt("agents.user") : group.title ?? ""
					}), group.files.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.agentsEmpty,
						children: tt("agents.none")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.list,
						children: group.files.map((file, fileIndex) => {
							const scope = group.kind === "user" ? tt("agents.user") : group.title ?? "";
							const canOpen = file.absolute !== "" && file.absolute !== void 0;
							const open = () => {
								if (canOpen) props.onOpenFile(file, scope);
							};
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.row + (canOpen ? "" : " " + panel_module_css_default.rowStatic),
								role: canOpen ? "button" : void 0,
								tabIndex: canOpen ? 0 : void 0,
								title: file.absolute ?? file.path,
								onClick: open,
								onKeyDown: (event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									open();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.rowMain,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.rowName,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.rowNameText,
											children: file.name
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.agentPath,
										children: file.path
									})]
								})
							}, (file.absolute ?? file.path) + "\0" + fileIndex);
						})
					})]
				}, group.kind + "\0" + index))
			] });
		}
		// src/client/panel/EditBody.tsx
		/**
		* 详情页的正文区：没有单独的编辑态——可写文件的正文就是同一个框，直接改；
		* 下面固定一行「保存 / 放弃所有编辑」。
		*
		* 盒子与只读时完全一样（等宽、`.5px` 发丝边、圆角、内边距、最大 62vh 后内部
		* 滚动），高度跟随内容，不设任何编辑专用的高度或拖拽手柄。状态由面板持有，
		* 这里只收 props，所以每一种状态都能用 renderToStaticMarkup 直接断言。
		* ⌘S / Ctrl+S 在框里等同「保存」。
		*/
		/** 服务端渲染时 useLayoutEffect 会告警，退回 useEffect。 */
		const useIsomorphicLayoutEffect = typeof window === "undefined" ? react.useEffect : react.useLayoutEffect;
		function EditBody(props) {
			const { content, edit, label } = props;
			const area = (0, react.useRef)(null);
			useIsomorphicLayoutEffect(() => {
				const node = area.current;
				if (node === null) return;
				node.style.height = "auto";
				node.style.height = node.scrollHeight + "px";
			}, [edit.draft, edit.editable]);
			if (!edit.editable) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
				className: panel_module_css_default.detailContent,
				children: content
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editBlock,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						ref: area,
						className: panel_module_css_default.editArea,
						value: edit.draft,
						"aria-label": label,
						spellCheck: false,
						onChange: (event) => {
							edit.onDraft(event.target.value);
						},
						onKeyDown: (event) => {
							if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
								event.preventDefault();
								if (!edit.busy && edit.dirty) edit.onSave();
							}
						}
					}),
					edit.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.editError,
						role: "alert",
						children: edit.error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editBar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button + " " + panel_module_css_default.primary,
								disabled: edit.busy || !edit.dirty,
								onClick: edit.onSave,
								children: edit.busy ? tt("detail.editSaving") : tt("detail.editSave")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button,
								disabled: edit.busy || !edit.dirty,
								onClick: edit.onDiscard,
								children: tt("detail.editDiscardAll")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.editHint,
								children: tt("detail.editShortcut")
							})
						]
					})
				]
			});
		}
		// src/client/panel/TokenModelPicker.tsx
		function TokenModelPicker(props) {
			const { models, busyModel, onSelect, error } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.tokenPicker,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: panel_module_css_default.tokenModelList,
					children: models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: panel_module_css_default.tokenModelRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: model.selected,
								disabled: busyModel !== null,
								onChange: (event) => {
									onSelect(model.id, event.target.checked);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.tokenModelName,
								children: model.label
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.tokenModelMeta,
								children: busyModel === model.id ? tt(model.selected ? "tokens.removing" : "tokens.downloading") : model.installed ? tt("tokens.downloaded") : tt("tokens.sizeMb", { mb: model.vocabMb })
							})
						]
					}) }, model.id))
				}), error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.tokenManageError,
					children: error
				}) : null]
			});
		}
		// src/client/panel/TokenTable.tsx
		/**
		* Token 统计表：模型 / Tokens，最后一行是「管理模型」。
		*
		* 行的来源是宿主的选中集合（`models`），不是协议常量的全集：Kimi K3 默认不选，
		* 勾上才会出现在表格里。服务器列表还没回来时先按协议层的默认集合画行，避免
		* 打开详情页先空一下再跳。
		*
		* 没有状态列：没数出来就是 `-`；失败的那一行用红色，原因由 title 带出。
		* 「管理模型」展开后是原生 checkbox 列表（dsh 没有给插件用的多选组件），
		* 勾选即下载、取消即删除词表——由宿主执行，这里只发起与回填。
		*
		* 纯展示：数据与动作都由 useTokenCount / useTokenModels 给。
		*/
		/** 默认集合（协议层标记 preset 的模型），用于模型列表到达之前的占位行。 */
		const DEFAULT_ROWS = TOKEN_MODELS.filter((model) => model.preset).map((model) => ({
			id: model.id,
			label: model.label
		}));
		function TokenTable(props) {
			const { state, models, busyModel, onSelectModel, modelError } = props;
			const [open, setOpen] = (0, react.useState)(false);
			/** 展开后的多选容器：用来把第一个模型滚到视口中间。 */
			const pickerRef = (0, react.useRef)(null);
			/** 每次展开只居中一次；之后选择变化引起的重渲染不该再拽动滚动位置。 */
			const centered = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (!open) {
					centered.current = false;
					return;
				}
				if (centered.current) return;
				const first = pickerRef.current?.querySelector("li");
				if (first === null || first === void 0) return;
				centered.current = true;
				const scroller = first.closest("[data-hub-scroll]");
				if (!(scroller instanceof HTMLElement)) {
					first.scrollIntoView({ block: "center" });
					return;
				}
				const offset = first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
				const top = Math.max(0, offset - scroller.clientHeight / 2 + first.clientHeight / 2);
				scroller.scrollTo({
					top,
					behavior: "smooth"
				});
			}, [open, models]);
			const cellOf = (modelId) => {
				if (state.status !== "ready") return {
					text: "-",
					error: state.status === "failed" ? state.error : void 0
				};
				const entry = state.entries.find((item) => item.id === modelId);
				if (entry?.tokens === void 0) return {
					text: "-",
					error: entry?.error
				};
				return { text: entry.tokens.toLocaleString() };
			};
			const rows = models === null ? DEFAULT_ROWS : models.filter((model) => model.selected).map((model) => ({
				id: model.id,
				label: model.label
			}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.tokenBlock,
				"aria-label": tt("tokens.title"),
				"aria-busy": state.status === "loading",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.tokenHead,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.tokenTitle,
							children: tt("tokens.title")
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
						className: panel_module_css_default.tokenTable,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							scope: "col",
							children: tt("tokens.model")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
							scope: "col",
							className: panel_module_css_default.tokenNum,
							children: tt("tokens.tokens")
						})] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tbody", { children: [rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
							colSpan: 2,
							className: panel_module_css_default.tokenEmpty,
							children: tt("tokens.none")
						}) }) : rows.map((row) => {
							const cell = cellOf(row.id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: row.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								className: panel_module_css_default.tokenNum + (cell.error !== void 0 ? " " + panel_module_css_default.tokenFailed : ""),
								title: cell.error,
								children: cell.text
							})] }, row.id);
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tr", {
							className: panel_module_css_default.tokenManageRow,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								colSpan: 2,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: panel_module_css_default.opBtn + " " + panel_module_css_default.tokenManageButton,
									"aria-expanded": open,
									onClick: () => {
										setOpen((value) => !value);
									},
									children: [tt("tokens.manage"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, {
										size: 12,
										className: panel_module_css_default.tokenManageChevron + (open ? " " + panel_module_css_default.tokenManageChevronOpen : "")
									})]
								})
							})
						})] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: pickerRef,
						children: [open && models !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenModelPicker, {
							models,
							busyModel,
							onSelect: onSelectModel,
							error: modelError
						}) : null, open && models === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.tokenModelMeta,
							children: tt("tokens.loadingModels")
						}) : null]
					})
				]
			});
		}
		// src/client/panel/AgentFileDetailView.tsx
		/**
		* 指令文件详情页：和技能详情同构——返回列表、大标题是文件名、下面是元数据
		* （所属分组 / 绝对路径 / 大小 / 修改时间），最后是文件的原始正文。
		*
		* 正文默认只读（原样 `<pre>`，不渲染 Markdown，等宽字体保留缩进与列表）；
		* head 的「编辑」把正文区换成文本域（整份原文可改），保存直接写回磁盘。
		* 编辑状态由面板持有，这里只收 props。
		*/
		function AgentFileDetailView(props) {
			const { file, scope, detail, loading, error, tokenTable, edit, notice, onBack } = props;
			const [copied, setCopied] = (0, react.useState)(false);
			const timer = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				window.clearTimeout(timer.current);
			}, []);
			const copyPath = () => {
				copyTextToClipboard(file.absolute).then((ok) => {
					if (!ok) return;
					setCopied(true);
					window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => {
						setCopied(false);
					}, 1200);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.detailHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.back,
								onClick: onBack,
								children: tt("detail.back")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.detailName,
								children: file.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.actions,
								style: {
									marginLeft: "auto",
									gap: 6
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: copyPath,
									children: copied ? tt("detail.copied") : tt("detail.copyPath")
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.detailSub,
						children: file.path
					}),
					notice !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.editNotice,
						role: "status",
						children: notice
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.detailMeta,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("agents.scope"),
									": ",
									scope
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.path"),
									": ",
									file.absolute
								]
							}),
							detail !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("agents.size"),
									": ",
									formatBytes$1(detail.size)
								]
							}) : null,
							detail !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("agents.modifiedAt"),
									": ",
									formatDateTime(detail.modifiedAt)
								]
							}) : null
						]
					}),
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.errorBanner,
						children: tt("agents.readError", { error })
					}) : detail !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditBody, {
						content: detail.content,
						edit,
						label: tt("detail.editAgentFile")
					}) : loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.empty,
						children: tt("agents.reading")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenTable, { ...tokenTable })
				]
			});
		}
		// src/client/panel/InvocationDots.tsx
		function InvocationDots(props) {
			const { invocation, hubConfig } = props;
			if (!invocation.modelInvocable && !invocation.userInvocable) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: panel_module_css_default.dots,
				children: [invocation.modelInvocable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.dot + " " + panel_module_css_default.dotModel,
					style: dotStyle(hubConfig?.dotModelColor),
					title: tt("legend.model")
				}) : null, invocation.userInvocable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.dot + " " + panel_module_css_default.dotUser,
					style: dotStyle(hubConfig?.dotUserColor),
					title: tt("legend.user")
				}) : null]
			});
		}
		// src/client/panel/SourceStatusBadge.tsx
		function SourceStatusBadge(props) {
			const { check, checking, onCheck } = props;
			if (checking === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: panel_module_css_default.statusBadge,
				children: tt("source.checking")
			});
			if (check === void 0) {
				if (onCheck === void 0) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusButton,
					title: tt("source.checkHint"),
					onClick: onCheck,
					children: tt("source.check")
				});
			}
			const badges = (() => {
				if (check.error !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusError,
					children: tt("source.error")
				});
				if (check.throttled === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.statusBadge,
					children: tt("source.throttled")
				});
				if (check.unverified === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.statusBadge,
					children: tt("source.unverified")
				});
				if (check.changed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default.statusBadges,
					children: [check.updated.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusUpdated,
						children: tt("source.updated", { count: check.updated.length })
					}) : null, check.deleted.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusError,
						children: tt("source.deleted", { count: check.deleted.length })
					}) : null]
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusOk,
					children: tt("source.upToDate")
				});
			})();
			if (onCheck === void 0) return badges;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: panel_module_css_default.statusWrap,
				title: tt("source.checkHint"),
				onClick: onCheck,
				children: badges
			});
		}
		// src/client/panel/SkillDetailView.tsx
		/**
		* Full-page skill detail view: metadata, upstream source card with
		* check/sync/follow-delete actions, and the raw SKILL.md body. Pure
		* presentation — every state value and action arrives as a prop, so the
		* panel stays the single owner of state.
		*
		* The source card is the only place update information appears, and it is
		* rendered solely for skills recorded against an upstream repo (imported
		* from a market source or a direct repo address). Built-in, plugin-provided,
		* hand-placed and project skills have no upstream, so they get no update UI
		* at all rather than a "no update checks" note — an empty slot is honest,
		* a label turning every skill into a "personal skill" is not.
		*/
		function SkillDetailView(props) {
			const { detail, hubConfig, uses, sourcesState, sourceCheck, checkingSource, syncingSource, editable, invocationBusy, tokenTable, edit, notice, onInvocationChange, onBack, onCheck, onSync, onFollowDelete } = props;
			const detailSource = sourcesState?.sources.find((source) => source.skills.includes(detail.name));
			const detailCheck = detailSource !== void 0 ? sourceCheck[detailSource.repo] : void 0;
			/** 管理方：上游仓库优先；否则按技能根目录/注册表 provider 归类。 */
			const detailManaged = managedByOf({
				source: detail.source,
				provider: detail.provider
			}, sourcesState?.origins[detail.name]);
			const [copied, setCopied] = (0, react.useState)(null);
			const copyTimer = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				window.clearTimeout(copyTimer.current);
			}, []);
			const copyText = (text, key) => {
				copyTextToClipboard(text).then((ok) => {
					if (!ok) return;
					setCopied(key);
					window.clearTimeout(copyTimer.current);
					copyTimer.current = window.setTimeout(() => {
						setCopied(null);
					}, 1200);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.detailHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.back,
								onClick: onBack,
								children: tt("detail.back")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.detailName,
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									flexWrap: "wrap"
								},
								children: [
									detail.name,
									isDisplayNameDistinct(detail.name, detail.displayName) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.displayName,
										style: {
											fontSize: 13,
											marginLeft: 0
										},
										children: detail.displayName
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InvocationDots, {
										invocation: detail.invocation,
										hubConfig
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.actions,
								style: {
									marginLeft: "auto",
									gap: 6
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										copyText("$" + detail.name, "mention");
									},
									children: copied === "mention" ? tt("detail.copied") : tt("detail.copyMention")
								}), detail.path !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										const path = detail.path;
										if (path !== void 0) copyText(path, "path");
									},
									children: copied === "path" ? tt("detail.copied") : tt("detail.copyPath")
								}) : null]
							})
						]
					}),
					notice !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.editNotice,
						role: "status",
						children: notice
					}) : null,
					editable !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.invocationCard,
						"aria-label": tt("detail.invocation"),
						"aria-busy": invocationBusy,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.invocationHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.invocationTitle,
									children: tt("detail.invocation")
								}), !editable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.invocationReadonly,
									children: tt("detail.invocationReadonly")
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.invocationRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: detail.invocation.modelInvocable,
									disabled: !editable || invocationBusy,
									onChange: (event) => {
										onInvocationChange(event.target.checked, detail.invocation.userInvocable);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.invocationLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.invocationName,
										children: tt("detail.modelInvocable")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
										className: panel_module_css_default.invocationHint,
										children: tt("detail.modelInvocableHint")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.invocationRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: detail.invocation.userInvocable,
									disabled: !editable || invocationBusy,
									onChange: (event) => {
										onInvocationChange(detail.invocation.modelInvocable, event.target.checked);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.invocationLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.invocationName,
										children: tt("detail.userInvocable")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
										className: panel_module_css_default.invocationHint,
										children: tt("detail.userInvocableHint")
									})]
								})]
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.detailMeta,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.managedBy"),
									": ",
									managedByText(detailManaged)
								]
							}),
							detail.addedAt !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.addedAt"),
									": ",
									formatDateTime(detail.addedAt)
								]
							}) : null,
							detail.updatedAt !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.updatedAt"),
									": ",
									formatDateTime(detail.updatedAt)
								]
							}) : null,
							detail.path !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.path"),
									": ",
									detail.path
								]
							}) : null,
							detail.whenToUse !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.whenToUse"),
									": ",
									detail.whenToUse
								]
							}) : null,
							(() => {
								const stat = uses.get(detail.name);
								if (stat === void 0 || stat.count === 0) return null;
								const at = stat.lastUsed !== void 0 ? " · " + formatDateTime(stat.lastUsed) : "";
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.detailMetaLine,
									children: [
										tt("detail.uses"),
										": ",
										stat.count,
										at
									]
								});
							})()
						]
					}),
					detailSource !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.sourceCard,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.sourceCardTitle,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										className: panel_module_css_default.sourceLink,
										href: "https://github.com/" + detailSource.repo,
										target: "_blank",
										rel: "noreferrer",
										children: detailSource.repo
									}),
									detailSource.ref !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.badgeSource,
										children: detailSource.ref
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceStatusBadge, { check: detailCheck })
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("source.commit"),
									": ",
									detailSource.commitSha === "" ? tt("source.unverified") : shortSha(detailSource.commitSha)
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.buttons + " " + panel_module_css_default.actionsTop,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.opBtn,
										disabled: checkingSource !== null,
										onClick: () => {
											onCheck(detailSource.repo);
										},
										children: checkingSource === detailSource.repo ? tt("source.checking") : tt("source.check")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.opBtn,
										disabled: syncingSource !== null,
										onClick: () => {
											onSync(detailSource.repo, [detail.name]);
										},
										children: syncingSource === detailSource.repo ? tt("source.syncing") : tt("source.sync")
									}),
									detailCheck?.deleted.includes(detail.name) === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.opBtn + " " + panel_module_css_default.opDanger,
										onClick: () => {
											onFollowDelete(detailSource.repo, [detail.name]);
										},
										children: tt("source.followDelete")
									}) : null
								]
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditBody, {
						content: detail.content,
						edit,
						label: tt("detail.editSkillBody")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenTable, { ...tokenTable })
				]
			});
		}
		// src/client/panel/RowMenu.tsx
		/**
		* RowMenu — 技能行右侧的「…」操作菜单，与 dsh 工作区/会话行同款：
		* 16px 的三点图标按钮随行悬停出现（dsh 的 .rowActions / .iconButton），
		* 点击弹出 4px 内边距、12px 圆角、34px 行高的半透明卡片菜单
		* （dsh-client-ui-primitives 的 Menu：--dsw-menu-surface-fill +
		* backdrop blur + --dsw-elevation-prominent）。
		*
		* 菜单用 fixed 定位挂到 body：面板本身在滚动容器里，绝对定位会被裁掉。
		*/
		/** Card metrics of the dsh Menu (34px row + 4px card padding). */
		const MENU_ITEM_HEIGHT = 34;
		const MENU_GAP = 4;
		const VIEWPORT_MARGIN = 12;
		/** 菜单卡片宽度：比 dsh 的 144px 下限宽一点，容纳「在 Finder 中显示」。 */
		const MENU_WIDTH = 176;
		function RowMenu({ label, items, onSelect, disabled = false }) {
			const [position, setPosition] = (0, react.useState)(null);
			const triggerRef = (0, react.useRef)(null);
			const cardRef = (0, react.useRef)(null);
			const close = (0, react.useCallback)(() => {
				setPosition(null);
			}, []);
			const open = () => {
				const anchor = triggerRef.current?.getBoundingClientRect();
				if (anchor === void 0) return;
				const height = items.length * MENU_ITEM_HEIGHT + 8;
				const left = Math.min(Math.max(VIEWPORT_MARGIN, anchor.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
				let top = anchor.bottom + MENU_GAP;
				if (top + height > window.innerHeight - VIEWPORT_MARGIN) top = Math.max(VIEWPORT_MARGIN, anchor.top - MENU_GAP - height);
				setPosition({
					left,
					top
				});
			};
			(0, react.useEffect)(() => {
				if (position === null) return;
				const onPointerDown = (event) => {
					const target = event.target;
					if (target === null) return;
					if (triggerRef.current?.contains(target) === true || cardRef.current?.contains(target) === true) return;
					close();
				};
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					event.stopPropagation();
					close();
					triggerRef.current?.focus();
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown, true);
				window.addEventListener("scroll", close, true);
				window.addEventListener("resize", close);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("keydown", onKeyDown, true);
					window.removeEventListener("scroll", close, true);
					window.removeEventListener("resize", close);
				};
			}, [position, close]);
			(0, react.useEffect)(() => {
				if (position === null) return;
				(cardRef.current?.querySelector("[role=\"menuitem\"]:not(:disabled)"))?.focus();
			}, [position]);
			/** 菜单内上下键循环移动焦点。 */
			const onMenuKeyDown = (event) => {
				if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
				event.preventDefault();
				const rows = [...cardRef.current?.querySelectorAll("[role=\"menuitem\"]:not(:disabled)") ?? []];
				if (rows.length === 0) return;
				const index = rows.indexOf(document.activeElement);
				rows[event.key === "ArrowDown" ? (index + 1) % rows.length : (index - 1 + rows.length) % rows.length]?.focus();
			};
			const select = (item) => {
				close();
				triggerRef.current?.focus();
				if (item.disabled === true) return;
				onSelect(item.id);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: panel_module_css_default.rowMenu + (position !== null ? " " + panel_module_css_default.rowMenuOpen : ""),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					ref: triggerRef,
					type: "button",
					className: panel_module_css_default.menuTrigger + (position !== null ? " " + panel_module_css_default.menuTriggerOpen : ""),
					"aria-label": label,
					"aria-haspopup": "menu",
					"aria-expanded": position !== null,
					disabled,
					onClick: (event) => {
						event.stopPropagation();
						if (position === null) open();
						else close();
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconEllipsisOutline16, { size: 16 })
				}), position !== null ? (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: cardRef,
					className: panel_module_css_default.menuCard,
					style: {
						left: position.left,
						top: position.top,
						width: MENU_WIDTH
					},
					role: "menu",
					"aria-label": label,
					onKeyDown: onMenuKeyDown,
					onClick: (event) => {
						event.stopPropagation();
					},
					onBlur: (event) => {
						const next = event.relatedTarget;
						if (next === null || !event.currentTarget.contains(next)) close();
					},
					children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						role: "menuitem",
						className: panel_module_css_default.menuItem + (item.danger === true ? " " + panel_module_css_default.menuItemDanger : ""),
						disabled: item.disabled,
						title: item.disabled === true ? item.disabledHint : void 0,
						onClick: () => {
							select(item);
						},
						children: [item.icon !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.menuIcon,
							children: item.icon
						}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.menuLabel,
							children: item.label
						})]
					}, item.id))
				}), document.body) : null]
			});
		}
		// src/client/panel/SkillRow.tsx
		function SkillRow(props) {
			const { skill, uses, hubConfig, busyNames, listBusy, duplicateNames, openDetail, requestDeleteSkill, reveal } = props;
			const stat = uses.get(skill.name);
			const count = stat?.count ?? 0;
			const lastUsed = stat?.lastUsed;
			const isDuplicate = duplicateNames.has(skill.name);
			/** 键盘打开详情：Enter 或空格。仅当焦点在行本身（而非行内按钮）时生效。 */
			const onKeyDown = (event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					openDetail(skill.name);
				}
			};
			/** 行菜单项：Finder 展示对所有落盘技能开放；删除只给可写（非只读）技能。 */
			const menuItems = [{
				id: "reveal",
				label: tt("row.reveal"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconFolderCloseOutline16, { size: 14 }),
				...isFileSource(skill.source) ? {} : {
					disabled: true,
					disabledHint: tt("row.revealUnavailable")
				}
			}, ...skill.writable ? [{
				id: "delete",
				label: tt("row.delete"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTrashOutline16, { size: 14 }),
				danger: true,
				disabled: busyNames.has(skill.name) || listBusy
			}] : []];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.row,
				role: "button",
				tabIndex: 0,
				"aria-label": tt("row.open", { name: skill.name }),
				onClick: () => {
					openDetail(skill.name);
				},
				onKeyDown,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowName,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.rowNameText,
									children: skill.name
								}),
								isDisplayNameDistinct(skill.name, skill.displayName) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.displayName,
									title: skill.displayName,
									children: skill.displayName
								}) : null,
								count > 0 && hubConfig?.showUseCount !== false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.useCount,
									children: count
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InvocationDots, {
									invocation: skill.invocation,
									hubConfig
								}),
								isDuplicate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge + " " + panel_module_css_default.statusError,
									title: tt("row.duplicateHint"),
									children: tt("row.duplicate")
								}) : null,
								lastUsed !== void 0 && hubConfig?.showUseTime !== false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.useTime,
									children: relativeTimeText(lastUsed)
								}) : null
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.rowDesc,
							title: skill.description,
							children: skill.shortDescription ?? skill.description
						})]
					}),
					skill.writable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
						children: tt("row.readonly")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowMenu, {
						label: tt("row.menu", { name: skill.name }),
						items: menuItems,
						onSelect: (id) => {
							if (id === "reveal") {
								reveal(skill.name, skill.workspace);
								return;
							}
							if (id === "delete") requestDeleteSkill(skill.name);
						}
					})
				]
			});
		}
		// src/client/panel/GroupSummary.tsx
		function GroupSummary(props) {
			const { members, uses, hubConfig } = props;
			let total = 0;
			let latest;
			for (const name of members) {
				const stat = uses.get(name);
				if (stat === void 0) continue;
				total += stat.count;
				if (stat.lastUsed !== void 0 && (latest === void 0 || stat.lastUsed > latest)) latest = stat.lastUsed;
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: panel_module_css_default.groupTitleInner,
				children: [hubConfig?.showGroupSummary !== false && total > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.useCount,
					children: total
				}) : null, hubConfig?.showGroupSummary !== false && latest !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.useTime + " " + panel_module_css_default.groupTime,
					children: relativeTimeText(latest)
				}) : null]
			});
		}
		// src/client/panel/SubGroup.tsx
		function SubGroup(props) {
			const { title, titleHint, count, collapsed, onToggle, children } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.projectNest,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.groupHead,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: panel_module_css_default.disclosure,
						"aria-expanded": !collapsed,
						onClick: onToggle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.chevron + (collapsed ? " " + panel_module_css_default.chevronCollapsed : "") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.groupTitle,
							title: titleHint,
							children: [
								title,
								" · ",
								count
							]
						})]
					})
				}), !collapsed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.list,
					children
				}) : null]
			});
		}
		// src/client/panel/ProjectTree.tsx
		function ProjectTree(props) {
			const { skills, collapsedGroups, toggleGroupCollapse, subdividedProjects, toggleSubdivide, rowProps, workspaceOrder = [] } = props;
			const byProject = /* @__PURE__ */ new Map();
			for (const skill of skills) {
				const key = skill.workspace ?? skill.source;
				const entry = byProject.get(key);
				if (entry === void 0) byProject.set(key, {
					title: skill.workspaceTitle ?? skill.workspace ?? tt("groups.project"),
					skills: [skill]
				});
				else entry.skills.push(skill);
			}
			const projects = [...byProject.entries()].sort((a, b) => workspaceRank(a[0], workspaceOrder) - workspaceRank(b[0], workspaceOrder));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.sectionHead,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
						className: panel_module_css_default.sectionTitle,
						children: [
							tt("groups.project"),
							" · ",
							byProject.size
						]
					})
				}), projects.map(([key, proj]) => {
					const projKey = "project:" + key;
					const projCollapsed = collapsedGroups.has(projKey);
					const subdivided = subdividedProjects.has(key);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.projectNest,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.groupHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: panel_module_css_default.disclosure,
								"aria-expanded": !projCollapsed,
								onClick: () => {
									toggleGroupCollapse(projKey);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.chevron + (projCollapsed ? " " + panel_module_css_default.chevronCollapsed : "") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.groupTitle,
									children: [
										proj.title,
										" · ",
										proj.skills.length,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupSummary, {
											members: proj.skills.map((s) => s.name),
											uses: rowProps.uses,
											hubConfig: rowProps.hubConfig
										})
									]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.groupOps,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: (event) => {
										event.stopPropagation();
										toggleSubdivide(key);
									},
									children: subdivided ? tt("groups.merge") : tt("groups.subdivide")
								})
							})]
						}), !projCollapsed ? subdivided ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.projectNest,
							children: ["project-dsh", "project-agents"].map((source) => {
								const list = proj.skills.filter((skill) => skill.source === source);
								if (list.length === 0) return null;
								const srcKey = projKey + ":" + source;
								const srcCollapsed = collapsedGroups.has(srcKey);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubGroup, {
									title: tt("badge.source." + source),
									count: list.length,
									collapsed: srcCollapsed,
									onToggle: () => {
										toggleGroupCollapse(srcKey);
									},
									children: list.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
										skill,
										...rowProps
									}, skillRowKey(skill)))
								}, srcKey);
							})
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.list,
							children: proj.skills.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
								skill,
								...rowProps
							}, skillRowKey(skill)))
						}) : null]
					}, projKey);
				})]
			});
		}
		// src/client/panel/CollectionCard.tsx
		function CollectionCard(props) {
			const { collection, skills, collapsed, check, checkingSource, syncingSource, rowProps, toggleGroupCollapse, checkSources, requestSync, requestDelete } = props;
			const { uses, hubConfig } = rowProps;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.groupHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: panel_module_css_default.disclosure,
						"aria-expanded": !collapsed,
						onClick: () => {
							toggleGroupCollapse("col:" + collection.name);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.chevron + (collapsed ? " " + panel_module_css_default.chevronCollapsed : "") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.groupTitle,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: panel_module_css_default.sourceLink,
									href: "https://github.com/" + collection.name,
									target: "_blank",
									rel: "noreferrer",
									onClick: (event) => {
										event.stopPropagation();
									},
									children: collection.name
								}),
								" · " + collection.skillNames.length,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupSummary, {
									members: collection.skillNames,
									uses,
									hubConfig
								})
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.groupOps,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceStatusBadge, {
								check,
								checking: checkingSource === collection.name,
								onCheck: () => {
									checkSources(collection.name);
								}
							}),
							check !== void 0 && check.changed && check.updated.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.opBtn,
								disabled: syncingSource !== null,
								onClick: (event) => {
									event.stopPropagation();
									requestSync(collection.name, check.updated);
								},
								children: syncingSource === collection.name ? tt("source.syncing") : tt("source.sync")
							}) : null,
							check !== void 0 && check.deleted.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.opBtn + " " + panel_module_css_default.opDanger,
								onClick: (event) => {
									event.stopPropagation();
									requestDelete(collection.name, check.deleted);
								},
								children: tt("source.followDelete")
							}) : null
						]
					})]
				}), !collapsed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.list,
					children: skills.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
						skill,
						...rowProps
					}, skillRowKey(skill)))
				}) : null]
			});
		}
		// src/client/panel/SourcesView.tsx
		/**
		* Sources tab: the flat skill list or the grouped view — a project-level
		* three-tier tree (workspaces from workspace.json, each optionally split by
		* .dsh/.agents), one group per upstream collection with check/sync/
		* follow-delete actions, plus the uncategorized "personal" group (project
		* skills never count as personal).
		*
		* Top-level groups follow the official 插件 page: a plain 14/500 section
		* heading ("用户级" / "项目级"), not a collapsible header. Only nested nodes
		* (collections, project workspaces, managed-by buckets) keep their disclosure.
		* Ordering is derived — user-level first, then collections by name, then the
		* project tree (workspaces follow the dsh sidebar) — because the hub no longer
		* offers manual reordering.
		*
		* The grouping derivation lives in useGroupView (shared with the toolbar's
		* collapse-all button, which sits next to the view switcher); this component
		* only renders it.
		*/
		function SourcesView(props) {
			const { hub, view } = props;
			const { catalog, skillView, collapsedGroups, sourceCheck, checkingSource, syncingSource, busyNames, toggleGroupCollapse, checkSources, requestSync, requestDelete } = hub;
			const { sourceFiltered, projectSkillsAll, hasProject, visible, collections, uncategorized, allPersonalNames, hasPersonal, personalBuckets, subdividedPersonal, topKeys } = view;
			/** 重复技能名集合：整表只建一次，行内用 has 取代逐行线性 includes。 */
			const duplicateNames = (0, react.useMemo)(() => new Set(catalog?.duplicateNames ?? []), [catalog]);
			/** dsh 侧面栏的工作区顺序；项目级分组按它排列（未知名排最后）。 */
			const workspaceOrder = (0, react.useMemo)(() => (catalog?.workspaces ?? []).map((entry) => entry.path), [catalog]);
			/** SkillRow 收窄后的 props：父组件统一传入它实际消费的字段。 */
			const rowProps = {
				uses: hub.uses,
				hubConfig: hub.hubConfig,
				busyNames,
				listBusy: hub.listBusy,
				duplicateNames,
				openDetail: hub.openDetail,
				requestDeleteSkill: hub.requestDeleteSkill,
				reveal: hub.reveal
			};
			if (skillView === "flat") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.list,
				children: sourceFiltered.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
					skill,
					...rowProps
				}, skillRowKey(skill)))
			});
			const isEmptyTop = !hasProject && collections.length === 0 && !hasPersonal;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [isEmptyTop ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: tt("groups.noCollections")
			}) : null, topKeys.map((topKey) => {
				if (topKey === "project" && hasProject) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectTree, {
					skills: projectSkillsAll,
					collapsedGroups,
					toggleGroupCollapse,
					subdividedProjects: hub.subdividedProjects,
					toggleSubdivide: hub.toggleSubdivide,
					rowProps,
					workspaceOrder
				}, "project");
				if (topKey.startsWith("col:")) {
					const colName = topKey.slice(4);
					const entry = visible.find((item) => item.collection.name === colName);
					if (entry === void 0) return null;
					const { collection, skills } = entry;
					const collapsed = collapsedGroups.has("col:" + collection.name);
					const check = sourceCheck[collection.name];
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollectionCard, {
						collection,
						skills,
						collapsed,
						check,
						checkingSource,
						syncingSource,
						rowProps,
						toggleGroupCollapse,
						checkSources,
						requestSync,
						requestDelete
					}, "col:" + collection.name);
				}
				if (topKey === "uncategorized-source" && hasPersonal) {
					if (allPersonalNames.length === 0) return null;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.sectionHead,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
								className: panel_module_css_default.sectionTitle,
								children: [
									tt("groups.personal"),
									" · ",
									allPersonalNames.length,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupSummary, {
										members: allPersonalNames,
										uses: hub.uses,
										hubConfig: hub.hubConfig
									})
								]
							})
						}), subdividedPersonal ? personalBuckets.map((bucket) => {
							const subKey = "personal:" + bucket.key;
							const subCollapsed = collapsedGroups.has(subKey);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubGroup, {
								title: managedByText(bucket.managed),
								titleHint: tt("groups.managedBy"),
								count: bucket.skills.length,
								collapsed: subCollapsed,
								onToggle: () => {
									toggleGroupCollapse(subKey);
								},
								children: bucket.skills.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
									skill,
									...rowProps
								}, skillRowKey(skill)))
							}, subKey);
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.list,
							children: uncategorized.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
								skill,
								...rowProps
							}, skillRowKey(skill)))
						})]
					}, "uncategorized-source");
				}
				return null;
			})] });
		}
		// src/client/market-catalog.ts
		/** 默认市场目录：精选技能仓库（顺序即展示顺序）。 */
		const MARKET_CATALOG = [
			{
				repo: "anthropics/skills",
				descriptionKey: "market.catalog.anthropics"
			},
			{
				repo: "obra/superpowers",
				descriptionKey: "market.catalog.superpowers"
			},
			{
				repo: "mattpocock/skills",
				descriptionKey: "market.catalog.mattpocock"
			},
			{
				repo: "nexu-io/open-design",
				descriptionKey: "market.catalog.openDesign"
			}
		];
		// src/client/panel/dialogs.tsx
		/**
		* Shared dialog family for the panel: one overlay shell plus the specific
		* dialogs (group-close conflict, sync/delete confirm, branch picker, and
		* market sync selection). Every dialog closes on outside click and keeps
		* the same role/aria shell; the panel owns all dialog state.
		*/
		/**
		* Overlay + centered alert-dialog shell; outside click or Escape cancels.
		* `wide` 给带表单的对话框用（380px 放不下字段）。
		*/
		function DialogShell(props) {
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key === "Escape") props.onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("keydown", onKey);
				};
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.dialogOverlay,
				onClick: props.onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.dialog + (props.wide === true ? " " + panel_module_css_default.dialogWide : ""),
					role: props.wide === true ? "dialog" : "alertdialog",
					"aria-modal": "true",
					onClick: (event) => {
						event.stopPropagation();
					},
					children: props.children
				})
			});
		}
		/**
		* 保存冲突：磁盘上的文件在编辑期间被改过。三个选择都由面板执行——
		* 「复制并重新加载」把草稿放进剪贴板再换最新版本，「继续编辑」什么都不做，
		* 「仍然覆盖」不带指纹再存一次。Esc / 点遮罩等同「继续编辑」（不写盘）。
		*/
		function EditConflictDialog(props) {
			const { onChoose } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: () => {
					onChoose("continue");
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: tt("detail.editConflictTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("detail.editConflictText")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button,
								onClick: () => {
									onChoose("continue");
								},
								children: tt("detail.editConflictContinue")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button + " " + panel_module_css_default.danger,
								onClick: () => {
									onChoose("overwrite");
								},
								children: tt("detail.editConflictOverwrite")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button + " " + panel_module_css_default.primary,
								onClick: () => {
									onChoose("copy-reload");
								},
								children: tt("detail.editConflictCopyReload")
							})
						]
					})
				]
			});
		}
		/** Simple confirm dialog: title + text + optional skill list + cancel/confirm. */
		function ConfirmDialog(props) {
			const { title, text, items, confirmLabel, danger, onCancel, onConfirm } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: text
					}),
					items !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: panel_module_css_default.dialogList,
						children: items.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.rowNameText,
							children: name
						}) }, name))
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onCancel,
							children: tt("form.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + (danger === true ? " " + panel_module_css_default.danger : " " + panel_module_css_default.primary),
							onClick: onConfirm,
							children: confirmLabel
						})]
					})
				]
			});
		}
		/** Branch picker for a repo without releases (pins the ref, then rescans). */
		function BranchChoiceDialog(props) {
			const { choice, busy, onSelect, onCancel, onConfirm } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: tt("market.branchTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("market.branchHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						className: panel_module_css_default.select + " " + panel_module_css_default.dialogSelect,
						value: choice.selected,
						onChange: (event) => {
							onSelect(event.target.value);
						},
						children: choice.branches.map((branch) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: branch,
							children: branch
						}, branch))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onCancel,
							children: tt("form.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							disabled: busy,
							onClick: onConfirm,
							children: tt("market.branchConfirm")
						})]
					})
				]
			});
		}
		/** Version picker: switch a market source's tracked ref (release / branch / custom). */
		function VersionChoiceDialog(props) {
			const { choice, busy, onSelect, onCustom, onCancel, onConfirm } = props;
			const effective = choice.custom.trim() !== "" ? choice.custom.trim() : choice.selected;
			const branchOptions = choice.branches.filter((branch) => !choice.releases.includes(branch));
			const [refGroup, setRefGroup] = (0, react.useState)(choice.releases.includes(choice.selected) || choice.branches.length === 0 ? "releases" : "branches");
			(0, react.useEffect)(() => {
				if (choice.loading) return;
				if (choice.releases.includes(choice.selected)) setRefGroup("releases");
				else if (branchOptions.includes(choice.selected)) setRefGroup("branches");
			}, [choice.loading, choice.repo]);
			const activeRefs = refGroup === "releases" ? choice.releases : branchOptions;
			const listedRefs = [...choice.releases, ...branchOptions];
			const currentUnlistedRef = choice.selected !== "" && !listedRefs.includes(choice.selected) ? choice.selected : void 0;
			const selectRefs = currentUnlistedRef !== void 0 ? [currentUnlistedRef, ...activeRefs] : activeRefs;
			const selectValue = selectRefs.includes(choice.selected) ? choice.selected : selectRefs[0] ?? "";
			const selectGroup = (next) => {
				setRefGroup(next);
				const nextRefs = next === "releases" ? choice.releases : branchOptions;
				if (nextRefs.length > 0 && !nextRefs.includes(choice.selected)) onSelect(nextRefs[0]);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: tt("market.versionTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: panel_module_css_default.dialogText,
						children: [tt("market.versionText", { repo: choice.repo }), choice.current !== void 0 ? ` (${tt("market.versionCurrent", { ref: choice.current })})` : ""]
					}),
					choice.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("market.scanning")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.segmented,
							role: "group",
							"aria-label": tt("market.versionTitle"),
							style: { marginBottom: 8 },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.segBtn + (refGroup === "releases" ? " " + panel_module_css_default.segBtnActive : ""),
								disabled: choice.releases.length === 0,
								"aria-pressed": refGroup === "releases",
								onClick: () => {
									selectGroup("releases");
								},
								children: tt("market.versionReleases")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.segBtn + (refGroup === "branches" ? " " + panel_module_css_default.segBtnActive : ""),
								disabled: branchOptions.length === 0,
								"aria-pressed": refGroup === "branches",
								onClick: () => {
									selectGroup("branches");
								},
								children: tt("market.versionBranches")
							})]
						}),
						selectValue !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							className: panel_module_css_default.select + " " + panel_module_css_default.dialogSelect,
							value: selectValue,
							onChange: (event) => {
								onSelect(event.target.value);
							},
							children: selectRefs.map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: ref,
								children: ref
							}, ref))
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.dialogText,
							style: { marginBottom: 4 },
							children: tt("market.versionCustom")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input + " " + panel_module_css_default.dialogSelect,
							value: choice.custom,
							onChange: (event) => {
								onCustom(event.target.value);
							},
							placeholder: "v1.2.3 / main / abc1234"
						})
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onCancel,
							children: tt("form.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							disabled: busy || choice.loading || effective === "",
							onClick: onConfirm,
							children: busy ? tt("source.syncing") : tt("market.versionConfirm", { ref: effective })
						})]
					})
				]
			});
		}
		/** Post-sync selection: which tracked skills to batch-update to the new version. */
		function MarketSyncDialog(props) {
			const { dialog, busy, onToggle, onCancel, onConfirm } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: tt("market.syncTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("market.syncText", { ref: dialog.ref })
					}),
					dialog.skills.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("market.syncNone")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.dialogList,
						children: dialog.skills.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.dialogRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: dialog.selected.has(name),
								onChange: (event) => {
									onToggle(name, event.target.checked);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.rowNameText,
								children: name
							})]
						}, name))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onCancel,
							children: tt("market.syncCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							disabled: busy || dialog.skills.length === 0,
							onClick: onConfirm,
							children: busy ? tt("source.syncing") : tt("source.sync")
						})]
					})
				]
			});
		}
		// src/client/panel/market-format.ts
		/** Market tab number formatting (stars/downloads/bytes/speed). Pure, no deps. */
		/** Compact count for stars/downloads (1234 → 1.2k). */
		function formatCount(n) {
			if (n < 1e3) return String(n);
			if (n < 1e6) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
			return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
		}
		/** Compact byte size for repo preview rows. */
		function formatBytes(bytes) {
			if (bytes < 1024) return bytes + " B";
			if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
			return (bytes / 1024 / 1024).toFixed(1) + " MB";
		}
		function formatSpeed(bps) {
			if (bps === void 0 || bps <= 0) return "";
			if (bps < 1024) return bps + " B/s";
			if (bps < 1048576) return (bps / 1024).toFixed(1) + " KB/s";
			return (bps / 1024 / 1024).toFixed(1) + " MB/s";
		}
		// src/client/panel/MarketSourceRow.tsx
		function MarketSourceRow(props) {
			const { hub, record } = props;
			const { marketCheck, sourceCheck, sourcesState, scanningRepo, syncingMarket, checkingSource, listBusy, checkSources, checkMarket, syncMarketSource, scanRepo, removeMarketSource } = hub;
			const releaseCheck = marketCheck[record.repo];
			const skillCheck = sourceCheck[record.repo];
			const installedCount = sourcesState?.sources.find((source) => source.repo === record.repo)?.skills.length ?? 0;
			const scanning = scanningRepo === record.repo;
			const syncing = syncingMarket === record.repo;
			const checking = checkingSource === record.repo;
			const hasSkillUpdate = skillCheck?.changed === true && skillCheck.updated.length > 0;
			const hasReleaseUpdate = releaseCheck?.updateAvailable === true;
			const hasUpdate = hasSkillUpdate || hasReleaseUpdate;
			const isChecked = releaseCheck !== void 0 || skillCheck !== void 0;
			let updateLabel;
			let updateDisabled = false;
			let updateDanger = false;
			let updateAction = () => {};
			if (syncing) {
				updateLabel = tt("market.syncing");
				updateDisabled = true;
			} else if (checking) {
				updateLabel = tt("market.checking");
				updateDisabled = true;
			} else if (!isChecked) {
				updateLabel = tt("market.checkUpdate");
				updateAction = () => {
					checkSources(record.repo);
					checkMarket();
				};
			} else if (hasUpdate) {
				const count = hasSkillUpdate ? skillCheck.updated.length : 1;
				updateLabel = count > 1 || hasSkillUpdate ? tt("market.updateCount", { count }) : tt("market.update");
				updateDanger = true;
				updateAction = () => {
					syncMarketSource(record.repo);
				};
			} else {
				updateLabel = tt("market.upToDate");
				updateDisabled = true;
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowName,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								className: panel_module_css_default.sourceLink,
								href: "https://github.com/" + record.repo,
								target: "_blank",
								rel: "noreferrer",
								children: record.repo
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.badge + " " + panel_module_css_default.badgeSource,
								style: {
									cursor: "pointer",
									fontFamily: "inherit"
								},
								title: tt("market.versionHint"),
								onClick: () => {
									hub.openVersionDialog(record.repo);
								},
								children: record.ref ?? tt("market.unpinned")
							})]
						}), (() => {
							const stats = hub.marketStats[record.repo];
							const hasDeleted = skillCheck !== void 0 && skillCheck.deleted.length > 0;
							if (stats === void 0 && installedCount === 0 && !hasSkillUpdate && !hasDeleted && !hasReleaseUpdate) return null;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.hintLine,
								style: {
									display: "flex",
									gap: 4,
									flexWrap: "wrap",
									marginTop: 3
								},
								children: [
									hasSkillUpdate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.statusUpdated,
										children: tt("market.updatable", { count: skillCheck.updated.length })
									}) : null,
									hasDeleted ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.statusError,
										children: tt("market.deletedUpstream", { count: skillCheck.deleted.length })
									}) : null,
									hasReleaseUpdate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.statusUpdated,
										children: releaseCheck.latestTag !== void 0 ? tt("market.newRelease", { version: releaseCheck.latestTag }) : tt("market.updated")
									}) : null,
									installedCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.badgeCount,
										children: tt("market.installed", { count: installedCount })
									}) : null,
									stats !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.badgeCount,
										title: tt("market.starsHint", { count: stats.stars }),
										children: ["★ ", formatCount(stats.stars)]
									}) : null,
									stats !== void 0 && stats.downloads > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.badgeCount,
										title: tt("market.downloadsHint", { count: stats.downloads }),
										children: ["⭳ ", formatCount(stats.downloads)]
									}) : null
								]
							});
						})()]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button + " " + panel_module_css_default.sm + " " + panel_module_css_default.primary,
						disabled: scanning,
						onClick: () => {
							scanRepo(record.repo);
						},
						children: scanning ? tt("market.scanning") : tt("market.scan")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn + (updateDanger ? " " + panel_module_css_default.opDanger : ""),
						disabled: updateDisabled,
						title: hasUpdate ? tt("market.syncHint") : void 0,
						onClick: updateAction,
						children: updateLabel
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn + " " + panel_module_css_default.iconBtn,
						disabled: listBusy,
						title: tt("market.removeHint"),
						"aria-label": tt("market.deleteSource"),
						onClick: () => {
							removeMarketSource(record.repo);
						},
						children: "×"
					})
				]
			});
		}
		// src/client/panel/RepoScanCard.tsx
		/**
		* RepoScanCard — 扫描结果归属卡片：扫描中/错误/就绪（搜索+过滤+分页+
		* 勾选导入+进度+结果）都包在这里。搜索/过滤/分页是卡片级本地状态，
		* 随卡片挂载而生、关闭而灭。从 MarketView.tsx 原样搬出，渲染逻辑不变。
		*/
		/**
		* 已知技能根的显示名键；未知根直接显示目录名。
		* zh 字典里这两项就是目录名本身（与接线前的硬编码文本一致）。
		* 空串是「技能就在仓库根」的哨兵根（host 侧 REPO_ROOT），目录名无从显示，
		* 给它一个可读标签，否则筛选按钮会是一片空白。
		*/
		function rootLabelKey(root) {
			if (root === "") return "repo.root.self";
			if (root === "skills") return "repo.root.skills";
			if (root === "design-templates") return "repo.root.designTemplates";
			return "repo.root.generic";
		}
		function RepoScanCard(props) {
			const { hub } = props;
			const { repoDiscoverState, scanningRepo, repoResult, repoSelected, setRepoSelected, repoImporting, toggleRepoSelected, importRepo, cancelImport } = hub;
			const [repoSearch, setRepoSearch] = (0, react.useState)("");
			const [repoFilter, setRepoFilter] = (0, react.useState)("all");
			const [visibleCount, setVisibleCount] = (0, react.useState)(50);
			(0, react.useEffect)(() => {
				setVisibleCount(50);
			}, [
				repoDiscoverState,
				repoSearch,
				repoFilter
			]);
			if (repoDiscoverState.status === "idle" && repoResult === null) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.section + " " + panel_module_css_default.board,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.sectionTitle + " " + panel_module_css_default.sectionHeadRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.sectionTitleFill,
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6
						},
						children: [tt("repo.scanTitle"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								fontWeight: 400,
								opacity: .75
							},
							children: [
								"— ",
								repoDiscoverState.status === "ready" ? repoDiscoverState.data.repo : repoDiscoverState.status === "error" ? scanningRepo ?? "" : scanningRepo ?? "",
								repoDiscoverState.status === "ready" && repoDiscoverState.data.ref !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										opacity: .5,
										marginLeft: 6
									},
									children: ["ref ", repoDiscoverState.data.ref]
								}) : null
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn,
						onClick: () => {
							hub.clearScan();
						},
						children: tt("repo.close")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
					repoDiscoverState.status === "scanning" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.empty,
						style: { padding: "12px 0" },
						children: tt("market.scanning")
					}) : null,
					repoDiscoverState.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.errorBanner,
						children: repoDiscoverState.message
					}) : null,
					repoDiscoverState.status === "ready" ? (() => {
						const entries = repoDiscoverState.data.entries;
						const installedNames = /* @__PURE__ */ new Set([
							...(hub.catalog?.skills ?? []).map((s) => s.name),
							...(repoResult?.imported ?? []).map((r) => r.name),
							...(repoResult?.skipped ?? []).map((r) => r.name)
						]);
						const isExisting = (entry) => entry.existing || installedNames.has(entry.name);
						const selected = entries.filter((entry) => repoSelected.has(entry.path) && !isExisting(entry));
						const selectedBytes = selected.reduce((s, e) => s + e.totalBytes, 0);
						const filtered = entries.filter((entry) => {
							if (repoFilter !== "all" && entry.root !== repoFilter) return false;
							if (repoSearch.trim() !== "" && !entry.name.toLowerCase().includes(repoSearch.trim().toLowerCase())) return false;
							return true;
						}).sort((a, b) => a.name.localeCompare(b.name));
						const paged = filtered.slice(0, visibleCount);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: panel_module_css_default.hintLine + " " + panel_module_css_default.hintInline,
								children: [
									tt("repo.ready", { count: entries.length }),
									" · ",
									repoDiscoverState.data.ref !== null ? `ref ${repoDiscoverState.data.ref}` : ""
								]
							}),
							repoDiscoverState.data.truncated === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.warnBanner,
								children: tt("repo.truncated")
							}) : null,
							entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.empty,
								children: tt("repo.empty")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								(() => {
									const order = /* @__PURE__ */ new Map([["skills", 0], ["design-templates", 1]]);
									const roots = [...new Set(entries.map((e) => e.root))].sort((a, b) => {
										const ao = order.get(a) ?? 99;
										const bo = order.get(b) ?? 99;
										return ao !== bo ? ao - bo : a.localeCompare(b);
									});
									const counts = /* @__PURE__ */ new Map();
									for (const e of entries) counts.set(e.root, (counts.get(e.root) ?? 0) + 1);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											gap: 8,
											marginBottom: 8,
											flexWrap: "wrap"
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												style: {
													flex: 1,
													minWidth: 140
												},
												value: repoSearch,
												onChange: (e) => setRepoSearch(e.target.value),
												placeholder: tt("repo.searchPlaceholder")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.button + " " + panel_module_css_default.sm + (repoFilter === "all" ? " " + panel_module_css_default.primary : ""),
												onClick: () => setRepoFilter("all"),
												children: tt("repo.allRoots", { count: entries.length })
											}),
											roots.map((root) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: panel_module_css_default.button + " " + panel_module_css_default.sm + (repoFilter === root ? " " + panel_module_css_default.primary : ""),
												onClick: () => setRepoFilter(root),
												children: [
													tt(rootLabelKey(root), { root }),
													" ",
													counts.get(root) ?? 0
												]
											}, root === "" ? "repo-root" : root))
										]
									});
								})(),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.hintLine,
									style: {
										display: "flex",
										justifyContent: "space-between",
										flexWrap: "wrap",
										gap: 8
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("repo.selection", {
										selected: selected.length,
										total: entries.length,
										size: formatBytes(selectedBytes),
										shown: paged.length,
										filtered: filtered.length
									}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											display: "flex",
											gap: 6
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.opBtn,
												onClick: () => {
													setRepoSelected(new Set(filtered.filter((e) => !isExisting(e)).slice(0, visibleCount).map((e) => e.path)));
												},
												children: tt("repo.selectVisible")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.opBtn,
												onClick: () => {
													setRepoSelected(new Set(entries.filter((e) => !isExisting(e)).map((e) => e.path)));
												},
												children: tt("repo.selectAllN", { count: entries.filter((e) => !isExisting(e)).length })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.opBtn,
												onClick: () => {
													setRepoSelected(/* @__PURE__ */ new Set());
												},
												children: tt("repo.clearAll")
											})
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.scanList,
									children: paged.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.empty,
										style: { padding: 20 },
										children: tt("repo.noMatch")
									}) : paged.map((entry) => {
										const existing = isExisting(entry);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: panel_module_css_default.row + (existing ? " " + panel_module_css_default.rowMuted : ""),
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													checked: repoSelected.has(entry.path),
													disabled: existing,
													onChange: (event) => {
														toggleRepoSelected(entry.path, event.target.checked);
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.rowMain,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.rowName,
														children: entry.name
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.rowDesc,
														children: [
															entry.dir === "" ? tt("repo.root.self") : entry.dir,
															" · ",
															tt("repo.files", {
																count: entry.fileCount,
																size: formatBytes(entry.totalBytes)
															})
														]
													})]
												}),
												existing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
													children: tt("repo.existing")
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.badge + " " + panel_module_css_default.badgeSource,
													children: entry.origin
												})
											]
										}, entry.path);
									})
								}),
								visibleCount < filtered.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										textAlign: "center",
										marginTop: 8
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button,
										onClick: () => setVisibleCount((n) => n + 50),
										children: tt("repo.loadMore", {
											step: 50,
											remaining: filtered.length - visibleCount
										})
									})
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.buttons + " " + panel_module_css_default.actionsTop,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button + " " + panel_module_css_default.primary,
										disabled: selected.length === 0 || repoImporting,
										onClick: () => {
											importRepo();
										},
										children: repoImporting ? tt("repo.importing") : `${tt("repo.import", { count: selected.length })} · ${formatBytes(selectedBytes)}`
									}), repoImporting ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button,
										onClick: () => {
											cancelImport();
										},
										children: tt("repo.cancel")
									}) : null]
								}),
								repoResult !== null && repoResult.status === "running" ? (() => {
									const pct = repoResult.totalBytes > 0 ? Math.min(100, Math.round(repoResult.downloadedBytes / repoResult.totalBytes * 100)) : repoResult.total > 0 ? Math.round(repoResult.done / repoResult.total * 100) : 0;
									const speed = formatSpeed(repoResult.bytesPerSecond);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.formSuccess + " " + panel_module_css_default.actionsTop,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													alignItems: "center",
													gap: 8,
													marginBottom: 6
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.scanProgressTrack,
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.scanProgressFill,
														style: { width: `${pct}%` }
													})
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: {
														fontSize: 11,
														opacity: .75,
														minWidth: 32,
														textAlign: "right"
													},
													children: [pct, "%"]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.hintLine,
												children: [
													formatBytes(repoResult.downloadedBytes),
													" / ",
													formatBytes(repoResult.totalBytes),
													speed !== "" ? ` · ${speed}` : "",
													" · ",
													tt("repo.skillProgress", {
														done: repoResult.done,
														total: repoResult.total
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.hintLine,
												style: { marginTop: 4 },
												children: [repoResult.current !== void 0 ? tt("repo.importingCurrent", {
													name: repoResult.current,
													done: repoResult.done + 1,
													total: repoResult.total
												}) : tt("repo.importing"), repoResult.currentFile !== void 0 ? ` · ${repoResult.currentFile}` : ""]
											}),
											repoResult.failed.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: panel_module_css_default.errorBanner,
												style: { marginTop: 6 },
												children: repoResult.failed.map((f) => `${f.name}: ${f.error}`).join("; ")
											}) : null
										]
									});
								})() : null
							] })
						] });
					})() : null,
					repoResult !== null && repoResult.status !== "running" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: repoResult.status === "cancelled" ? panel_module_css_default.errorBanner + " " + panel_module_css_default.actionsTop : panel_module_css_default.formSuccess + " " + panel_module_css_default.actionsTop,
						children: [
							repoResult.status === "cancelled" ? tt("repo.cancelled", {
								imported: repoResult.imported.length,
								total: repoResult.total
							}) : `${tt("repo.imported", { count: repoResult.imported.length })} · ${tt("repo.skippedExisting", { count: repoResult.skipped.length })} · ${tt("repo.failed", { count: repoResult.failed.length })}`,
							(repoResult.replaced?.length ?? 0) > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [" · ", tt("repo.replaced", { count: repoResult.replaced?.length ?? 0 })] }) : null,
							repoResult.failed.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { marginTop: 6 },
								children: repoResult.failed.map((f) => `${f.name}: ${f.error}`).join("; ")
							}) : null,
							repoResult.status === "error" && repoResult.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { marginTop: 6 },
								children: repoResult.error
							}) : null
						]
					}) : null
				] })]
			});
		}
		// src/client/panel/MarketView.tsx
		/**
		* Market tab: one unified market list — built-in catalog entries (add
		* button while not yet added) and the user's market sources (full state
		* badges + actions once added, plus custom sources), with check-all and
		* update-all actions and the repo scan result with the importable checklist.
		* 行渲染在 MarketSourceRow，扫描卡片在 RepoScanCard，数字格式在 market-format。
		*/
		function MarketView(props) {
			const { hub } = props;
			const { marketState, sourceCheck, scanningRepo, newSourceName, setNewSourceName, listBusy, addSource, addMarketSource, checkMarket, checkSources, updateAllDialog, setUpdateAllDialog, updateAll } = hub;
			/** 有可更新技能的来源（全部更新按钮与确认列表共用）。 */
			const updatableRepos = Object.entries(sourceCheck).filter(([, check]) => check.changed && check.updated.length > 0);
			(0, react.useEffect)(() => {
				hub.loadMarketStats();
			}, []);
			const rows = [];
			for (const entry of MARKET_CATALOG) {
				const record = marketState.repos.find((item) => item.repo === entry.repo);
				if (record !== void 0) rows.push({
					key: entry.repo,
					element: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketSourceRow, {
						hub,
						record
					})
				});
				else {
					const busy = scanningRepo !== null || listBusy;
					rows.push({
						key: entry.repo,
						element: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.rowMain,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.rowName,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										className: panel_module_css_default.sourceLink,
										href: "https://github.com/" + entry.repo,
										target: "_blank",
										rel: "noreferrer",
										children: entry.repo
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.rowDesc,
									children: tt(entry.descriptionKey)
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.opBtn,
								disabled: busy,
								onClick: () => {
									addSource(entry.repo);
								},
								children: tt("market.add")
							})]
						})
					});
				}
			}
			for (const record of marketState.repos) {
				if (MARKET_CATALOG.some((entry) => entry.repo === record.repo)) continue;
				rows.push({
					key: record.repo,
					element: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketSourceRow, {
						hub,
						record
					})
				});
			}
			const unaddedCatalog = MARKET_CATALOG.filter((entry) => !marketState.repos.some((record) => record.repo === entry.repo));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: panel_module_css_default.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.sectionTitle + " " + panel_module_css_default.sectionHeadRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.sectionTitleFill,
									children: tt("market.title")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										checkSources();
										checkMarket();
									},
									children: tt("market.checkAll")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn + (updatableRepos.length > 0 ? " " + panel_module_css_default.opDanger : ""),
									disabled: updatableRepos.length === 0 || listBusy,
									onClick: () => {
										setUpdateAllDialog(true);
									},
									children: tt("market.updateAll")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.buttons + " " + panel_module_css_default.actionsPadded,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input + " " + panel_module_css_default.grow,
								value: newSourceName,
								onChange: (event) => {
									setNewSourceName(event.target.value);
								},
								onKeyDown: (event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addMarketSource();
									}
								},
								placeholder: tt("market.addPlaceholder")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button + " " + panel_module_css_default.primary,
								disabled: newSourceName.trim() === "",
								onClick: () => {
									addMarketSource();
								},
								children: tt("market.addSource")
							})]
						}),
						unaddedCatalog.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.hintLine + " " + panel_module_css_default.hintPadded,
							children: tt("market.catalogHint")
						}) : null,
						marketState.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							children: tt("panel.loading")
						}) : null,
						marketState.status !== "loading" && rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							children: tt("market.noSources")
						}) : null,
						marketState.status !== "loading" ? rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: row.element }, row.key)) : null
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RepoScanCard, { hub }),
				updateAllDialog ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					title: tt("market.updateAllConfirmTitle"),
					text: tt("market.updateAllConfirmText"),
					items: updatableRepos.map(([repo, check]) => tt("market.updateAllItem", {
						repo,
						count: check.updated.length
					})),
					confirmLabel: tt("market.updateAll"),
					danger: true,
					onCancel: () => {
						setUpdateAllDialog(false);
					},
					onConfirm: () => {
						updateAll();
					}
				}) : null
			] });
		}
		// src/client/panel/McpServerDialog.tsx
		/**
		* McpServerDialog — 新建/编辑一台 MCP 服务器的表单。
		*
		* 字段与 dsh 的 `@deepseek-ai/dsh-mcp-client` 配置对齐；`reconnect` 之类的
		* 高级项不在这里改，但保存时会被原样保留（host 只覆盖表单提交的字段）。
		*
		* env/headers 用「每行一个」的朴素写法：`KEY=VALUE` 与 `KEY: VALUE`。解析
		* 失败在本地就拦住，不把一行坏文本发到 host 再让它 400。
		*/
		/** 表单初始化：编辑时按行配置铺开，新建时给一台 stdio 服务器的默认值。 */
		function draftOf(server) {
			if (server === void 0) return {
				serverName: "",
				transport: "stdio",
				command: "",
				args: "",
				cwd: "",
				env: "",
				url: "",
				headers: "",
				toolCallTimeoutMs: "60000",
				failOnStartupError: false,
				maxInstructionBytes: ""
			};
			const stdio = server.stdio;
			const http = server.http;
			return {
				serverName: server.serverName,
				transport: server.transport,
				command: stdio?.command ?? "",
				args: (stdio?.args ?? []).join("\n"),
				cwd: stdio?.cwd ?? "",
				env: Object.entries(stdio?.env ?? {}).map(([key, value]) => key + "=" + value).join("\n"),
				url: http?.url ?? "",
				headers: Object.entries(http?.headers ?? {}).map(([key, value]) => key + ": " + value).join("\n"),
				toolCallTimeoutMs: String(server.toolCallTimeoutMs),
				failOnStartupError: server.failOnStartupError,
				maxInstructionBytes: server.maxInstructionBytes === void 0 ? "" : String(server.maxInstructionBytes)
			};
		}
		/** 逐行解析 KEY=VALUE / KEY: VALUE；坏行返回行号（1 起）。 */
		function parsePairs(text, separator) {
			const map = {};
			const lines = text.split("\n");
			for (let index = 0; index < lines.length; index += 1) {
				const line = (lines[index] ?? "").trim();
				if (line === "") continue;
				const at = line.indexOf(separator);
				if (at <= 0) return {
					map,
					badLine: index + 1
				};
				const key = line.slice(0, at).trim();
				if (key === "") return {
					map,
					badLine: index + 1
				};
				map[key] = line.slice(at + 1).trim();
			}
			return { map };
		}
		/** 空串 → null（用默认/清掉），数字串 → 数字，其余 → undefined（本地报错）。 */
		function numberOrNull(text) {
			const trimmed = text.trim();
			if (trimmed === "") return null;
			const value = Number(trimmed);
			return Number.isFinite(value) ? value : void 0;
		}
		/** 字段错误的本地化文本。 */
		function textOfError(code) {
			return code === void 0 ? void 0 : tt("mcp.field." + code);
		}
		function McpServerDialog(props) {
			const { editor, busy, errors, error, onCancel, onSave } = props;
			const server = editor.mode === "edit" ? editor.server : void 0;
			const [draft, setDraft] = (0, react.useState)(() => draftOf(server));
			/** 本地解析失败：`field` 指向 env/headers/timeout 这类不在 host 校验前的项。 */
			const [localError, setLocalError] = (0, react.useState)(null);
			const codeOf = (field) => errors.find((entry) => entry.field === field)?.code;
			const patch = (next) => {
				setDraft((current) => ({
					...current,
					...next
				}));
			};
			const submit = () => {
				if (busy) return;
				const timeout = numberOrNull(draft.toolCallTimeoutMs);
				if (timeout === void 0) {
					setLocalError({ field: "toolCallTimeoutMs" });
					return;
				}
				const maxInstruction = numberOrNull(draft.maxInstructionBytes);
				if (maxInstruction === void 0) {
					setLocalError({ field: "maxInstructionBytes" });
					return;
				}
				const input = {
					serverName: draft.serverName.trim(),
					transport: draft.transport,
					toolCallTimeoutMs: timeout,
					failOnStartupError: draft.failOnStartupError,
					maxInstructionBytes: maxInstruction
				};
				if (draft.transport === "stdio") {
					const env = parsePairs(draft.env, "=");
					if (env.badLine !== void 0) {
						setLocalError({
							field: "env",
							line: env.badLine
						});
						return;
					}
					input.command = draft.command.trim();
					input.args = draft.args.split("\n").map((line) => line.trim()).filter((line) => line !== "");
					input.cwd = draft.cwd.trim();
					input.env = env.map;
				} else {
					const headers = parsePairs(draft.headers, ":");
					if (headers.badLine !== void 0) {
						setLocalError({
							field: "headers",
							line: headers.badLine
						});
						return;
					}
					input.url = draft.url.trim();
					input.headers = headers.map;
				}
				setLocalError(null);
				onSave(input);
			};
			const errorLine = (field, code) => {
				const text = textOfError(code);
				return text === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.mcpFieldError,
					children: text
				});
			};
			const localLine = (field, separator) => localError?.field !== field ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: panel_module_css_default.mcpFieldError,
				children: tt("mcp.form.invalidLine", {
					field: tt(field === "env" ? "mcp.form.env" : "mcp.form.headers"),
					line: String(localError.line ?? 0),
					sep: separator
				})
			});
			const title = editor.mode === "edit" ? tt("mcp.form.editTitle", { name: editor.server.serverName }) : tt("mcp.form.createTitle");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				wide: true,
				onClose: busy ? () => {} : onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: title
					}),
					error !== void 0 && error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.errorBanner,
						role: "alert",
						children: tt("mcp.saveFailed", { error })
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: panel_module_css_default.mcpForm,
						onSubmit: (event) => {
							event.preventDefault();
							submit();
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.mcpField,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpFieldLabel,
										children: tt("mcp.form.name")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: panel_module_css_default.mcpInput + (codeOf("serverName") !== void 0 ? " " + panel_module_css_default.mcpInputError : ""),
										value: draft.serverName,
										disabled: busy,
										onChange: (event) => {
											patch({ serverName: event.target.value });
										}
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpHint,
										children: tt("mcp.form.nameHint", { name: draft.serverName.trim() === "" ? "…" : draft.serverName.trim() })
									}),
									errorLine("serverName", codeOf("serverName"))
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.mcpField,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.mcpFieldLabel,
									children: tt("mcp.form.transport")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: panel_module_css_default.mcpInput,
									value: draft.transport,
									disabled: busy,
									onChange: (event) => {
										patch({ transport: event.target.value });
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "stdio",
										children: tt("mcp.transport.stdio")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "streamable-http",
										children: tt("mcp.transport.http")
									})]
								})]
							}),
							draft.transport === "stdio" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: panel_module_css_default.mcpField,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.mcpFieldLabel,
											children: tt("mcp.form.command")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: panel_module_css_default.mcpInput + (codeOf("command") !== void 0 ? " " + panel_module_css_default.mcpInputError : ""),
											value: draft.command,
											disabled: busy,
											onChange: (event) => {
												patch({ command: event.target.value });
											}
										}),
										errorLine("command", codeOf("command"))
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: panel_module_css_default.mcpField,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpFieldLabel,
										children: tt("mcp.form.args")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: panel_module_css_default.mcpTextarea,
										rows: 3,
										value: draft.args,
										disabled: busy,
										onChange: (event) => {
											patch({ args: event.target.value });
										}
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: panel_module_css_default.mcpField,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpFieldLabel,
										children: tt("mcp.form.cwd")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: panel_module_css_default.mcpInput,
										value: draft.cwd,
										disabled: busy,
										onChange: (event) => {
											patch({ cwd: event.target.value });
										}
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: panel_module_css_default.mcpField,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.mcpFieldLabel,
											children: tt("mcp.form.env")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											className: panel_module_css_default.mcpTextarea,
											rows: 3,
											value: draft.env,
											disabled: busy,
											onChange: (event) => {
												patch({ env: event.target.value });
											}
										}),
										localLine("env", "=")
									]
								})
							] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.mcpField,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpFieldLabel,
										children: tt("mcp.form.url")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: panel_module_css_default.mcpInput + (codeOf("url") !== void 0 ? " " + panel_module_css_default.mcpInputError : ""),
										value: draft.url,
										disabled: busy,
										onChange: (event) => {
											patch({ url: event.target.value });
										}
									}),
									errorLine("url", codeOf("url"))
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.mcpField,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpFieldLabel,
										children: tt("mcp.form.headers")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: panel_module_css_default.mcpTextarea,
										rows: 3,
										value: draft.headers,
										disabled: busy,
										onChange: (event) => {
											patch({ headers: event.target.value });
										}
									}),
									localLine("headers", ":")
								]
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.mcpFormRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: panel_module_css_default.mcpField,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.mcpFieldLabel,
											children: tt("mcp.form.timeout")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: panel_module_css_default.mcpInput + (codeOf("toolCallTimeoutMs") !== void 0 || localError?.field === "toolCallTimeoutMs" ? " " + panel_module_css_default.mcpInputError : ""),
											inputMode: "numeric",
											value: draft.toolCallTimeoutMs,
											disabled: busy,
											onChange: (event) => {
												patch({ toolCallTimeoutMs: event.target.value });
											}
										}),
										errorLine("toolCallTimeoutMs", codeOf("toolCallTimeoutMs")),
										localError?.field === "toolCallTimeoutMs" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.mcpFieldError,
											children: tt("mcp.field.range")
										}) : null
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: panel_module_css_default.mcpField,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.mcpFieldLabel,
											children: tt("mcp.form.maxInstruction")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: panel_module_css_default.mcpInput + (codeOf("maxInstructionBytes") !== void 0 || localError?.field === "maxInstructionBytes" ? " " + panel_module_css_default.mcpInputError : ""),
											inputMode: "numeric",
											value: draft.maxInstructionBytes,
											disabled: busy,
											onChange: (event) => {
												patch({ maxInstructionBytes: event.target.value });
											}
										}),
										errorLine("maxInstructionBytes", codeOf("maxInstructionBytes")),
										localError?.field === "maxInstructionBytes" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.mcpFieldError,
											children: tt("mcp.field.range")
										}) : null
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.mcpCheck,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: draft.failOnStartupError,
									disabled: busy,
									onChange: (event) => {
										patch({ failOnStartupError: event.target.checked });
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("mcp.form.failFast") })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.dialogActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.button,
									disabled: busy,
									onClick: onCancel,
									children: tt("form.cancel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									className: panel_module_css_default.button + " " + panel_module_css_default.primary,
									disabled: busy,
									children: busy ? tt("mcp.form.saving") : tt("mcp.form.save")
								})]
							})
						]
					})
				]
			});
		}
		// src/client/panel/McpView.tsx
		/**
		* MCP 分类页：一行一台 MCP 服务器。
		*
		* 服务器在 dsh 里是 Loader 的一行插件实例，所以这一页没有"新建/导入"这类
		* 动作（增删改是 P2）；这一期只做三件事：把行照出来（名称、传输、状态、
		* 配置摘要）、展开看它注册了哪些工具、按行启用/禁用。
		*
		* 状态词只到「已加载 / 启动中 / 启动失败 / 已禁用」：dsh 不暴露 MCP 会话的
		* 连接状态，写「已连接」就是骗人。
		*
		* `env` / `headers` 的值按行默认遮掩（点「显示值」才展开）：它们经回环 +
		* 会话栅栏返回，但屏幕上的暴露面越小越好。
		*/
		/** 不可编辑原因 → 文案键。 */
		function editBlockedKey(reason) {
			if (reason === "no-editor") return "mcp.editBlocked.noEditor";
			if (reason === "invalid-config") return "mcp.editBlocked.invalidConfig";
			return "mcp.editBlocked.unaddressable";
		}
		/** 状态 → 文案键（状态值就是投影里的四个枚举）。 */
		const STATUS_KEY = {
			running: "mcp.status.running",
			starting: "mcp.status.starting",
			failed: "mcp.status.failed",
			disabled: "mcp.status.disabled"
		};
		/** 状态 → 徽标配色（只标"好/坏"两档，其余用中性底色）。 */
		function statusClass(status) {
			if (status === "running") return panel_module_css_default.statusOk;
			if (status === "failed") return panel_module_css_default.statusError;
			return "";
		}
		/** 一行配置摘要：名称 + 值（等宽）。 */
		function MetaLine(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.mcpMetaLine,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.mcpMetaLabel,
					children: props.label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.mcpMetaValue,
					children: props.children
				})]
			});
		}
		/** 展开后的配置摘要 + 工具清单。env/headers 的值默认遮掩。 */
		function McpDetail(props) {
			const { server } = props;
			const [revealed, setRevealed] = (0, react.useState)(false);
			const stdio = server.stdio;
			const http = server.http;
			const pairs = stdio !== void 0 ? Object.entries(stdio.env) : Object.entries(http?.headers ?? {});
			const target = stdio !== void 0 ? [stdio.command, ...stdio.args].filter((part) => part !== "").join(" ") : http?.url ?? "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.mcpDetail,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MetaLine, {
						label: stdio !== void 0 ? tt("mcp.detail.command") : tt("mcp.detail.url"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.mcpMono,
							children: target !== "" ? target : "—"
						})
					}),
					stdio !== void 0 && stdio.cwd !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MetaLine, {
						label: tt("mcp.detail.cwd"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.mcpMono,
							children: stdio.cwd
						})
					}) : null,
					pairs.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(MetaLine, {
						label: stdio !== void 0 ? tt("mcp.detail.env") : tt("mcp.detail.headers"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.mcpSecretToggle,
							"aria-pressed": revealed,
							onClick: () => {
								setRevealed((value) => !value);
							},
							children: revealed ? tt("mcp.detail.revealHide") : tt("mcp.detail.revealShow")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.mcpSecrets,
							children: pairs.map(([key, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.mcpMono,
								children: [
									key,
									"=",
									revealed ? value : "••••••"
								]
							}, key))
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MetaLine, {
						label: tt("mcp.detail.timeout"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.mcpMono,
							children: server.toolCallTimeoutMs + " ms"
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MetaLine, {
						label: tt("mcp.detail.failFast"),
						children: server.failOnStartupError ? tt("mcp.yes") : tt("mcp.no")
					}),
					server.patchId !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MetaLine, {
						label: tt("mcp.detail.patch"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.mcpMono,
							children: server.patchId
						})
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MetaLine, {
						label: tt("mcp.tools"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.mcpTools,
							children: server.tools.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.mcpToolEmpty,
								children: tt("mcp.noTools")
							}) : server.tools.map((tool) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.mcpTool,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpToolName,
										children: tool.name
									}),
									tool.description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpToolDesc,
										children: tool.description
									}) : null,
									tool.paramNames.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpToolParams,
										children: tt("mcp.toolParams", { params: tool.paramNames.join(", ") })
									}) : null
								]
							}, tool.name))
						})
					})
				]
			});
		}
		/** 一台服务器的一行。 */
		function McpServerRow(props) {
			const { server, open, busy, canManage } = props;
			const readOnly = server.readOnlyReason !== void 0;
			const reason = readOnly ? tt(server.readOnlyReason === "management-required" ? "mcp.readonly.management" : server.readOnlyReason === "no-manager" ? "mcp.readonly.noManager" : "mcp.readonly.unaddressable") : canManage ? void 0 : tt("mcp.noManager");
			const disabled = busy || !canManage || readOnly;
			const editReason = server.editable || reason !== void 0 ? void 0 : tt(editBlockedKey(server.editBlockedReason));
			const stdio = server.stdio;
			const target = stdio !== void 0 ? [stdio.command, ...stdio.args].filter((part) => part !== "").join(" ") : server.http?.url ?? "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.mcpRow + (server.enabled ? "" : " " + panel_module_css_default.mcpRowDisabled),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.mcpHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: panel_module_css_default.disclosure,
								"aria-expanded": open,
								"aria-label": tt("mcp.tools") + ": " + server.serverName,
								onClick: () => {
									props.onToggleExpanded(server.entryId);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.chevron + (open ? "" : " " + panel_module_css_default.chevronCollapsed),
										"aria-hidden": "true"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.mcpName,
										children: server.serverName
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.badges,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.badge,
												children: tt(server.transport === "stdio" ? "mcp.transport.stdio" : "mcp.transport.http")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.badge + " " + statusClass(server.status),
												children: tt(STATUS_KEY[server.status])
											}),
											readOnly ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
												title: reason,
												children: tt("mcp.readonly.badge")
											}) : null,
											server.managed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.badge,
												children: tt("mcp.managedBadge")
											}) : null
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.mcpToolCount,
								children: tt("mcp.toolCount", { count: server.tools.length })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.mcpRowActions,
								children: [server.editable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.mcpRowAction,
									disabled: busy,
									onClick: () => {
										props.onEdit(server);
									},
									children: tt("mcp.edit")
								}) : null, server.removable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.mcpRowAction + " " + panel_module_css_default.danger,
									disabled: busy,
									onClick: () => {
										props.onAskRemove(server);
									},
									children: tt("mcp.delete")
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "switch",
								"aria-checked": server.enabled,
								"aria-label": server.serverName,
								className: panel_module_css_default.switch + (server.enabled ? " " + panel_module_css_default.switchOn : ""),
								disabled,
								title: disabled ? reason : void 0,
								onClick: (event) => {
									event.stopPropagation();
									props.onToggle(server.entryId, !server.enabled);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.switchThumb })
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.mcpTarget,
						title: target,
						children: target !== "" ? target : "—"
					}),
					reason !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.mcpReason,
						children: reason
					}) : null,
					editReason !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.mcpReason,
						children: editReason
					}) : null,
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpDetail, { server }) : null
				]
			});
		}
		function McpView(props) {
			const { data, loading, error, notice } = props;
			/** 等待确认删除的服务器（确认框关掉即丢弃）。 */
			const [pendingRemove, setPendingRemove] = (0, react.useState)(null);
			const totalTools = (data?.servers ?? []).reduce((sum, server) => sum + server.tools.length, 0);
			const addDisabled = loading || data === null || props.busyEntry !== null;
			const noticeClass = notice === null ? "" : notice.kind === "error" ? panel_module_css_default.errorBanner : notice.kind === "warn" ? panel_module_css_default.warnBanner : panel_module_css_default.successBanner;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.mcpBar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.opBtn,
							disabled: loading,
							onClick: props.onRefresh,
							children: loading ? tt("mcp.loading") : tt("mcp.refresh")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.opBtn,
							disabled: addDisabled,
							onClick: () => {
								props.onOpenEditor();
							},
							children: tt("mcp.add")
						}),
						data !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.mcpSummary,
							children: tt("mcp.summary", {
								servers: data.servers.length,
								tools: totalTools
							})
						}) : null,
						data !== null && data.canManage === false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.hint,
							children: tt("mcp.noManager")
						}) : null
					]
				}),
				error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.errorBanner,
					role: "alert",
					children: tt("mcp.error", { error })
				}) : null,
				notice !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: noticeClass,
					role: "status",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt(notice.key, notice.values ?? {}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button,
						onClick: props.onDismissNotice,
						children: tt("err.dismiss")
					})]
				}) : null,
				data !== null && data.warnings.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.warnBanner,
					role: "status",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: data.warnings.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.diagReason,
						children: line
					}, index + ":" + line)) })
				}) : null,
				data === null && loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: tt("mcp.loading")
				}) : null,
				data !== null && data.servers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: data.configPath !== null ? tt("mcp.empty", { path: data.configPath }) : tt("mcp.emptyNoPath")
				}) : null,
				data !== null && data.servers.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
					className: panel_module_css_default.section,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.list,
						children: data.servers.map((server) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpServerRow, {
							server,
							open: props.expanded.has(server.entryId),
							busy: props.busyEntry !== null,
							canManage: data.canManage,
							onToggle: props.onToggle,
							onToggleExpanded: props.onToggleExpanded,
							onEdit: props.onOpenEditor,
							onAskRemove: setPendingRemove
						}, server.entryId))
					})
				}) : null,
				data !== null && data.orphanTools.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: panel_module_css_default.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.sectionTitle,
							children: tt("mcp.orphan", { count: data.orphanTools.length })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.hintLine,
							children: tt("mcp.orphanHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.mcpOrphans,
							children: data.orphanTools.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.mcpMono,
								children: name
							}, name))
						})
					]
				}) : null,
				pendingRemove !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					title: tt("mcp.deleteConfirmTitle"),
					text: tt("mcp.deleteConfirmText", { name: pendingRemove.serverName }),
					confirmLabel: tt("mcp.delete"),
					danger: true,
					onCancel: () => {
						setPendingRemove(null);
					},
					onConfirm: () => {
						const entryId = pendingRemove.entryId;
						setPendingRemove(null);
						props.onRemoveServer(entryId);
					}
				}) : null,
				props.editor !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpServerDialog, {
					editor: props.editor,
					busy: props.editorBusy,
					errors: props.editorErrors,
					error: props.editorError,
					onCancel: props.onCloseEditor,
					onSave: (input) => {
						props.onSaveServer(input, props.editor?.mode === "edit" ? props.editor.server.entryId : void 0);
					}
				}) : null
			] });
		}
		// src/client/panel/PanelDialogs.tsx
		function PanelDialogs(props) {
			const { confirmDialog, setConfirmDialog, runConfirmed, branchChoice, branchBusy, setBranchChoice, confirmBranchChoice, versionDialog, versionBusy, setVersionDialog, confirmVersionDialog, marketSyncDialog, syncBusy, setMarketSyncDialog, confirmMarketSync, deleteSkillDialog, setDeleteSkillDialog, runDeleteSkill, confirmClearTrash, setConfirmClearTrash, clearTrash } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				confirmDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					title: confirmDialog.kind === "sync" ? tt("source.syncConfirmTitle") : tt("source.deleteConfirmTitle"),
					text: confirmDialog.kind === "sync" ? tt("source.syncConfirmText") : tt("source.deleteConfirmText"),
					items: confirmDialog.skills,
					confirmLabel: confirmDialog.kind === "sync" ? tt("source.sync") : tt("source.followDelete"),
					danger: confirmDialog.kind === "delete",
					onCancel: () => {
						setConfirmDialog(null);
					},
					onConfirm: () => {
						runConfirmed();
					}
				}) : null,
				branchChoice !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BranchChoiceDialog, {
					choice: branchChoice,
					busy: branchBusy,
					onSelect: (selected) => {
						setBranchChoice({
							...branchChoice,
							selected
						});
					},
					onCancel: () => {
						setBranchChoice(null);
					},
					onConfirm: () => {
						confirmBranchChoice();
					}
				}) : null,
				versionDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VersionChoiceDialog, {
					choice: versionDialog,
					busy: versionBusy,
					onSelect: (selected) => {
						setVersionDialog((previous) => previous === null ? previous : {
							...previous,
							selected,
							custom: ""
						});
					},
					onCustom: (custom) => {
						setVersionDialog((previous) => previous === null ? previous : {
							...previous,
							custom
						});
					},
					onCancel: () => {
						setVersionDialog(null);
					},
					onConfirm: () => {
						confirmVersionDialog();
					}
				}) : null,
				marketSyncDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketSyncDialog, {
					dialog: marketSyncDialog,
					busy: syncBusy,
					onToggle: (name, checked) => {
						const next = new Set(marketSyncDialog.selected);
						if (checked) next.add(name);
						else next.delete(name);
						setMarketSyncDialog({
							...marketSyncDialog,
							selected: next
						});
					},
					onCancel: () => {
						setMarketSyncDialog(null);
					},
					onConfirm: () => {
						confirmMarketSync();
					}
				}) : null,
				deleteSkillDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					title: tt("delete.confirmTitle"),
					text: tt("delete.confirmText", { name: deleteSkillDialog }),
					confirmLabel: tt("delete.confirm"),
					danger: true,
					onCancel: () => {
						setDeleteSkillDialog(null);
					},
					onConfirm: () => {
						runDeleteSkill();
					}
				}) : null,
				confirmClearTrash ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					title: tt("source.clearTrashConfirmTitle"),
					text: tt("source.clearTrashConfirmText"),
					confirmLabel: tt("source.clearTrashConfirm"),
					danger: true,
					onCancel: () => {
						setConfirmClearTrash(false);
					},
					onConfirm: () => {
						clearTrash();
					}
				}) : null
			] });
		}
		// src/client/panel/last-view.ts
		/** 分类顺序与标签键（内容分类在前，用户指定的 AGENTS.md → Skill → MCP → Hook；「关于」收尾）。 */
		const CATEGORY_ORDER = [
			"agents",
			"skills",
			"mcp",
			"hooks",
			"about"
		];
		/** 没有记录时的默认页：Skill / 来源。 */
		const DEFAULT_VIEW = {
			category: "skills",
			tab: "sources"
		};
		/** localStorage key of the last visited page (per browser, survives sessions). */
		const LAST_VIEW_KEY = "skill-hub.last-view";
		function isCategory(value) {
			return typeof value === "string" && CATEGORY_ORDER.includes(value);
		}
		function isTab(value) {
			return value === "sources" || value === "market";
		}
		/**
		* 读取上次离开的页面。字段分别校验：分类坏了整条作废（回到默认分类），
		* tab 坏了只回到「来源」——一个字段的损坏不该连累另一个。
		*/
		function readLastView() {
			try {
				const raw = localStorage.getItem(LAST_VIEW_KEY);
				if (raw === null) return { ...DEFAULT_VIEW };
				const parsed = JSON.parse(raw);
				if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_VIEW };
				const record = parsed;
				return {
					category: isCategory(record.category) ? record.category : DEFAULT_VIEW.category,
					tab: isTab(record.tab) ? record.tab : DEFAULT_VIEW.tab
				};
			} catch {
				return { ...DEFAULT_VIEW };
			}
		}
		/** 记录离开时停留的页面。 */
		function rememberView(view) {
			try {
				localStorage.setItem(LAST_VIEW_KEY, JSON.stringify({
					category: view.category,
					tab: view.tab
				}));
			} catch {}
		}
		// src/client/panel/hooks/useEditFlow.ts
		/**
		* useEditFlow — 正文编辑的草稿状态：正文框始终可写，草稿与磁盘内容分居两侧。
		*
		* 没有「编辑态」开关：详情页一到达就把当前正文放进来，用户直接改；下面固定
		* 是「保存 / 放弃所有编辑」。保存成功后草稿与基准都换成落盘的那份（按钮随之
		* 变灰），放弃则二次确认后回到载入时的磁盘内容。
		*
		* 冲突语义（需求契约）：保存时带上载入时的 mtime + 大小，host 发现磁盘上的
		* 文件已经变过就回 409 + 最新内容，这里弹三选——
		*   复制并重新加载：草稿复制到剪贴板，正文换成磁盘上的最新版本；
		*   继续编辑：关掉弹窗，草稿原样保留，不写盘；
		*   仍然覆盖：不带指纹再存一次，用草稿覆盖磁盘。
		*/
		/** 载入指纹（两端都在才带；host 只在两端都有时比对）。 */
		function fingerprint(target) {
			return target.modifiedAt !== void 0 && target.size !== void 0 ? {
				expectedMtime: target.modifiedAt,
				expectedSize: target.size
			} : {};
		}
		/** 冲突响应体里的 `latest`（类型守卫，避免把脏数据塞进正文框）。 */
		function latestOf(body) {
			if (typeof body !== "object" || body === null) return void 0;
			const latest = body.latest;
			if (latest === void 0 || typeof latest.content !== "string") return void 0;
			if (typeof latest.modifiedAt !== "number" || typeof latest.size !== "number") return void 0;
			return {
				content: latest.content,
				modifiedAt: latest.modifiedAt,
				size: latest.size
			};
		}
		function useEditFlow(api, onSaved) {
			const [session, setSessionState] = (0, react.useState)(null);
			/** 同一份状态的可同步读取句柄：保存/放弃要看最新的草稿，不能等下一次渲染。 */
			const sessionRef = (0, react.useRef)(null);
			const savedRef = (0, react.useRef)(onSaved);
			savedRef.current = onSaved;
			const apply = (0, react.useCallback)((next) => {
				sessionRef.current = next;
				setSessionState(next);
			}, []);
			const patch = (0, react.useCallback)((next) => {
				const current = sessionRef.current;
				if (current === null) return;
				apply({
					...current,
					...next
				});
			}, [apply]);
			/**
			* 详情页正文到达/刷新时把会话对齐到当前文件。同一个文件不清草稿：只有
			* 「磁盘正文确实变了」才动它（草稿干净就跟上，脏就保留，等保存时弹三选）。
			* 正文没变但指纹变了（例如刚改过调用方式）时只换指纹，避免误判冲突。
			*/
			const begin = (0, react.useCallback)((target, content) => {
				const current = sessionRef.current;
				if (current === null || current.target.kind !== target.kind || current.target.key !== target.key) {
					apply({
						target,
						base: content,
						draft: content,
						busy: false
					});
					return;
				}
				if (content === current.base) {
					patch({ target });
					return;
				}
				if (current.draft === current.base) apply({
					target,
					base: content,
					draft: content,
					busy: false
				});
			}, [apply, patch]);
			/** 离开详情页：丢掉会话（回来时按磁盘内容重新开始）。 */
			const clear = (0, react.useCallback)(() => {
				apply(null);
			}, [apply]);
			/** 有未保存改动时先确认；返回 false 表示用户选择继续编辑。 */
			const confirmDiscard = (0, react.useCallback)(() => {
				const current = sessionRef.current;
				if (current === null || current.draft === current.base) return true;
				return window.confirm(tt("detail.editDiscard"));
			}, []);
			/** 放弃所有编辑：二次确认后恢复成载入时的磁盘内容。 */
			const discard = (0, react.useCallback)(() => {
				const current = sessionRef.current;
				if (current === null || current.draft === current.base) return;
				if (!window.confirm(tt("detail.editDiscard"))) return;
				patch({
					draft: current.base,
					error: void 0,
					conflict: void 0
				});
			}, [patch]);
			const commit = (0, react.useCallback)(async (overwrite) => {
				const current = sessionRef.current;
				if (current === null || current.busy) return;
				if (!overwrite && current.draft === current.base) return;
				patch({
					busy: true,
					error: void 0,
					conflict: void 0
				});
				const expected = overwrite ? {} : fingerprint(current.target);
				try {
					if (current.target.kind === "skill") {
						const payload = {
							name: current.target.key,
							...current.target.cwd !== void 0 && current.target.cwd !== "" ? { cwd: current.target.cwd } : {},
							content: current.draft,
							...expected
						};
						const saved = await api.saveSkillContent(payload);
						apply({
							target: {
								...current.target,
								modifiedAt: saved.modifiedAt,
								size: saved.size
							},
							base: saved.content,
							draft: saved.content,
							busy: false
						});
						savedRef.current({
							kind: "skill",
							name: current.target.key,
							...current.target.cwd !== void 0 ? { cwd: current.target.cwd } : {},
							path: saved.path,
							snapshot: {
								content: saved.content,
								modifiedAt: saved.modifiedAt,
								size: saved.size
							}
						});
					} else {
						const payload = {
							path: current.target.key,
							content: current.draft,
							...expected
						};
						const saved = await api.saveAgentsFile(payload);
						apply({
							target: {
								...current.target,
								modifiedAt: saved.modifiedAt,
								size: saved.size
							},
							base: current.draft,
							draft: current.draft,
							busy: false
						});
						savedRef.current({
							kind: "agents",
							path: saved.path,
							snapshot: {
								content: current.draft,
								modifiedAt: saved.modifiedAt,
								size: saved.size
							}
						});
					}
				} catch (error) {
					if (error instanceof SkillHubApiError && error.code === "stale") {
						const latest = latestOf(error.body);
						if (latest !== void 0) {
							patch({
								busy: false,
								conflict: latest
							});
							return;
						}
					}
					patch({
						busy: false,
						error: errorMessage(error)
					});
				}
			}, [
				api,
				apply,
				patch
			]);
			const save = (0, react.useCallback)(() => {
				commit(false);
			}, [commit]);
			const resolveConflict = (0, react.useCallback)((choice) => {
				const current = sessionRef.current;
				if (current === null || current.conflict === void 0) return;
				const latest = current.conflict;
				if (choice === "continue") {
					patch({ conflict: void 0 });
					return;
				}
				if (choice === "copy-reload") {
					copyTextToClipboard(current.draft);
					apply({
						target: {
							...current.target,
							modifiedAt: latest.modifiedAt,
							size: latest.size
						},
						base: latest.content,
						draft: latest.content,
						busy: false
					});
					return;
				}
				commit(true);
			}, [
				apply,
				commit,
				patch
			]);
			return {
				session,
				/** 当前有未保存改动。 */
				dirty: session !== null && session.draft !== session.base,
				begin,
				clear,
				setDraft: (value) => {
					patch({ draft: value });
				},
				save,
				discard,
				confirmDiscard,
				resolveConflict
			};
		}
		// src/client/panel/hooks/useGroupView.ts
		/**
		* useGroupView — 分组视图的派生数据：来源过滤后的技能、可见集合、用户级
		* 管理方聚合、项目级成员、顶层顺序，以及「可折叠节点」与「是否已全部折叠」。
		*
		* 抽出来是因为「全部折叠」按钮长在视图切换那一行（「分组」右边），而折叠
		* 键必须和 SourcesView 渲染的节点完全一致：两处共用同一份推导，避免按钮
		* 算到的键与列表里的键对不上（点了只折叠一半）。纯派生，不发起请求。
		*/
		function useGroupView(hub) {
			const { groupsState, sourceFilter, origins, sorted, collapsedGroups, subdividedProjects } = hub;
			const sourceFiltered = (0, react.useMemo)(() => filterBySource(sorted, sourceFilter, origins), [
				sorted,
				sourceFilter,
				origins
			]);
			const projectSkillsAll = (0, react.useMemo)(() => sourceFiltered.filter((skill) => isProjectSource(skill.source)), [sourceFiltered]);
			const hasProject = projectSkillsAll.length > 0;
			const visible = (0, react.useMemo)(() => visibleCollections(groupsState?.collections ?? [], sourceFiltered), [groupsState, sourceFiltered]);
			const collections = (0, react.useMemo)(() => visible.map((entry) => entry.collection), [visible]);
			const uncategorized = (0, react.useMemo)(() => sourceFiltered.filter((skill) => origins[skill.name] === void 0 && !isProjectSource(skill.source)), [sourceFiltered, origins]);
			const allPersonalNames = (0, react.useMemo)(() => uncategorized.map((skill) => skill.name), [uncategorized]);
			const hasPersonal = allPersonalNames.length > 0;
			const personalBuckets = (0, react.useMemo)(() => personalManagedBuckets(uncategorized), [uncategorized]);
			const subdividedPersonal = personalBuckets.length > 1;
			/** 顶层分组顺序：用户级 → 来源集合 → 项目级（全部由数据推导，不可重排）。 */
			const topKeys = (0, react.useMemo)(() => [
				...hasPersonal ? ["uncategorized-source"] : [],
				...collections.map((collection) => "col:" + collection.name),
				...hasProject ? ["project"] : []
			], [
				hasPersonal,
				collections,
				hasProject
			]);
			/** 仍然可以折叠的节点（顶层已改成小标题，只剩二级/集合）。 */
			const collapsibleKeys = (0, react.useMemo)(() => {
				const keys = /* @__PURE__ */ new Set();
				for (const collection of collections) keys.add("col:" + collection.name);
				for (const skill of projectSkillsAll) {
					const workspace = skill.workspace ?? skill.source;
					keys.add("project:" + workspace);
					if (subdividedProjects.has(workspace)) keys.add("project:" + workspace + ":" + skill.source);
				}
				if (subdividedPersonal) for (const bucket of personalBuckets) keys.add("personal:" + bucket.key);
				return [...keys];
			}, [
				collections,
				projectSkillsAll,
				subdividedProjects,
				subdividedPersonal,
				personalBuckets
			]);
			return {
				sourceFiltered,
				projectSkillsAll,
				hasProject,
				visible,
				collections,
				uncategorized,
				allPersonalNames,
				hasPersonal,
				personalBuckets,
				subdividedPersonal,
				topKeys,
				collapsibleKeys,
				allCollapsed: collapsibleKeys.length > 0 && collapsibleKeys.every((key) => collapsedGroups.has(key))
			};
		}
		// src/client/panel/hooks/useTokenCount.ts
		/**
		* useTokenCount — 打开详情页时异步数一次当前文件原文的 token。
		*
		* 触发时机：原文出现或换成另一份（进入详情页、在列表里点开另一行、保存
		* 正文后回填新正文）。不轮询、不防抖，也不跟随编辑态里的草稿——数字永远
		* 是磁盘上那份正文的数字；返回列表再点回来会重新数一次（宿主侧没有结果
		* 缓存，只有常驻的 tokenizer）。
		*
		* 状态是互斥的四档而不是几个并列布尔：表格要区分「还没开始（正文没到）」
		* 「在算」「算完了」「整个请求失败」，这四件事在 UI 上是四种文案，用布尔
		* 组合迟早会拼出`loading=false && entries=null`这种说不清的状态。
		*/
		/**
		* @param api - panel 的 API 客户端。
		* @param text - 被计数的文件原文；`undefined` 表示正文还没到（详情页先渲染
		*   标题与元数据，正文随后到），此时不发请求。
		* @param revision - 额外的重算信号：用户在「管理模型」里改了选中集合，原文没变
		*   但行变了，靠这个自增值再数一次。
		* @returns 当前这次计数的状态。
		*/
		function useTokenCount(api, text, revision = 0) {
			const [state, setState] = (0, react.useState)({ status: "idle" });
			(0, react.useEffect)(() => {
				if (text === void 0) {
					setState({ status: "idle" });
					return;
				}
				let cancelled = false;
				setState({ status: "loading" });
				api.countTokens(text).then((entries) => {
					if (!cancelled) setState({
						status: "ready",
						entries
					});
				}).catch((error) => {
					if (!cancelled) setState({
						status: "failed",
						error: errorMessage(error)
					});
				});
				return () => {
					cancelled = true;
				};
			}, [
				api,
				text,
				revision
			]);
			return state;
		}
		// src/client/panel/hooks/useTokenModels.ts
		/**
		* useTokenModels — 「管理模型」的数据与动作：列出全部可选模型、记住当前选中，
		* 勾选就调用宿主下载词表、取消勾选就让宿主删掉那份词表。
		*
		* 选中集合存在宿主侧（插件数据目录的 state.json），不是 localStorage：它决定
		* 磁盘上留哪几份 25 MB 级词表，属于"这台机器装了什么"，换浏览器不该变。
		*
		* busy 记正在下载/删除的那一个 id：下载 19 MB 要几秒，期间把整组 checkbox 都
		* 禁用，避免用户在同一个模型上连点两次（第二次会看到"已勾选"又立刻反选）。
		*/
		function useTokenModels(api, enabled) {
			const [models, setModels] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(void 0);
			const reload = (0, react.useCallback)(async () => {
				setLoading(true);
				try {
					setModels(await api.tokenModels());
					setError(void 0);
				} catch (caught) {
					setError(errorMessage(caught));
				} finally {
					setLoading(false);
				}
			}, [api]);
			(0, react.useEffect)(() => {
				if (!enabled) return;
				reload();
			}, [enabled, reload]);
			return {
				models,
				loading,
				busy,
				error,
				select: (0, react.useCallback)(async (id, selected) => {
					setBusy(id);
					try {
						setModels(await api.selectTokenModel(id, selected));
						setError(void 0);
						return true;
					} catch (caught) {
						setError(errorMessage(caught));
						return false;
					} finally {
						setBusy(null);
					}
				}, [api]),
				reload
			};
		}
		// src/client/panel/hooks/shared.ts
		/**
		* 统一异步动作外壳：清错 → 执行 → 异常转错误条幅 → 收尾（忙碌开关）。
		* 只用于同形的 clearFail/try/catch/finally 站点；成功后清错、自定义收尾、
		* 需要返回值的站点保持内联。
		*/
		async function runFlow(shared, body, settle = () => {}) {
			shared.clearFail();
			try {
				return await body();
			} catch (error) {
				shared.fail(errorMessage(error));
				return;
			} finally {
				settle();
			}
		}
		/** Catalog poll interval while the panel is mounted (the provider watcher feeds this). */
		const POLL_MS = 5e3;
		/** Relaxed poll for slower-changing data (stats, groups, sources, config). */
		const SLOW_POLL_MS = 6e4;
		/** localStorage key of the last daily auto-check timestamp (survives sessions). */
		const AUTO_CHECK_KEY = "skill-hub.last-auto-check";
		/** Daily auto-check interval: at most one network round per day. */
		const AUTO_CHECK_INTERVAL_MS = 864e5;
		/** Whether the daily auto-check should run now (first visit or ≥24h since the last). */
		function shouldAutoCheck() {
			try {
				const raw = localStorage.getItem(AUTO_CHECK_KEY);
				const last = raw === null ? NaN : Number(raw);
				if (!Number.isFinite(last)) return true;
				return Date.now() - last >= AUTO_CHECK_INTERVAL_MS;
			} catch {
				return true;
			}
		}
		/** Record that the daily auto-check ran. */
		function markAutoChecked() {
			try {
				localStorage.setItem(AUTO_CHECK_KEY, String(Date.now()));
			} catch {}
		}
		// src/client/panel/hooks/useMetaFlow.ts
		/**
		* useMetaFlow — 自身更新检查 + 调用统计 + 配置：只依赖 api，
		* 不碰其他域。补捞 effect 自包含（uses.size + loadUses）。
		*/
		function useMetaFlow(api) {
			const [updateState, setUpdateState] = (0, react.useState)({ status: "idle" });
			const [uses, setUses] = (0, react.useState)(/* @__PURE__ */ new Map());
			const [hubConfig, setHubConfig] = (0, react.useState)(null);
			const loadUses = (0, react.useCallback)(async () => {
				try {
					const result = await api.stats();
					if (result.available) setUses(new Map(result.stats.map((stat) => [stat.name, {
						count: stat.count,
						...stat.lastUsed !== void 0 ? { lastUsed: stat.lastUsed } : {}
					}])));
				} catch {}
			}, [api]);
			const loadConfig = (0, react.useCallback)(async () => {
				try {
					setHubConfig((await api.config()).config);
				} catch {}
			}, [api]);
			const checkUpdate = (0, react.useCallback)(async () => {
				setUpdateState({ status: "checking" });
				try {
					setUpdateState({
						status: "ready",
						data: await api.updateCheck()
					});
				} catch (error) {
					setUpdateState({
						status: "error",
						message: errorMessage(error)
					});
				}
			}, [api]);
			const usesCatchUp = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				if (uses.size > 0 || usesCatchUp.current >= 72) return;
				const timer = window.setInterval(() => {
					usesCatchUp.current += 1;
					loadUses();
					if (usesCatchUp.current >= 72) window.clearInterval(timer);
				}, POLL_MS);
				return () => {
					window.clearInterval(timer);
				};
			}, [uses.size, loadUses]);
			return {
				updateState,
				checkUpdate,
				uses,
				loadUses,
				hubConfig,
				loadConfig
			};
		}
		// src/client/panel/hooks/useCatalogFlow.ts
		/**
		* useCatalogFlow — 目录域：catalog 加载、详情、新建、诊断修复，以及列表
		* 过滤/排序派生。跨域刷新只通过 shared 通知，不直接碰其他域的 state。
		*/
		function useCatalogFlow(api, uses, shared, collapsePersonal, clearSourceFilter) {
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [detail, setDetail] = (0, react.useState)(null);
			const [detailLoading, setDetailLoading] = (0, react.useState)(false);
			const [busyNames, setBusyNames] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [search, setSearch] = (0, react.useState)("");
			/** 工作区（项目）路径；空 = 只看用户级技能。 */
			const [workspace, setWorkspace] = (0, react.useState)("");
			const [showForm, setShowForm] = (0, react.useState)(false);
			const [formName, setFormName] = (0, react.useState)("");
			const [formDesc, setFormDesc] = (0, react.useState)("");
			const [formRoot, setFormRoot] = (0, react.useState)("user-dsh");
			const [formBusy, setFormBusy] = (0, react.useState)(false);
			const [formMessage, setFormMessage] = (0, react.useState)(null);
			const [fixingPaths, setFixingPaths] = (0, react.useState)(/* @__PURE__ */ new Set());
			/** 详情页调用方式写入中（checkbox 与提示条共用）。 */
			const [invocationBusy, setInvocationBusy] = (0, react.useState)(false);
			const [invocationFilter, setInvocationFilter] = (0, react.useState)("all");
			const [sortKey, setSortKey] = (0, react.useState)("name");
			const autoCollapsedPersonal = (0, react.useRef)(false);
			const load = (0, react.useCallback)(async () => {
				try {
					const next = await api.catalog(workspace !== "" ? { cwd: workspace } : void 0);
					setCatalog(next);
					if (!autoCollapsedPersonal.current && next.skills.length > 80) {
						autoCollapsedPersonal.current = true;
						collapsePersonal();
					}
					shared.clearFail();
				} catch (error) {
					shared.fail(errorMessage(error));
				} finally {
					setLoading(false);
				}
			}, [
				api,
				workspace,
				shared,
				collapsePersonal
			]);
			const openDetail = (0, react.useCallback)(async (name) => {
				setDetailLoading(true);
				await runFlow(shared, async () => {
					setDetail(await api.skill(name, workspace !== "" ? { cwd: workspace } : void 0));
				}, () => setDetailLoading(false));
			}, [
				api,
				workspace,
				shared
			]);
			/** 在 Finder 中显示一个技能文件（host 调 `open -R`；找不到文件时报错条幅）。 */
			const reveal = (0, react.useCallback)((name, cwd) => {
				runFlow(shared, async () => {
					await api.revealSkill(name, cwd);
				});
			}, [api, shared]);
			const fixDiagnostic = (0, react.useCallback)(async (path) => {
				setFixingPaths((previous) => new Set(previous).add(path));
				await runFlow(shared, async () => {
					if (!window.confirm(tt("diag.fixConfirm", { path }))) return;
					await api.fixDiagnostic(path);
					await load();
					shared.succeed(tt("diag.fixed"));
				}, () => {
					setFixingPaths((previous) => {
						const next = new Set(previous);
						next.delete(path);
						return next;
					});
				});
			}, [
				api,
				load,
				shared
			]);
			/**
			* 写调用方式：host 改 SKILL.md 的两个键并让注册表缓存失效，这里再回读
			* 一次详情与目录，保证圆点、筛选与页内 checkbox 三处同步。
			*/
			const setInvocation = (0, react.useCallback)(async (name, modelInvocable, userInvocable) => {
				setInvocationBusy(true);
				await runFlow(shared, async () => {
					await api.setInvocation({
						name,
						modelInvocable,
						userInvocable,
						...workspace !== "" ? { cwd: workspace } : {}
					});
					setDetail(await api.skill(name, workspace !== "" ? { cwd: workspace } : void 0));
					await load();
				}, () => setInvocationBusy(false));
			}, [
				api,
				load,
				shared,
				workspace
			]);
			const create = (0, react.useCallback)(async (event) => {
				event.preventDefault();
				setFormBusy(true);
				setFormMessage(null);
				shared.succeed(null);
				try {
					const result = await api.create({
						name: formName,
						description: formDesc,
						root: formRoot
					});
					shared.succeed(tt("form.success") + result.path);
					setFormName("");
					setFormDesc("");
					setShowForm(false);
					await load();
				} catch (error) {
					setFormMessage({
						kind: "error",
						text: tt("form.error") + errorMessage(error)
					});
				} finally {
					setFormBusy(false);
				}
			}, [
				api,
				formName,
				formDesc,
				formRoot,
				load,
				shared
			]);
			const normalized = search.trim().toLocaleLowerCase();
			const filtered = (0, react.useMemo)(() => (catalog?.skills ?? []).filter((skill) => {
				if (invocationFilter === "model" && !skill.invocation.modelInvocable) return false;
				if (invocationFilter === "user" && !skill.invocation.userInvocable) return false;
				if (normalized.length === 0) return true;
				return skill.name.toLocaleLowerCase().includes(normalized) || skill.description.toLocaleLowerCase().includes(normalized) || skill.displayName?.toLocaleLowerCase().includes(normalized) || skill.shortDescription?.toLocaleLowerCase().includes(normalized);
			}), [
				catalog,
				normalized,
				invocationFilter
			]);
			/** Rows actually rendered with a shortened description (shortDescription in use). */
			const shortenedCount = (0, react.useMemo)(() => filtered.filter((skill) => skill.shortDescription !== void 0).length, [filtered]);
			return {
				catalog,
				loading,
				detail,
				detailLoading,
				busyNames,
				search,
				workspace,
				showForm,
				formName,
				formDesc,
				formRoot,
				formBusy,
				formMessage,
				fixingPaths,
				invocationBusy,
				invocationFilter,
				sortKey,
				normalized,
				filtered,
				sorted: (0, react.useMemo)(() => sortSkills(filtered, sortKey, (name) => uses.get(name)?.count), [
					filtered,
					sortKey,
					uses
				]),
				shortenedCount,
				setDetail,
				setSearch,
				setWorkspace,
				setShowForm,
				setFormName,
				setFormDesc,
				setFormRoot,
				setFormMessage,
				setInvocationFilter,
				setSortKey,
				load,
				openDetail,
				fixDiagnostic,
				setInvocation,
				create,
				clearListFilters: (0, react.useCallback)(() => {
					setSearch("");
					clearSourceFilter();
					setInvocationFilter("all");
				}, [clearSourceFilter]),
				reveal
			};
		}
		// src/client/panel/hooks/useGroupFlow.ts
		/**
		* useGroupFlow — 分组域：groups 加载（集合组 + origin 映射）。组内技能的
		* 启用/禁用不存在之后，这里只剩数据加载。
		*/
		function useGroupFlow(api, shared) {
			const [groupsState, setGroupsState] = (0, react.useState)(null);
			return {
				groupsState,
				loadGroups: (0, react.useCallback)(async () => {
					try {
						setGroupsState(await api.groups());
					} catch (error) {
						shared.fail(errorMessage(error));
					}
				}, [api, shared])
			};
		}
		// src/client/panel/hooks/useSourceFlow.ts
		/**
		* useSourceFlow — 来源域：来源列表/更新检查/同步确认/跟进删除/回收站恢复/
		* 清空回收站，以及单个技能的删除确认流。目录与分组的刷新经聚合根
		* 传入的 reload 回调，不直接碰其他域的 state。
		*/
		function useSourceFlow(api, shared, reloadCatalog, reloadGroups) {
			const [sourcesState, setSourcesState] = (0, react.useState)(null);
			const [sourceCheck, setSourceCheck] = (0, react.useState)({});
			const [checkingSource, setCheckingSource] = (0, react.useState)(null);
			const [syncingSource, setSyncingSource] = (0, react.useState)(null);
			const [confirmDialog, setConfirmDialog] = (0, react.useState)(null);
			const [deleteSkillDialog, setDeleteSkillDialog] = (0, react.useState)(null);
			const [confirmClearTrash, setConfirmClearTrash] = (0, react.useState)(false);
			/** 加载来源记录 + 回收站。 */
			const loadSources = (0, react.useCallback)(async () => {
				try {
					setSourcesState(await api.sources());
				} catch (error) {
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			return {
				sourcesState,
				sourceCheck,
				checkingSource,
				syncingSource,
				confirmDialog,
				deleteSkillDialog,
				confirmClearTrash,
				setConfirmDialog,
				setDeleteSkillDialog,
				setConfirmClearTrash,
				loadSources,
				checkSources: (0, react.useCallback)(async (repo) => {
					setCheckingSource(repo ?? "all");
					await runFlow(shared, async () => {
						const result = await api.checkSources(repo);
						const next = { ...sourceCheck };
						for (const item of result.results) next[item.repo] = item;
						setSourceCheck(next);
					}, () => setCheckingSource(null));
				}, [
					api,
					sourceCheck,
					shared
				]),
				requestSync: (0, react.useCallback)((repo, skills) => {
					setConfirmDialog({
						kind: "sync",
						repo,
						skills
					});
				}, []),
				requestDelete: (0, react.useCallback)((repo, skills) => {
					setConfirmDialog({
						kind: "delete",
						repo,
						skills
					});
				}, []),
				runConfirmed: (0, react.useCallback)(async () => {
					const dialog = confirmDialog;
					if (dialog === null) return;
					setConfirmDialog(null);
					if (dialog.kind === "sync") {
						setSyncingSource(dialog.repo);
						await runFlow(shared, async () => {
							const result = await api.syncSource(dialog.repo, dialog.skills);
							await Promise.all([
								reloadCatalog(),
								reloadGroups(),
								loadSources()
							]);
							if (result.failed.length > 0) shared.fail("sync: " + result.failed.map((failure) => failure.name + ": " + failure.error).join("; "));
						}, () => setSyncingSource(null));
					} else {
						shared.clearFail();
						try {
							await api.confirmDeleteSource(dialog.repo, dialog.skills);
							await Promise.all([
								reloadCatalog(),
								reloadGroups(),
								loadSources()
							]);
						} catch (error) {
							shared.fail(errorMessage(error));
						}
					}
				}, [
					confirmDialog,
					api,
					reloadCatalog,
					reloadGroups,
					loadSources,
					shared
				]),
				restoreTrash: (0, react.useCallback)(async (name) => {
					shared.setListBusy(true);
					await runFlow(shared, async () => {
						await api.restoreSource(name);
						await Promise.all([
							reloadCatalog(),
							reloadGroups(),
							loadSources()
						]);
					}, () => shared.setListBusy(false));
				}, [
					api,
					reloadCatalog,
					reloadGroups,
					loadSources,
					shared
				]),
				clearTrash: (0, react.useCallback)(async () => {
					setConfirmClearTrash(false);
					shared.setListBusy(true);
					await runFlow(shared, async () => {
						const result = await api.clearTrash();
						if (result.failed.length > 0) shared.fail("clear trash: " + result.failed.map((failure) => failure.name + ": " + failure.error).join("; "));
						await Promise.all([reloadCatalog(), loadSources()]);
					}, () => shared.setListBusy(false));
				}, [
					api,
					reloadCatalog,
					loadSources,
					shared
				]),
				requestDeleteSkill: (0, react.useCallback)((name) => {
					setDeleteSkillDialog(name);
				}, []),
				runDeleteSkill: (0, react.useCallback)(async () => {
					const name = deleteSkillDialog;
					if (name === null) return;
					setDeleteSkillDialog(null);
					shared.setListBusy(true);
					await runFlow(shared, async () => {
						await api.deleteSkill(name);
						await Promise.all([
							reloadCatalog(),
							reloadGroups(),
							loadSources()
						]);
					}, () => shared.setListBusy(false));
				}, [
					api,
					deleteSkillDialog,
					reloadCatalog,
					reloadGroups,
					loadSources,
					shared
				])
			};
		}
		// src/client/panel/hooks/useRepoImportFlow.ts
		/**
		* useRepoImportFlow — 市场子域：仓库扫描/分支选择/导入任务（轮询+取消）。
		* 从 useMarketFlow 原样搬出：状态、动作、卸载中断与依赖顺序不变；市场源
		* 列表刷新（loadMarket）与目录/分组/来源重载经参数注入，不直接碰其他域。
		*/
		function useRepoImportFlow(api, shared, loadMarket, reloadCatalog, reloadGroups, reloadSources) {
			const [repoDiscoverState, setRepoDiscoverState] = (0, react.useState)({ status: "idle" });
			/** Market repo currently being scanned (null when idle); per-row busy state. */
			const [scanningRepo, setScanningRepo] = (0, react.useState)(null);
			const [repoSelected, setRepoSelected] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [repoImporting, setRepoImporting] = (0, react.useState)(false);
			const [repoResult, setRepoResult] = (0, react.useState)(null);
			const [importJobId, setImportJobId] = (0, react.useState)(null);
			const [branchChoice, setBranchChoice] = (0, react.useState)(null);
			const [branchBusy, setBranchBusy] = (0, react.useState)(false);
			const pollAbortRef = (0, react.useRef)(null);
			/** 扫描一个市场源（或手动输入）的仓库。 */
			const scanRepo = (0, react.useCallback)(async (input) => {
				const value = input.trim();
				if (value === "") return;
				setRepoResult(null);
				setRepoSelected(/* @__PURE__ */ new Set());
				setScanningRepo(value);
				setRepoDiscoverState({ status: "scanning" });
				shared.clearFail();
				try {
					const data = await api.repoDiscover(value);
					if (data.ref === null) {
						setBranchChoice({
							repo: data.repo,
							branches: data.branches ?? [],
							selected: (data.branches ?? [])[0] ?? "main"
						});
						setRepoDiscoverState({ status: "idle" });
						return;
					}
					setRepoDiscoverState({
						status: "ready",
						data
					});
					loadMarket();
				} catch (error) {
					setRepoDiscoverState({
						status: "error",
						message: errorMessage(error)
					});
				} finally {
					setScanningRepo(null);
				}
			}, [
				api,
				loadMarket,
				shared
			]);
			/** 确认分支选择：持久化 ref 后重新扫描。 */
			const confirmBranchChoice = (0, react.useCallback)(async () => {
				if (branchChoice === null) return;
				setBranchBusy(true);
				await runFlow(shared, async () => {
					await api.setMarketSourceRef(branchChoice.repo, branchChoice.selected);
					setBranchChoice(null);
					await scanRepo(branchChoice.repo);
				}, () => setBranchBusy(false));
			}, [
				api,
				branchChoice,
				scanRepo,
				shared
			]);
			/** Toggle one repo preview row. */
			const toggleRepoSelected = (0, react.useCallback)((path, checked) => {
				setRepoSelected((previous) => {
					const next = new Set(previous);
					if (checked) next.add(path);
					else next.delete(path);
					return next;
				});
			}, []);
			/** Import every checked, non-existing repo skill (B方案：job+轮询+进度). */
			const importRepo = (0, react.useCallback)(async () => {
				if (repoDiscoverState.status !== "ready") return;
				setRepoImporting(true);
				setRepoResult(null);
				setImportJobId(null);
				shared.clearFail();
				let finalProgress = null;
				try {
					const created = await api.repoImport(repoDiscoverState.data.repo, [...repoSelected], repoDiscoverState.data.ref ?? void 0);
					setImportJobId(created.jobId);
					setRepoResult({
						ok: true,
						jobId: created.jobId,
						status: "running",
						total: created.total,
						done: 0,
						totalBytes: created.totalBytes,
						downloadedBytes: 0,
						imported: [],
						skipped: [],
						failed: []
					});
					pollAbortRef.current?.abort();
					pollAbortRef.current = new AbortController();
					const signal = pollAbortRef.current.signal;
					let attempt = 0;
					for (;;) {
						if (signal.aborted) break;
						const delay = Math.min(2e3, 800 + attempt * 200);
						await new Promise((r) => setTimeout(r, delay));
						if (signal.aborted) break;
						try {
							const progress = await api.repoImportProgress(created.jobId);
							setRepoResult(progress);
							finalProgress = progress;
							if (progress.status !== "running") break;
							attempt = 0;
						} catch (pollError) {
							if (errorMessage(pollError).includes("not found")) break;
							attempt += 1;
							if (attempt > 8) break;
						}
					}
					await Promise.all([
						reloadCatalog(),
						loadMarket(),
						reloadGroups(),
						reloadSources()
					]);
				} catch (error) {
					shared.fail(errorMessage(error));
				} finally {
					if (finalProgress !== null && (finalProgress.imported.length > 0 || finalProgress.skipped.length > 0)) {
						const doneNames = /* @__PURE__ */ new Set([...finalProgress.imported.map((r) => r.name), ...finalProgress.skipped.map((r) => r.name)]);
						const donePaths = new Set(repoDiscoverState.data.entries.filter((e) => doneNames.has(e.name)).map((e) => e.path));
						setRepoSelected((prev) => {
							const next = new Set(prev);
							for (const p of donePaths) next.delete(p);
							return next;
						});
						setRepoDiscoverState((prev) => {
							if (prev.status !== "ready") return prev;
							return {
								...prev,
								data: {
									...prev.data,
									entries: prev.data.entries.map((e) => doneNames.has(e.name) ? {
										...e,
										existing: true
									} : e)
								}
							};
						});
					}
					setRepoImporting(false);
				}
			}, [
				api,
				repoDiscoverState,
				repoSelected,
				reloadCatalog,
				loadMarket,
				reloadGroups,
				reloadSources,
				shared
			]);
			(0, react.useEffect)(() => {
				return () => {
					pollAbortRef.current?.abort();
				};
			}, []);
			return {
				repoDiscoverState,
				scanningRepo,
				repoSelected,
				repoImporting,
				repoResult,
				importJobId,
				branchChoice,
				branchBusy,
				setBranchChoice,
				setRepoSelected,
				setRepoDiscoverState,
				setScanningRepo,
				setRepoResult,
				scanRepo,
				confirmBranchChoice,
				toggleRepoSelected,
				importRepo,
				cancelImport: (0, react.useCallback)(async () => {
					if (importJobId === null) return;
					pollAbortRef.current?.abort();
					try {
						const res = await api.repoImportCancel(importJobId);
						try {
							const progress = await api.repoImportProgress(importJobId);
							setRepoResult(progress);
						} catch {
							setRepoResult((prev) => prev !== null ? {
								...prev,
								status: res.status
							} : prev);
						}
					} catch (error) {
						shared.fail(errorMessage(error));
					} finally {
						setRepoImporting(false);
					}
				}, [
					api,
					importJobId,
					shared
				]),
				clearScan: (0, react.useCallback)(() => {
					setRepoDiscoverState({ status: "idle" });
					setScanningRepo(null);
					setRepoResult(null);
					setRepoSelected(/* @__PURE__ */ new Set());
					setImportJobId(null);
					pollAbortRef.current?.abort();
				}, [])
			};
		}
		// src/client/panel/hooks/useMarketFlow.ts
		/**
		* useMarketFlow — 市场域：市场源增删、更新检查、星标统计、版本同步、全部
		* 更新；仓库扫描/分支选择/导入任务在 useRepoImportFlow（这里组装它并透传
		* 同样的返回字段）。目录/分组/来源的刷新与来源检查经聚合根传入，不直接
		* 碰其他域的 state。
		*/
		function useMarketFlow(api, shared, reloadCatalog, reloadGroups, reloadSources, checkSources, sourceCheck) {
			const [marketState, setMarketState] = (0, react.useState)({
				status: "loading",
				repos: []
			});
			const [marketCheck, setMarketCheck] = (0, react.useState)({});
			const [marketSyncDialog, setMarketSyncDialog] = (0, react.useState)(null);
			const [syncingMarket, setSyncingMarket] = (0, react.useState)(null);
			const [syncBusy, setSyncBusy] = (0, react.useState)(false);
			const [newSourceName, setNewSourceName] = (0, react.useState)("");
			/** 市场源星星/下载数（SWR 缓存）。 */
			const [marketStats, setMarketStats] = (0, react.useState)({});
			/** 版本对话框：打开时拉 releases + branches，确认后定版并重扫。 */
			const [versionDialog, setVersionDialog] = (0, react.useState)(null);
			const [versionBusy, setVersionBusy] = (0, react.useState)(false);
			const [updateAllDialog, setUpdateAllDialog] = (0, react.useState)(false);
			/** 加载市场源列表。 */
			const loadMarket = (0, react.useCallback)(async () => {
				try {
					const next = await api.market();
					setMarketState({
						status: "ready",
						repos: next.repos
					});
				} catch (error) {
					setMarketState({
						status: "error",
						repos: []
					});
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			const { repoDiscoverState, scanningRepo, repoSelected, repoImporting, repoResult, importJobId, branchChoice, branchBusy, setBranchChoice, setRepoSelected, setRepoDiscoverState, setScanningRepo, setRepoResult, scanRepo, confirmBranchChoice, toggleRepoSelected, importRepo, cancelImport, clearScan } = useRepoImportFlow(api, shared, loadMarket, reloadCatalog, reloadGroups, reloadSources);
			/** 添加一个市场源（内置市场目录与手动输入共用），并立即扫描它。 */
			const addSource = (0, react.useCallback)(async (input) => {
				const value = input.trim();
				if (value === "") return;
				shared.clearFail();
				try {
					const result = await api.addMarketSource(value);
					setMarketState({
						status: "ready",
						repos: result.repos
					});
					setNewSourceName("");
					setRepoResult(null);
					setRepoSelected(/* @__PURE__ */ new Set());
					const slug = result.repo;
					setScanningRepo(slug);
					setRepoDiscoverState({ status: "scanning" });
					try {
						const data = await api.repoDiscover(slug);
						setRepoDiscoverState({
							status: "ready",
							data
						});
					} catch (error) {
						setRepoDiscoverState({
							status: "error",
							message: errorMessage(error)
						});
					} finally {
						setScanningRepo(null);
					}
				} catch (error) {
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			/** 手动输入框的添加动作。 */
			const addMarketSource = (0, react.useCallback)(async () => {
				await addSource(newSourceName);
			}, [addSource, newSourceName]);
			/** 删除一个市场源（不影响已装技能）。 */
			const removeMarketSource = (0, react.useCallback)(async (repo) => {
				shared.setListBusy(true);
				await runFlow(shared, async () => {
					const result = await api.removeMarketSource(repo);
					setMarketState({
						status: "ready",
						repos: result.repos
					});
				}, () => shared.setListBusy(false));
			}, [api, shared]);
			const openVersionDialog = (0, react.useCallback)(async (repo) => {
				const current = marketState.repos.find((item) => item.repo === repo)?.ref;
				setVersionDialog({
					repo,
					...current !== void 0 ? { current } : {},
					releases: [],
					branches: [],
					selected: current ?? "",
					custom: "",
					loading: true
				});
				shared.clearFail();
				try {
					const data = await api.marketSourceVersions(repo);
					setVersionDialog({
						repo,
						...data.current !== void 0 ? { current: data.current } : {},
						releases: data.releases,
						branches: data.branches,
						selected: data.current ?? data.releases[0] ?? data.branches[0] ?? "",
						custom: "",
						loading: false
					});
				} catch (error) {
					shared.fail(errorMessage(error));
					setVersionDialog(null);
				}
			}, [
				api,
				marketState,
				shared
			]);
			const confirmVersionDialog = (0, react.useCallback)(async () => {
				if (versionDialog === null) return;
				const ref = versionDialog.custom.trim() !== "" ? versionDialog.custom.trim() : versionDialog.selected;
				if (ref === "") return;
				setVersionBusy(true);
				await runFlow(shared, async () => {
					await api.setMarketSourceRef(versionDialog.repo, ref);
					setVersionDialog(null);
					await loadMarket();
					await scanRepo(versionDialog.repo);
				}, () => setVersionBusy(false));
			}, [
				api,
				versionDialog,
				loadMarket,
				scanRepo,
				shared
			]);
			/** 检查所有市场源的上游更新（服务端节流）。 */
			const checkMarket = (0, react.useCallback)(async () => {
				try {
					const result = await api.marketCheck();
					const next = {};
					for (const item of result.results) next[item.repo] = item;
					setMarketCheck(next);
				} catch {}
			}, [api]);
			return {
				marketState,
				marketCheck,
				branchChoice,
				branchBusy,
				marketSyncDialog,
				syncingMarket,
				syncBusy,
				newSourceName,
				repoDiscoverState,
				scanningRepo,
				repoSelected,
				repoImporting,
				repoResult,
				importJobId,
				marketStats,
				versionDialog,
				versionBusy,
				updateAllDialog,
				setBranchChoice,
				setMarketSyncDialog,
				setNewSourceName,
				setRepoSelected,
				setUpdateAllDialog,
				setVersionDialog,
				loadMarket,
				addSource,
				addMarketSource,
				removeMarketSource,
				scanRepo,
				confirmBranchChoice,
				openVersionDialog,
				confirmVersionDialog,
				toggleRepoSelected,
				importRepo,
				cancelImport,
				clearScan,
				checkMarket,
				loadMarketStats: (0, react.useCallback)(async () => {
					const merge = (results) => {
						const partial = {};
						for (const item of results) if (item.error === void 0) partial[item.repo] = {
							stars: item.stars,
							downloads: item.downloads
						};
						if (Object.keys(partial).length > 0) setMarketStats((previous) => ({
							...previous,
							...partial
						}));
					};
					try {
						merge((await api.marketStats()).results);
					} catch {}
					try {
						merge((await api.marketStats(true)).results);
					} catch {}
				}, [api]),
				syncMarketSource: (0, react.useCallback)(async (repo) => {
					setSyncingMarket(repo);
					await runFlow(shared, async () => {
						const result = await api.marketSync(repo);
						setMarketSyncDialog({
							repo: result.repo,
							ref: result.ref,
							skills: result.skills,
							selected: new Set(result.skills)
						});
						await loadMarket();
					}, () => setSyncingMarket(null));
				}, [
					api,
					loadMarket,
					shared
				]),
				confirmMarketSync: (0, react.useCallback)(async () => {
					if (marketSyncDialog === null) return;
					const selected = [...marketSyncDialog.selected];
					setSyncBusy(true);
					await runFlow(shared, async () => {
						if (selected.length > 0) {
							const result = await api.syncSource(marketSyncDialog.repo, selected);
							if (result.failed.length > 0) shared.fail(result.failed.map((item) => item.name + ": " + item.error).join("\n"));
						}
						setMarketSyncDialog(null);
						await Promise.all([
							reloadCatalog(),
							reloadGroups(),
							reloadSources()
						]);
						checkMarket();
					}, () => setSyncBusy(false));
				}, [
					api,
					marketSyncDialog,
					reloadCatalog,
					reloadGroups,
					reloadSources,
					checkMarket,
					shared
				]),
				updateAll: (0, react.useCallback)(async () => {
					setUpdateAllDialog(false);
					shared.setBatchBusy(true);
					shared.clearFail();
					const failures = [];
					let done = 0;
					try {
						for (const [repo, check] of Object.entries(sourceCheck)) {
							if (!check.changed || check.updated.length === 0) continue;
							try {
								const result = await api.syncSource(repo, check.updated);
								done += 1;
								if (result.failed.length > 0) failures.push(tt("market.updateAllItem", {
									repo,
									count: result.failed.length
								}) + ": " + result.failed.map((item) => item.name + ": " + item.error).join("; "));
							} catch (error) {
								failures.push(repo + ": " + errorMessage(error));
							}
						}
						await Promise.all([
							reloadCatalog(),
							reloadGroups(),
							reloadSources()
						]);
						await checkSources();
						checkMarket();
						if (failures.length > 0) shared.fail(failures.join("\n"));
						else if (done > 0) shared.succeed(tt("market.updateAllDone", { count: done }));
					} finally {
						shared.setBatchBusy(false);
					}
				}, [
					api,
					sourceCheck,
					checkSources,
					checkMarket,
					reloadCatalog,
					reloadGroups,
					reloadSources,
					shared
				])
			};
		}
		// src/client/panel/hooks/useAgentsFlow.ts
		/**
		* useAgentsFlow — AGENTS.md 页的数据域：索引缓存、分步扫描、单个文件正文、排除目录读写。
		*
		* 索引的取法（页面打开 / 手动重新扫描都走它）：
		*   1. 先读 host 的缓存（GET /agents）。命中就整份铺上——页面立即有内容，不再
		*      等一次全树遍历；没有缓存就跳过这一步。
		*   2. 然后按步重扫（GET /agents/scan）：第 0 步用户级，其后每个工作区一步。
		*      每回来一步就把它替换到列表的同一位置，还没扫到的尾部继续沿用缓存内容，
		*      所以扫描期间列表不闪空、内容逐步变成新的。
		*   3. 最后一步落下后列表就是这一轮的完整结果（host 也已把它提升为缓存）。
		*
		* 百分比 = 已完成步数 / 总步数；`scan` 为 null 表示没有扫描在跑。
		*
		* 排除目录保存后立刻重扫，让「改了立即生效」在界面上可见。
		*/
		function useAgentsFlow(api) {
			const [agents, setAgents] = (0, react.useState)(null);
			/** 扫描进度；null = 没有扫描在跑（「重新扫描」按钮可用）。 */
			const [scan, setScan] = (0, react.useState)(null);
			const [agentsError, setAgentsError] = (0, react.useState)(null);
			/** 排除目录保存中（禁用输入与按钮，避免连点写两次）。 */
			const [excludeSaving, setExcludeSaving] = (0, react.useState)(false);
			/** 打开的指令文件详情；null = 列表视图。 */
			const [agentsFile, setAgentsFile] = (0, react.useState)(null);
			/** 当前列表（不走 state 也能读到：扫描合并要用它当「还没扫到的尾部」）。 */
			const groupsRef = (0, react.useRef)([]);
			/** 扫描代次：每次 loadAgents 自增，旧的一轮在下一个 await 后自行退出。 */
			const generation = (0, react.useRef)(0);
			const applyAgents = (0, react.useCallback)((excludeDirs, groups) => {
				groupsRef.current = groups;
				setAgents({
					ok: true,
					groups,
					excludeDirs
				});
			}, []);
			/**
			* 拉一轮索引：缓存打底 + 分步扫描逐步替换。
			* @param fresh - 跳过缓存读取，直接开始一轮新扫描（手动「重新扫描」/保存排除目录后）。
			*/
			const loadAgents = (0, react.useCallback)(async (fresh = false) => {
				const run = ++generation.current;
				setAgentsError(null);
				setScan({
					done: 0,
					total: 0
				});
				let base = groupsRef.current;
				try {
					if (!fresh) {
						const cached = await api.agentsCache();
						if (run !== generation.current) return;
						if (cached.cached) {
							base = cached.groups;
							applyAgents(cached.excludeDirs, cached.groups);
						}
					}
					const live = [];
					let scanId;
					let step = 0;
					let restarted = false;
					for (;;) {
						let chunk;
						try {
							chunk = await api.agentsScan(scanId, step);
						} catch (error) {
							if (!restarted && error instanceof SkillHubApiError && error.code === "expired") {
								restarted = true;
								scanId = void 0;
								step = 0;
								live.length = 0;
								continue;
							}
							throw error;
						}
						if (run !== generation.current) return;
						scanId = chunk.scanId;
						live[step] = chunk.group;
						setScan({
							done: chunk.done,
							total: chunk.total
						});
						const groups = live.slice(0, step + 1);
						for (let index = groups.length; index < base.length; index += 1) groups.push(base[index]);
						applyAgents(chunk.excludeDirs, groups);
						if (!chunk.more) break;
						step += 1;
					}
					setScan(null);
				} catch (error) {
					if (run !== generation.current) return;
					setAgentsError(errorMessage(error));
					setScan(null);
				}
			}, [api, applyAgents]);
			return {
				agents,
				scan,
				agentsError,
				excludeSaving,
				loadAgents,
				saveExcludeDirs: (0, react.useCallback)(async (dirs) => {
					setExcludeSaving(true);
					try {
						await api.updateConfig({ excludeDirs: dirs });
						setAgentsError(null);
						await loadAgents(true);
					} catch (error) {
						setAgentsError(errorMessage(error));
					} finally {
						setExcludeSaving(false);
					}
				}, [api, loadAgents]),
				agentsFile,
				openAgentsFile: (0, react.useCallback)(async (ref, scope) => {
					setAgentsFile({
						ref,
						scope,
						loading: true
					});
					try {
						const detail = await api.agentsFile(ref.absolute);
						setAgentsFile({
							ref,
							scope,
							detail,
							loading: false
						});
					} catch (error) {
						setAgentsFile({
							ref,
							scope,
							loading: false,
							error: errorMessage(error)
						});
					}
				}, [api]),
				closeAgentsFile: (0, react.useCallback)(() => {
					setAgentsFile(null);
				}, []),
				patchAgentsFile: (0, react.useCallback)((next) => {
					setAgentsFile((previous) => previous === null || previous.detail === void 0 ? previous : {
						...previous,
						detail: {
							...previous.detail,
							content: next.content,
							size: next.size,
							modifiedAt: next.modifiedAt
						}
					});
				}, [])
			};
		}
		// src/client/panel/hooks/useMcpFlow.ts
		/**
		* useMcpFlow — MCP 分类页的数据域：服务器列表、展开状态、开关、新建/编辑/删除。
		*
		* 只在进入 MCP 分类时拉一次（不参与目录/统计的 5s/60s 轮询）：MCP 的启用态
		* 只在用户动手或 dsh 重启时变化，定时重读只会白跑。
		*
		* 写操作的响应里已经带回刷新后的列表，所以保存/删除后不再补一次 GET。
		*/
		/** dsh 的重启原因 → 文案键；未知 token 原样显示，不吞掉信息。 */
		const RESTART_KEYS = {
			"no-hmr": "mcp.restart.noHmr",
			"package-moved": "mcp.restart.packageMoved",
			"host-module": "mcp.restart.hostModule",
			"unmanaged-plugin": "mcp.restart.unmanaged",
			"module-comparison": "mcp.restart.moduleComparison",
			"load-pending": "mcp.restart.loadPending"
		};
		/** dsh 的失败分类 → 文案键（这些错误没有 diagnostic，只有 code）。 */
		const ERROR_CODE_KEYS = {
			unaddressable: "mcp.toggleCode.unaddressable",
			"management-required": "mcp.toggleCode.managementRequired",
			"unknown-plugin": "mcp.toggleCode.unknownPlugin"
		};
		/** 重启原因的可读文本（已知 token 走字典，其余原样）。 */
		function restartText(reason) {
			const named = reason !== void 0 ? RESTART_KEYS[reason] : void 0;
			return named !== void 0 ? tt(named) : reason ?? tt("mcp.restart.unknown");
		}
		/** 从 400 错误体里取字段错误（形状不对就当没有，退回提示条）。 */
		function fieldErrorsOf(error) {
			if (!(error instanceof SkillHubApiError)) return [];
			const body = error.body;
			if (typeof body !== "object" || body === null) return [];
			const fields = body.fields;
			if (!Array.isArray(fields)) return [];
			const out = [];
			for (const entry of fields) {
				if (typeof entry !== "object" || entry === null) continue;
				const field = entry.field;
				const code = entry.code;
				if (typeof field !== "string") continue;
				if (code !== "required" && code !== "invalid" && code !== "duplicate" && code !== "range") continue;
				out.push({
					field,
					code
				});
			}
			return out;
		}
		function useMcpFlow(api) {
			const [data, setData] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [busyEntry, setBusyEntry] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [expanded, setExpanded] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [editor, setEditor] = (0, react.useState)(null);
			const [editorBusy, setEditorBusy] = (0, react.useState)(false);
			const [editorErrors, setEditorErrors] = (0, react.useState)([]);
			const [editorError, setEditorError] = (0, react.useState)(null);
			/** 读取代次：后一次读取顶掉前一次（快速点「刷新」不会让旧结果覆盖新结果）。 */
			const generation = (0, react.useRef)(0);
			const load = (0, react.useCallback)(async () => {
				const run = ++generation.current;
				setLoading(true);
				setError(null);
				try {
					const next = await api.mcp();
					if (run !== generation.current) return;
					setData(next);
				} catch (failure) {
					if (run !== generation.current) return;
					setError(errorMessage(failure));
				} finally {
					if (run === generation.current) setLoading(false);
				}
			}, [api]);
			const toggle = (0, react.useCallback)(async (entryId, enabled) => {
				const run = ++generation.current;
				setBusyEntry(entryId);
				setNotice(null);
				try {
					const response = await api.toggleMcp(entryId, enabled);
					if (run !== generation.current) return;
					setData(response.mcp);
					if (response.application === "applied") setNotice({
						kind: "ok",
						key: "mcp.toggleApplied"
					});
					else if (response.application === "restart-required") setNotice({
						kind: "warn",
						key: "mcp.toggleRestart",
						values: { reason: restartText(response.restartReason) }
					});
					else if (response.application === "overridden") setNotice({
						kind: "warn",
						key: "mcp.toggleOverridden"
					});
					else {
						const named = response.errorCode !== void 0 ? ERROR_CODE_KEYS[response.errorCode] : void 0;
						const text = named !== void 0 ? tt(named) : response.error ?? tt("mcp.toggleFailedGeneric");
						setNotice({
							kind: "error",
							key: "mcp.toggleFailed",
							values: { error: text }
						});
					}
				} catch (failure) {
					if (run !== generation.current) return;
					setNotice({
						kind: "error",
						key: "mcp.toggleFailed",
						values: { error: errorMessage(failure) }
					});
				} finally {
					setBusyEntry(null);
				}
			}, [api]);
			const openEditor = (0, react.useCallback)((server) => {
				setEditorErrors([]);
				setEditorError(null);
				setEditor(server === void 0 ? { mode: "create" } : {
					mode: "edit",
					server
				});
			}, []);
			const closeEditor = (0, react.useCallback)(() => {
				setEditor(null);
				setEditorErrors([]);
				setEditorError(null);
			}, []);
			const saveServer = (0, react.useCallback)(async (input, entryId) => {
				const run = ++generation.current;
				setEditorBusy(true);
				setEditorErrors([]);
				setEditorError(null);
				setNotice(null);
				try {
					const response = await api.saveMcpServer(input, entryId);
					if (run !== generation.current) return;
					setData(response.mcp);
					setEditor(null);
					if (response.application === "applied") setNotice({
						kind: "ok",
						key: "mcp.saveApplied"
					});
					else if (response.application === "restart-required") setNotice({
						kind: "warn",
						key: "mcp.saveRestart",
						values: { reason: restartText(response.restartReason) }
					});
					else setNotice({
						kind: "error",
						key: "mcp.saveFailed",
						values: { error: response.application }
					});
				} catch (failure) {
					if (run !== generation.current) return;
					const fields = fieldErrorsOf(failure);
					if (fields.length > 0) setEditorErrors(fields);
					else setEditorError(errorMessage(failure));
				} finally {
					setEditorBusy(false);
				}
			}, [api]);
			const removeServer = (0, react.useCallback)(async (entryId) => {
				const run = ++generation.current;
				setBusyEntry(entryId);
				setNotice(null);
				try {
					const response = await api.removeMcpServer(entryId);
					if (run !== generation.current) return;
					setData(response.mcp);
					setExpanded((previous) => {
						if (!previous.has(entryId)) return previous;
						const next = new Set(previous);
						next.delete(entryId);
						return next;
					});
					if (response.application === "applied") setNotice({
						kind: "ok",
						key: "mcp.removeApplied"
					});
					else if (response.application === "restart-required") setNotice({
						kind: "warn",
						key: "mcp.removeRestart",
						values: { reason: restartText(response.restartReason) }
					});
					else setNotice({
						kind: "error",
						key: "mcp.removeFailed",
						values: { error: response.application }
					});
				} catch (failure) {
					if (run !== generation.current) return;
					setNotice({
						kind: "error",
						key: "mcp.removeFailed",
						values: { error: errorMessage(failure) }
					});
				} finally {
					setBusyEntry(null);
				}
			}, [api]);
			return {
				data,
				loading,
				error,
				busyEntry,
				notice,
				expanded,
				editor,
				editorBusy,
				editorErrors,
				editorError,
				load,
				toggle,
				toggleExpanded: (0, react.useCallback)((entryId) => {
					setExpanded((previous) => {
						const next = new Set(previous);
						if (next.has(entryId)) next.delete(entryId);
						else next.add(entryId);
						return next;
					});
				}, []),
				openEditor,
				closeEditor,
				saveServer,
				removeServer,
				dismissNotice: (0, react.useCallback)(() => {
					setNotice(null);
				}, [])
			};
		}
		// src/client/panel/useSkillHub.ts
		/**
		* useSkillHub — 面板的状态聚合根：只持有跨域共享的通知状态与纯视图状态，
		* 各域状态与动作分散在 ./hooks/*，这里按依赖顺序组装（meta → 目录 →
		* 分组 → 来源 → 市场），轮询与派生组装在此。返回形状与拆分前完全一致，
		* 所有视图无需改动。All hooks run unconditionally at the top, so the panel
		* may early-return for the detail view without violating the rules of hooks.
		*/
		function useSkillHub(api, initialTab = "sources") {
			const [loadError, setLoadError] = (0, react.useState)(null);
			/** Green success banner (create finished); shown outside the closing form. */
			const [successBanner, setSuccessBanner] = (0, react.useState)(null);
			const [batchBusy, setBatchBusy] = (0, react.useState)(false);
			const [listBusy, setListBusy] = (0, react.useState)(false);
			const shared = (0, react.useMemo)(() => ({
				fail: (message) => setLoadError(message),
				clearFail: () => setLoadError(null),
				succeed: (message) => setSuccessBanner(message),
				setListBusy,
				setBatchBusy
			}), []);
			const [tab, setTab] = (0, react.useState)(initialTab);
			const [skillView, setSkillView] = (0, react.useState)("groups");
			const [sourceFilter, setSourceFilter] = (0, react.useState)("all");
			/** 分组视图里收起的分组（key 为 col:<name> 或 project 树键）。技能总数 >80 时首次加载自动折叠 personal。 */
			const [collapsedGroups, setCollapsedGroups] = (0, react.useState)(/* @__PURE__ */ new Set());
			/** 项目级三级树里已细分（按 .dsh/.agents）的项目键。 */
			const [subdividedProjects, setSubdividedProjects] = (0, react.useState)(/* @__PURE__ */ new Set());
			const toggleGroupCollapse = (0, react.useCallback)((key) => {
				setCollapsedGroups((previous) => {
					const next = new Set(previous);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			}, []);
			const toggleSubdivide = (0, react.useCallback)((key) => {
				setSubdividedProjects((previous) => {
					const next = new Set(previous);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			}, []);
			/** 整组折叠/展开：传 null 全部展开，传键列表全部折叠（视图侧自己算键）。 */
			const setAllGroupsCollapsed = (0, react.useCallback)((keys) => {
				setCollapsedGroups(keys === null ? /* @__PURE__ */ new Set() : new Set(keys));
			}, []);
			const collapsePersonal = (0, react.useCallback)(() => {
				setCollapsedGroups((previous) => new Set(previous).add("uncategorized-source"));
			}, []);
			const clearSourceFilter = (0, react.useCallback)(() => {
				setSourceFilter("all");
			}, []);
			const meta = useMetaFlow(api);
			const catalogFlow = useCatalogFlow(api, meta.uses, shared, collapsePersonal, clearSourceFilter);
			const groupFlow = useGroupFlow(api, shared);
			const sourceFlow = useSourceFlow(api, shared, catalogFlow.load, groupFlow.loadGroups);
			const agentsFlow = useAgentsFlow(api);
			const mcpFlow = useMcpFlow(api);
			const marketFlow = useMarketFlow(api, shared, catalogFlow.load, groupFlow.loadGroups, sourceFlow.loadSources, sourceFlow.checkSources, sourceFlow.sourceCheck);
			/** skillName → origin repo（无来源记录的技能不在此映射中，筛选中视为 private）。 */
			const origins = groupFlow.groupsState?.origins ?? {};
			/** 来源筛选选项：来源记录中的仓库（排序）+ 末尾的「个人」；没有技能的仓库不列。 */
			const sourceOptions = (0, react.useMemo)(() => {
				const skills = catalogFlow.catalog?.skills ?? [];
				const repos = [...new Set(skills.map((skill) => origins[skill.name]).filter((repo) => repo !== void 0))].sort();
				const hasPrivate = skills.some((skill) => origins[skill.name] === void 0 && !isProjectSource(skill.source));
				return [...repos, ...hasPrivate ? [PRIVATE_SOURCE] : []];
			}, [catalogFlow.catalog, origins]);
			(0, react.useEffect)(() => {
				catalogFlow.load();
				meta.loadUses();
				groupFlow.loadGroups();
				sourceFlow.loadSources();
				meta.loadConfig();
				const fast = window.setInterval(() => {
					catalogFlow.load();
				}, POLL_MS);
				const slow = window.setInterval(() => {
					meta.loadUses();
					groupFlow.loadGroups();
					sourceFlow.loadSources();
					meta.loadConfig();
				}, SLOW_POLL_MS);
				return () => {
					window.clearInterval(fast);
					window.clearInterval(slow);
				};
			}, [
				catalogFlow.load,
				meta.loadUses,
				groupFlow.loadGroups,
				sourceFlow.loadSources,
				meta.loadConfig
			]);
			(0, react.useEffect)(() => {
				if (!shouldAutoCheck()) return;
				markAutoChecked();
				meta.checkUpdate();
				sourceFlow.checkSources();
				marketFlow.checkMarket();
			}, []);
			return {
				catalog: catalogFlow.catalog,
				loading: catalogFlow.loading,
				loadError,
				successBanner,
				updateState: meta.updateState,
				repoDiscoverState: marketFlow.repoDiscoverState,
				scanningRepo: marketFlow.scanningRepo,
				repoSelected: marketFlow.repoSelected,
				repoImporting: marketFlow.repoImporting,
				repoResult: marketFlow.repoResult,
				search: catalogFlow.search,
				workspace: catalogFlow.workspace,
				detail: catalogFlow.detail,
				detailLoading: catalogFlow.detailLoading,
				busyNames: catalogFlow.busyNames,
				batchBusy,
				showForm: catalogFlow.showForm,
				formName: catalogFlow.formName,
				formDesc: catalogFlow.formDesc,
				formRoot: catalogFlow.formRoot,
				formBusy: catalogFlow.formBusy,
				formMessage: catalogFlow.formMessage,
				uses: meta.uses,
				hubConfig: meta.hubConfig,
				tab,
				skillView,
				sourceFilter,
				invocationFilter: catalogFlow.invocationFilter,
				sortKey: catalogFlow.sortKey,
				marketState: marketFlow.marketState,
				marketCheck: marketFlow.marketCheck,
				marketStats: marketFlow.marketStats,
				branchChoice: marketFlow.branchChoice,
				branchBusy: marketFlow.branchBusy,
				marketSyncDialog: marketFlow.marketSyncDialog,
				syncingMarket: marketFlow.syncingMarket,
				syncBusy: marketFlow.syncBusy,
				newSourceName: marketFlow.newSourceName,
				groupsState: groupFlow.groupsState,
				sourcesState: sourceFlow.sourcesState,
				sourceCheck: sourceFlow.sourceCheck,
				checkingSource: sourceFlow.checkingSource,
				syncingSource: sourceFlow.syncingSource,
				confirmDialog: sourceFlow.confirmDialog,
				deleteSkillDialog: sourceFlow.deleteSkillDialog,
				confirmClearTrash: sourceFlow.confirmClearTrash,
				updateAllDialog: marketFlow.updateAllDialog,
				listBusy,
				collapsedGroups,
				subdividedProjects,
				versionDialog: marketFlow.versionDialog,
				versionBusy: marketFlow.versionBusy,
				agents: agentsFlow.agents,
				agentsScan: agentsFlow.scan,
				agentsError: agentsFlow.agentsError,
				excludeSaving: agentsFlow.excludeSaving,
				loadAgents: agentsFlow.loadAgents,
				saveExcludeDirs: agentsFlow.saveExcludeDirs,
				agentsFile: agentsFlow.agentsFile,
				openAgentsFile: agentsFlow.openAgentsFile,
				closeAgentsFile: agentsFlow.closeAgentsFile,
				patchAgentsFile: agentsFlow.patchAgentsFile,
				mcp: mcpFlow,
				normalized: catalogFlow.normalized,
				origins,
				sourceOptions,
				filtered: catalogFlow.filtered,
				sorted: catalogFlow.sorted,
				shortenedCount: catalogFlow.shortenedCount,
				setLoadError,
				setSuccessBanner,
				setSearch: catalogFlow.setSearch,
				setWorkspace: catalogFlow.setWorkspace,
				setDetail: catalogFlow.setDetail,
				setShowForm: catalogFlow.setShowForm,
				setFormName: catalogFlow.setFormName,
				setFormDesc: catalogFlow.setFormDesc,
				setFormRoot: catalogFlow.setFormRoot,
				setFormMessage: catalogFlow.setFormMessage,
				setRepoSelected: marketFlow.setRepoSelected,
				setTab,
				setSkillView,
				setSourceFilter,
				setInvocationFilter: catalogFlow.setInvocationFilter,
				setSortKey: catalogFlow.setSortKey,
				setBranchChoice: marketFlow.setBranchChoice,
				setMarketSyncDialog: marketFlow.setMarketSyncDialog,
				setNewSourceName: marketFlow.setNewSourceName,
				setConfirmDialog: sourceFlow.setConfirmDialog,
				setDeleteSkillDialog: sourceFlow.setDeleteSkillDialog,
				setConfirmClearTrash: sourceFlow.setConfirmClearTrash,
				setUpdateAllDialog: marketFlow.setUpdateAllDialog,
				setVersionDialog: marketFlow.setVersionDialog,
				toggleGroupCollapse,
				toggleSubdivide,
				setAllGroupsCollapsed,
				checkUpdate: meta.checkUpdate,
				loadMarket: marketFlow.loadMarket,
				openDetail: catalogFlow.openDetail,
				reveal: catalogFlow.reveal,
				runConfirmed: sourceFlow.runConfirmed,
				checkSources: sourceFlow.checkSources,
				requestSync: sourceFlow.requestSync,
				requestDelete: sourceFlow.requestDelete,
				restoreTrash: sourceFlow.restoreTrash,
				clearTrash: sourceFlow.clearTrash,
				fixingPaths: catalogFlow.fixingPaths,
				fixDiagnostic: catalogFlow.fixDiagnostic,
				invocationBusy: catalogFlow.invocationBusy,
				setInvocation: catalogFlow.setInvocation,
				clearListFilters: catalogFlow.clearListFilters,
				openVersionDialog: marketFlow.openVersionDialog,
				confirmVersionDialog: marketFlow.confirmVersionDialog,
				requestDeleteSkill: sourceFlow.requestDeleteSkill,
				runDeleteSkill: sourceFlow.runDeleteSkill,
				addSource: marketFlow.addSource,
				addMarketSource: marketFlow.addMarketSource,
				removeMarketSource: marketFlow.removeMarketSource,
				scanRepo: marketFlow.scanRepo,
				confirmBranchChoice: marketFlow.confirmBranchChoice,
				toggleRepoSelected: marketFlow.toggleRepoSelected,
				importRepo: marketFlow.importRepo,
				cancelImport: marketFlow.cancelImport,
				clearScan: marketFlow.clearScan,
				checkMarket: marketFlow.checkMarket,
				loadMarketStats: marketFlow.loadMarketStats,
				syncMarketSource: marketFlow.syncMarketSource,
				confirmMarketSync: marketFlow.confirmMarketSync,
				updateAll: marketFlow.updateAll,
				create: catalogFlow.create
			};
		}
		// src/client/panel/SkillHubPanel.tsx
		/**
		* The skill hub panel: catalog grouped by source collections, search and
		* filter in one row, upstream source tracking (check / sync / follow upstream
		* deletion into a restorable trash), market sources, detail inspection, and
		* the new-skill scaffold form.
		*
		* Thin shell: state and flows live in useSkillHub, the tab contents live in
		* SourcesView / MarketView, the dialog family lives in dialogs.tsx, and their
		* wiring lives in PanelDialogs.tsx. This component owns only the shared chrome
		* (header, banners, filter bar, shared sections), the view routing and the
		* scroll position across list ↔ detail; every hook runs above the detail early
		* return, so that return stays safe.
		*/
		const CATEGORY_LABEL = {
			agents: "category.agents",
			skills: "category.skills",
			mcp: "category.mcp",
			hooks: "category.hooks",
			about: "category.about"
		};
		function SkillHubPanel(props) {
			/** 上次离开时停留的页面（无记录时是 Skill / 来源）：进入即路由到那里。 */
			const [savedView] = (0, react.useState)(readLastView);
			const hub = useSkillHub(props.api, savedView.tab);
			/** 分组视图的派生数据：列表用它渲染，「全部折叠」按钮用它算同一批折叠键。 */
			const groupView = useGroupView(hub);
			/** 工作区输入草稿：回车才应用，避免每次按键都触发目录重拉。 */
			const [workspaceDraft, setWorkspaceDraft] = (0, react.useState)("");
			/** 「筛选」面板开合（来源 + 调用方式收进这里；搜索/排序/视图切换始终可见）。 */
			const [filtersOpen, setFiltersOpen] = (0, react.useState)(false);
			/** 页壳元素（宽度手柄的挂载目标与 ResizeObserver 观察对象）。 */
			const [shell, setShell] = (0, react.useState)(null);
			/** 顶层分类：默认取上次离开的那一页。 */
			const [category, setCategory] = (0, react.useState)(savedView.category);
			const refShell = (0, react.useCallback)((node) => {
				setShell(node);
			}, []);
			/** 列表/详情共用的滚动容器（两种视图结构相同，React 会复用同一个 DOM 节点）。 */
			const scrollRef = (0, react.useRef)(null);
			/** 进入详情前列表的滚动位置；返回时原样恢复。 */
			const listScrollTop = (0, react.useRef)(0);
			const { catalog, loading, loadError, successBanner, updateState, detail, detailLoading, showForm, formName, formDesc, formRoot, formBusy, formMessage, hubConfig, tab, skillView, sourceFilter, sortKey, search, workspace, setWorkspace, sourcesState, listBusy, batchBusy, sourceOptions, filtered, confirmDialog, deleteSkillDialog, confirmClearTrash, branchChoice, branchBusy, marketSyncDialog, syncBusy, uses, sourceCheck, checkingSource, syncingSource, setLoadError, setSuccessBanner, setDetail, setShowForm, setFormName, setFormDesc, setFormRoot, setFormMessage, setTab, setSkillView, setSourceFilter, setSortKey, setSearch, setConfirmDialog, setDeleteSkillDialog, setConfirmClearTrash, setBranchChoice, setMarketSyncDialog, checkUpdate, loadMarket, checkSources, requestSync, requestDelete, restoreTrash, clearTrash, runDeleteSkill, runConfirmed, confirmBranchChoice, confirmMarketSync, create, agents, agentsScan, agentsError, excludeSaving, loadAgents, saveExcludeDirs, agentsFile, openAgentsFile, closeAgentsFile, patchAgentsFile } = hub;
			const { shortenedCount, fixingPaths, clearListFilters } = hub;
			const tokenModels = useTokenModels(props.api, category === "skills" || category === "agents");
			/** 选中集合变了（行数变了）就让计数重跑一遍：原文没变，但表格的行变了。 */
			const [tokenRevision, setTokenRevision] = (0, react.useState)(0);
			const agentsTokens = useTokenCount(props.api, agentsFile?.detail?.content, tokenRevision);
			const skillTokens = useTokenCount(props.api, detail?.content, tokenRevision);
			const selectTokenModel = (0, react.useCallback)((id, selected) => {
				tokenModels.select(id, selected).then((ok) => {
					if (ok) setTokenRevision((value) => value + 1);
				});
			}, [tokenModels]);
			const [editNotice, setEditNotice] = (0, react.useState)(null);
			const edit = useEditFlow(props.api, (event) => {
				setTokenRevision((value) => value + 1);
				if (event.kind === "skill") {
					const repo = sourcesState?.origins[event.name];
					setDetail((previous) => previous === null ? previous : {
						...previous,
						content: event.snapshot.content,
						updatedAt: event.snapshot.modifiedAt,
						size: event.snapshot.size
					});
					setEditNotice(repo !== void 0 ? tt("detail.editUpstream", { repo }) : tt("detail.editSaved"));
				} else {
					patchAgentsFile(event.snapshot);
					setEditNotice(tt("detail.editSaved"));
				}
			});
			(0, react.useEffect)(() => {
				setEditNotice(null);
			}, [detail?.name, agentsFile?.ref.absolute]);
			(0, react.useEffect)(() => {
				if (detail !== null) {
					edit.begin({
						kind: "skill",
						key: detail.name,
						...workspace !== "" ? { cwd: workspace } : {},
						...detail.path !== void 0 ? { path: detail.path } : {},
						...detail.updatedAt !== void 0 ? { modifiedAt: detail.updatedAt } : {},
						...detail.size !== void 0 ? { size: detail.size } : {}
					}, detail.content);
					return;
				}
				const fileDetail = agentsFile?.detail;
				if (agentsFile !== null && fileDetail !== void 0) edit.begin({
					kind: "agents",
					key: agentsFile.ref.absolute,
					path: agentsFile.ref.absolute,
					modifiedAt: fileDetail.modifiedAt,
					size: fileDetail.size
				}, fileDetail.content);
			}, [
				detail,
				agentsFile,
				workspace,
				edit.begin
			]);
			/** 离开详情页：有未保存改动先确认，同意后丢掉草稿。 */
			const leaveDetail = (0, react.useCallback)((close) => {
				if (!edit.confirmDiscard()) return;
				edit.clear();
				setEditNotice(null);
				close();
			}, [edit]);
			/** 保存冲突的三选框（保存时磁盘被别处改过才会出现）。 */
			const editConflict = edit.session?.conflict !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditConflictDialog, { onChoose: edit.resolveConflict }) : null;
			const detailOpen = detail !== null || agentsFile !== null;
			(0, react.useLayoutEffect)(() => {
				const scroll = scrollRef.current;
				if (scroll === null) return;
				scroll.scrollTop = detailOpen ? 0 : listScrollTop.current;
			}, [detailOpen]);
			(0, react.useEffect)(() => {
				if (category === "agents") loadAgents();
			}, [category, loadAgents]);
			(0, react.useEffect)(() => {
				if (category === "mcp") hub.mcp.load();
			}, [category, hub.mcp.load]);
			(0, react.useEffect)(() => {
				if (savedView.tab === "market") loadMarket();
			}, []);
			(0, react.useEffect)(() => {
				rememberView({
					category,
					tab
				});
			}, [category, tab]);
			if (agentsFile !== null) {
				const fileDetail = agentsFile.detail;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.pageShell,
					ref: refShell,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.scrollArea,
						"data-hub-scroll": "",
						ref: scrollRef,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AgentFileDetailView, {
							file: agentsFile.ref,
							scope: agentsFile.scope,
							detail: agentsFile.detail,
							loading: agentsFile.loading,
							error: agentsFile.error,
							tokenTable: {
								state: agentsTokens,
								models: tokenModels.models,
								busyModel: tokenModels.busy,
								modelError: tokenModels.error,
								onSelectModel: selectTokenModel
							},
							edit: {
								editable: true,
								draft: edit.session?.draft ?? fileDetail?.content ?? "",
								busy: edit.session?.busy ?? false,
								dirty: edit.dirty,
								error: edit.session?.error,
								onDraft: edit.setDraft,
								onSave: edit.save,
								onDiscard: edit.discard
							},
							notice: editNotice ?? void 0,
							onBack: () => {
								leaveDetail(closeAgentsFile);
							}
						})
					}), editConflict]
				});
			}
			if (detail !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.pageShell,
				ref: refShell,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.scrollArea,
						"data-hub-scroll": "",
						ref: scrollRef,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillDetailView, {
							detail,
							hubConfig,
							uses,
							sourcesState,
							sourceCheck,
							checkingSource,
							syncingSource,
							editable: detail.editable,
							tokenTable: {
								state: skillTokens,
								models: tokenModels.models,
								busyModel: tokenModels.busy,
								modelError: tokenModels.error,
								onSelectModel: selectTokenModel
							},
							edit: {
								editable: detail.editable === true,
								draft: edit.session?.draft ?? detail.content,
								busy: edit.session?.busy ?? false,
								dirty: edit.dirty,
								error: edit.session?.error,
								onDraft: edit.setDraft,
								onSave: edit.save,
								onDiscard: edit.discard
							},
							notice: editNotice ?? void 0,
							invocationBusy: hub.invocationBusy,
							onInvocationChange: (modelInvocable, userInvocable) => {
								hub.setInvocation(detail.name, modelInvocable, userInvocable);
							},
							onBack: () => {
								leaveDetail(() => {
									setDetail(null);
								});
							},
							onCheck: (repo) => {
								checkSources(repo);
							},
							onSync: requestSync,
							onFollowDelete: requestDelete
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelWidthControls, { container: shell }),
					editConflict
				]
			});
			/** 生效中的筛选条件数（来源 + 调用方式），显示在「筛选」按钮上。 */
			const activeFilterCount = (sourceFilter !== "all" ? 1 : 0) + (hub.invocationFilter !== "all" ? 1 : 0);
			/** 检查结果的悬停提示：收敛到「检查更新」按钮上，不再占面板顶部横幅。 */
			const updateTitle = (() => {
				if (updateState.status === "checking") return tt("update.checking");
				if (updateState.status === "error") return tt("update.error", { error: updateState.message });
				if (updateState.status === "ready") {
					const data = updateState.data;
					if (data.error !== void 0) return tt("update.error", { error: data.error });
					if (data.updateAvailable) return tt("update.available", {
						version: data.latestVersion ?? "",
						current: data.currentVersion
					});
					if (data.latestVersion === null) return tt("update.unavailable");
					return tt("update.upToDate", { version: data.latestVersion });
				}
			})();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.pageShell,
				ref: refShell,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.scrollArea,
					"data-hub-scroll": "",
					ref: scrollRef,
					onScroll: (event) => {
						if (detailLoading || detail !== null || agentsFile !== null || tab !== "sources") return;
						listScrollTop.current = event.currentTarget.scrollTop;
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.panel,
						"aria-busy": batchBusy || listBusy,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.pageHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
									className: panel_module_css_default.title,
									children: tt("panel.title")
								}), category === "skills" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.headingMeta,
									children: [catalog !== null && !catalog.complete ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.hint,
										children: tt("panel.incomplete")
									}) : null, catalog !== null && (catalog.duplicateNames?.length ?? 0) > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: panel_module_css_default.opBtn,
										title: tt("row.duplicateHint"),
										onClick: () => {
											clearListFilters();
										},
										children: [
											"⚠ ",
											tt("row.duplicate"),
											"×",
											(catalog.duplicateNames ?? []).length
										]
									}) : null]
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
								className: panel_module_css_default.filterTabs,
								role: "group",
								"aria-label": tt("category.label"),
								children: CATEGORY_ORDER.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.filterTab + (category === id ? " " + panel_module_css_default.filterTabActive : ""),
									"aria-pressed": category === id,
									onClick: () => {
										setCategory(id);
									},
									children: tt(CATEGORY_LABEL[id])
								}, id))
							}),
							category === "agents" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AgentsView, {
								data: agents,
								scan: agentsScan,
								error: agentsError,
								saving: excludeSaving,
								onRefresh: () => {
									loadAgents(true);
								},
								onSaveExcludeDirs: (dirs) => {
									saveExcludeDirs(dirs);
								},
								onOpenFile: (file, scope) => {
									openAgentsFile(file, scope);
								}
							}) : category === "mcp" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpView, {
								data: hub.mcp.data,
								loading: hub.mcp.loading,
								error: hub.mcp.error,
								busyEntry: hub.mcp.busyEntry,
								notice: hub.mcp.notice,
								expanded: hub.mcp.expanded,
								onRefresh: () => {
									hub.mcp.load();
								},
								onToggle: (entryId, enabled) => {
									hub.mcp.toggle(entryId, enabled);
								},
								onToggleExpanded: hub.mcp.toggleExpanded,
								editor: hub.mcp.editor,
								editorBusy: hub.mcp.editorBusy,
								editorErrors: hub.mcp.editorErrors,
								editorError: hub.mcp.editorError,
								onOpenEditor: hub.mcp.openEditor,
								onCloseEditor: hub.mcp.closeEditor,
								onSaveServer: (input, entryId) => {
									hub.mcp.saveServer(input, entryId);
								},
								onRemoveServer: (entryId) => {
									hub.mcp.removeServer(entryId);
								},
								onDismissNotice: hub.mcp.dismissNotice
							}) : category === "about" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AboutView, {
								version: catalog?.pluginVersion ?? null,
								status: updateTitle,
								checking: updateState.status === "checking",
								releaseUrl: updateState.status === "ready" && updateState.data.updateAvailable ? updateState.data.url : null,
								latestVersion: updateState.status === "ready" && updateState.data.updateAvailable ? updateState.data.latestVersion ?? null : null,
								onCheck: () => {
									checkUpdate();
								}
							}) : category !== "skills" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.placeholder,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: panel_module_css_default.placeholderTitle,
									children: tt(CATEGORY_LABEL[category])
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: panel_module_css_default.placeholderBody,
									children: tt("category.pending", { name: tt(CATEGORY_LABEL[category]) })
								})]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.subbar,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.segmented,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.segBtn + (tab === "sources" ? " " + panel_module_css_default.segBtnActive : ""),
												onClick: () => {
													setTab("sources");
												},
												children: tt("view.sources")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.segBtn + (tab === "market" ? " " + panel_module_css_default.segBtnActive : ""),
												onClick: () => {
													setTab("market");
													loadMarket();
												},
												children: tt("view.market")
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.workspaceBox,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.search + " " + panel_module_css_default.workspaceInput,
												value: workspaceDraft,
												placeholder: workspace !== "" ? workspace : tt("panel.workspacePlaceholder"),
												title: tt("panel.workspaceHint"),
												onChange: (event) => {
													setWorkspaceDraft(event.target.value);
												},
												onKeyDown: (event) => {
													if (event.key === "Enter") setWorkspace(event.target.value.trim());
												}
											}), workspace !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.opBtn,
												title: tt("panel.workspaceClear"),
												onClick: () => {
													setWorkspace("");
													setWorkspaceDraft("");
												},
												children: "✕"
											}) : null]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.actions,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.button + " " + panel_module_css_default.primary,
												onClick: () => {
													setShowForm((value) => !value);
												},
												children: tt("panel.new")
											})
										})
									]
								}),
								showForm ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
									className: panel_module_css_default.form,
									onSubmit: (event) => {
										create(event);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: panel_module_css_default.hintLine,
											children: tt("form.capabilityHint")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.formRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.formLabel,
												children: tt("form.name")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												value: formName,
												onChange: (event) => {
													setFormName(event.target.value);
												},
												placeholder: "code-review"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.formRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.formLabel,
												children: tt("form.desc")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												value: formDesc,
												onChange: (event) => {
													setFormDesc(event.target.value);
												},
												placeholder: tt("form.descPlaceholder")
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.formRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.formLabel,
												children: tt("form.root")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												className: panel_module_css_default.select,
												value: formRoot,
												onChange: (event) => {
													setFormRoot(event.target.value);
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "user-dsh",
													children: "~/.dsh/skills"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "user-agents",
													children: "~/.agents/skills"
												})]
											})]
										}),
										formMessage !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: formMessage.kind === "error" ? panel_module_css_default.formError : panel_module_css_default.formSuccess,
											children: formMessage.text
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.buttons,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "submit",
												className: panel_module_css_default.button + " " + panel_module_css_default.primary,
												disabled: formBusy,
												children: formBusy ? tt("form.busy") : tt("form.submit")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.button,
												onClick: () => {
													setShowForm(false);
													setFormMessage(null);
												},
												children: tt("form.cancel")
											})]
										})
									]
								}) : null,
								loadError !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.errorBanner,
									role: "alert",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: loadError }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button,
										"aria-label": tt("err.dismiss"),
										onClick: () => {
											setLoadError(null);
										},
										children: tt("err.dismiss")
									})]
								}) : null,
								successBanner !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.successBanner,
									role: "status",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: successBanner }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button,
										"aria-label": tt("err.dismiss"),
										onClick: () => {
											setSuccessBanner(null);
										},
										children: tt("err.dismiss")
									})]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.legend,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.legendItem,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.dot + " " + panel_module_css_default.dotModel,
												style: dotStyle(hubConfig?.dotModelColor)
											}), tt("legend.model")]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.legendItem,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.dot + " " + panel_module_css_default.dotUser,
												style: dotStyle(hubConfig?.dotUserColor)
											}), tt("legend.user")]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.legendHint,
											children: tt("legend.hint")
										})
									]
								}),
								loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.skeleton,
									role: "status",
									"aria-label": tt("panel.loading"),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.skeletonRow }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.skeletonRow }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.skeletonRow })
									]
								}) : null,
								detailLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.empty,
									children: tt("detail.loading")
								}) : null,
								tab === "market" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketView, { hub }) : catalog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.filterBar,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: panel_module_css_default.segmented,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: panel_module_css_default.segBtn + (skillView === "flat" ? " " + panel_module_css_default.segBtnActive : ""),
													onClick: () => {
														setSkillView("flat");
													},
													children: tt("view.flat")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: panel_module_css_default.segBtn + (skillView === "groups" ? " " + panel_module_css_default.segBtnActive : ""),
													onClick: () => {
														setSkillView("groups");
													},
													children: tt("view.grouped")
												})]
											}),
											skillView === "groups" && groupView.collapsibleKeys.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.opBtn,
												onClick: () => {
													hub.setAllGroupsCollapsed(groupView.allCollapsed ? null : groupView.collapsibleKeys);
												},
												children: groupView.allCollapsed ? tt("groups.expandAll") : tt("groups.collapseAll")
											}) : null,
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												className: panel_module_css_default.select,
												value: sortKey,
												onChange: (event) => {
													setSortKey(event.target.value);
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "name",
														children: tt("sort.name")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "added",
														children: tt("sort.added")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "uses",
														children: tt("sort.uses")
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.search,
												value: search,
												onChange: (event) => {
													setSearch(event.target.value);
												},
												placeholder: tt("panel.search")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: panel_module_css_default.button + (filtersOpen || activeFilterCount > 0 ? " " + panel_module_css_default.primary : ""),
												"aria-expanded": filtersOpen,
												"aria-controls": "skill-hub-filter-panel",
												onClick: () => {
													setFiltersOpen((value) => !value);
												},
												children: [tt("filter.title"), activeFilterCount > 0 ? " (" + activeFilterCount + ")" : ""]
											})
										]
									}),
									filtersOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.filterPanel,
										id: "skill-hub-filter-panel",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.filterField,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.formLabel,
													children: tt("filter.source")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
													className: panel_module_css_default.select,
													value: sourceFilter,
													onChange: (event) => {
														setSourceFilter(event.target.value);
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "all",
														children: tt("filter.allSources")
													}), sourceOptions.map((source) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: source,
														children: source === "private" ? tt("filter.private") : source
													}, source))]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.filterField,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.formLabel,
													children: tt("filter.invocation")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
													className: panel_module_css_default.select,
													value: hub.invocationFilter,
													onChange: (event) => {
														hub.setInvocationFilter(event.target.value);
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "all",
															children: tt("filter.invocationAll")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "model",
															children: tt("filter.modelOnly")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "user",
															children: tt("filter.userOnly")
														})
													]
												})]
											}),
											activeFilterCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.opBtn,
												onClick: () => {
													setSourceFilter("all");
													hub.setInvocationFilter("all");
												},
												children: tt("filter.clear")
											}) : null
										]
									}) : null,
									catalog !== null && (filtered.length !== catalog.skills.length || hub.invocationFilter !== "all" || sourceFilter !== "all") ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.hintLine,
										style: {
											margin: "2px 2px 0",
											display: "flex",
											gap: 8,
											flexWrap: "wrap"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("filter.showing", {
											shown: filtered.length,
											total: catalog.skills.length,
											filtered: hub.invocationFilter !== "all" || sourceFilter !== "all" ? tt("filter.filteredSuffix") : ""
										}) }), shortenedCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											title: tt("filter.shortened", { count: shortenedCount }),
											children: tt("filter.shortened", { count: shortenedCount })
										}) : null]
									}) : null,
									filtered.length === 0 && search.trim() !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.empty,
										children: tt("panel.empty")
									}) : null,
									filtered.length === 0 && search.trim() === "" && catalog.skills.length === 0 && catalog.diagnostics.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.empty,
										children: tt("panel.emptyAll")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourcesView, {
										hub,
										view: groupView
									}),
									sourcesState !== null && sourcesState.trash.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										className: panel_module_css_default.section,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.sectionTitle + " " + panel_module_css_default.sectionHeadRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.sectionTitleFill,
												children: tt("source.trash")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.opBtn + " " + panel_module_css_default.opDanger,
												disabled: listBusy,
												onClick: () => {
													setConfirmClearTrash(true);
												},
												children: tt("source.clearTrash")
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.list,
											children: sourcesState.trash.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.rowMain,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.rowName,
														children: entry.name
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.rowDesc,
														children: relativeTimeText(entry.movedAt)
													})]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: panel_module_css_default.opBtn,
													disabled: listBusy,
													onClick: () => {
														restoreTrash(entry.name);
													},
													children: tt("source.restore")
												})]
											}, entry.name))
										})]
									}) : null,
									catalog.diagnostics.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										className: panel_module_css_default.section,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.sectionTitle,
											children: tt("panel.diagnostics")
										}), catalog.diagnostics.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.diagRow,
											style: {
												display: "flex",
												alignItems: "flex-start",
												gap: 10
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													flex: 1,
													minWidth: 0
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.diagPath,
													children: entry.path
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.diagReason,
													children: entry.reason
												})]
											}), entry.fixable === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.opBtn,
												disabled: fixingPaths.has(entry.path),
												onClick: () => {
													hub.fixDiagnostic(entry.path);
												},
												style: {
													flex: "none",
													alignSelf: "center"
												},
												children: fixingPaths.has(entry.path) ? tt("diag.fixing") : tt("diag.fix")
											}) : null]
										}, entry.path))]
									}) : null
								] }) : null
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelDialogs, {
								confirmDialog,
								setConfirmDialog,
								runConfirmed,
								branchChoice,
								branchBusy,
								setBranchChoice,
								confirmBranchChoice,
								versionDialog: hub.versionDialog,
								versionBusy: hub.versionBusy,
								setVersionDialog: hub.setVersionDialog,
								confirmVersionDialog: hub.confirmVersionDialog,
								marketSyncDialog,
								syncBusy,
								setMarketSyncDialog,
								confirmMarketSync,
								deleteSkillDialog,
								setDeleteSkillDialog,
								runDeleteSkill,
								confirmClearTrash,
								setConfirmClearTrash,
								clearTrash
							})
						]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelWidthControls, { container: shell })]
			});
		}
		// src/client/index.tsx
		/** Locale namespace this plugin owns. */
		const NS = "dsh-skill-hub";
		/**
		* Required services (fiber inject waiting — the runtime must be up first).
		* `connection`/`remote` are the settings transport's own prerequisites
		* (`ctx.configForms.get` resolves them on the caller's fiber), and
		* `configForms` is the shared settings-form service itself; mirror the
		* official settings-plugins inject list.
		*/
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"configForms",
			"inputTriggers"
		];
		/**
		* Mount the plugin settings card and the global Skills management page.
		* @param ctx - client root context (slots, locale).
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-skill-hub: dictionaries");
			const t = ctx.locale.bind(NS);
			const api = new SkillHubApi();
			const scope = ctx.configForms.get(HUB_ENTRY_ID);
			const settingsCard = new SkillHubSettingsCardController(scope);
			ctx.effect(() => setupSkillSlashDots(ctx, api, scope), "dsh-skill-hub: slash dots");
			ctx.effect(() => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "dsh-skill-hub",
				locale: NS,
				inject: () => settingsCard.inject()
			}, SkillHubSettingsCard)), "dsh-skill-hub: plugin config");
			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: "skill-hub",
				locale: NS
			}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillHubPanel, { api }))), "dsh-skill-hub: main panel");
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: "skill-hub",
				order: 20,
				label: () => t("entry.label"),
				locale: NS
			}, IconSkillOutline16)), "dsh-skill-hub: sidebar entry");
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
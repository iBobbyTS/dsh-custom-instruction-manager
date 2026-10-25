# dsh-skill-hub

[English](README.md) | [中文版](README.zh.md)

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D22.19-339933">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/cheshireez/dsh-skill-hub/main/promo/real-skill-hub.png" alt="dsh-skill-hub 面板" width="640">
</p>

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的图形化技能中枢 — 在 Web GUI 里浏览 `ctx.skills` 全量目录，开关技能、查看正文、修复发现问题、从市场安装、一键新建。

> 宿主只用官方 SDK，浏览器通过官方槽位渲染，不改 dsh 源码。

## 快速开始

**此 Fork 仅通过 GitHub 分发，不发布 npm 安装包。** npm 上名为 `dsh-skill-hub` 的包属于上游版本，不包含本 Fork 的修改。

在 DSH 桌面版打开 **插件 → 添加 → Git 仓库**，输入：

```text
https://github.com/iBobbyTS/dsh-skill-hub.git
```

如有提示，重启 DSH；随后打开 **侧边栏 → 技能**。在 **市场 → 扫描 → 导入** 中安装技能。

要求 `Node ^22.19 || >=24` + dsh web `>=0.1.7-alpha.1 <0.3`。Git 安装时运行本仓库的 `prepare` 脚本编译 `lib/` 入口文件。

两个界面 —— 管理面板在 **侧边栏 → 技能**；本插件自身的配置卡片在 **插件管理页** 的插件自有页面上（侧边栏「插件」→ dsh-skill-hub）。该卡片由本插件自己注册进 `plugins.bundle.config` 槽位（dsh 没有自动生成的配置页），覆盖总开关、向 Agent 公告、圆点颜色、用量显示与统计窗口/间隔。

## 功能

**侧边栏 → 其他插件 → AGENTS.md** — dsh 支持的指令文件清单（只读）。分组是「用户级」加上每个已注册工作区（按侧边栏顺序），没有单独的「项目级」总标题。每行大标题是磁盘上的真实文件名，副标题是从项目文件夹的父目录算起的路径：`lmdo-website/AGENTS.md` 显示为 `AGENTS.md` + `lmdo-website`，`lmdo-website/docs/AGENTS.md` 显示为 `AGENTS.md` + `lmdo-website/docs`；用户级两行的副标题是 `~/.dsh` 与 `~/.agents`。

- **只列交集** — 「dsh 支持的文件名 ∩ 磁盘上真实存在」：用户级只有 `AGENTS.md`，项目目录里是 `AGENTS.md`、`CLAUDE.md` 加 `AGENTS.local.md`、`CLAUDE.local.md` 叠加层。没有候选文件的分组保留标题，显示一行灰字「无 AGENTS.md」。
- **折叠** — 同一目录内 trim 后内容相同的候选只算一条；符号链接隐藏链接、显示原始文件（`CLAUDE.md → AGENTS.md` 与反向都处理）。去重只发生在同一目录内，跨目录内容相同也各自显示。
- **查看正文** — 点任意一行进入详情页（与技能详情同构）：文件名是标题、项目相对路径是副标题，下面是所属分组、绝对路径、大小、修改时间，最后是文件的原始正文。正文按原文用等宽字体呈现（和 SKILL.md 一样不渲染 Markdown）。只读，只提供「复制路径」。
- **扫描** — 项目内递归整棵树，硬剪 `.git` 与 `node_modules`，另外跳过页面内可编辑的「排除目录」（默认 `.agent-work`，只作用于本页）。目录已不存在的工作区整节跳过；嵌套工作区的子树只归子工作区，父项不重复列出。这一页不写任何文件。

**侧边栏 → 其他插件 → Skill** — 2 个 tab：**来源**（技能，平铺/分组+项目树，其中「用户级」卡片按技能管理方二级分类（市场来源显示上游仓库；用户自建统一显示 User Managed））、**市场**（安装与更新）。

- **浏览** — `ctx.skills` 注册表全量：项目/用户/内置+第三方。按名称、描述、`displayName` 搜索；按来源、按调用方式（模型/用户）筛选；按名称/添加时间/调用次数排序。不同来源的同名技能挂重名徽标，不再静默隐藏。项目级分组按 dsh 侧面栏的工作区顺序排列（`workspace.json` 的 `global.workspaceIds`）。
- **开关** — 单技能开关 + 整组三态开关，跨组冲突弹窗（全部关闭/保留开启）。禁用只重命名发现文件（不删除）；禁用的技能仍可查看正文、可一键重新启用。仅 `~/.dsh/skills` 与 `~/.agents/skills` 可写，其余只读。
- **调用方式** — 详情页两个 checkbox 直接改写 `SKILL.md` 的 `disable-model-invocation` / `user-invocable`（缺键即默认允许，写回默认值会把键删掉）。用户根与项目根可写；内置/插件 provider 注册的技能没有文件，置灰只读。
- **整理** — 自动聚合的来源集合 + 按 dsh 侧面栏顺序排列的项目树。顶层分组（用户级 / 项目级）是照官方「插件」页做的小标题，顺序为**用户级 → 来源集合 → 项目级**；编辑模式只显示「删除整组」，单技能操作收进行尾菜单。
- **行菜单** — 每行右侧的「…」（与 dsh 工作区行同款，悬停出现）。「在 Finder 中显示」打开技能文件所在位置；「删除」把技能移到系统废纸篓 `~/.Trash`（重名时追加时间戳，绝不直接删除），可随时在 Finder 里恢复。只读/内置技能只给 Finder 一项（内置技能在应用包内，该项置灰）。
- **诊断与修复** — provider 跳过的文件给出原因（缺 frontmatter、YAML 非法、名称不一致、描述过短）；可自动修复的（如描述里未加引号的 `:`）一键 Fix 落盘。
- **新建** — 新技能向导，写入 `~/.dsh/skills` 或 `~/.agents/skills`（`SKILL.md` 模板见下）。
- **市场** — 内置精选仓库 + 自定义 `owner/repo`。任何含 `SKILL.md` 的顶层目录都可扫描（无白名单）；`SKILL.md` 直接放在仓库根时，整个仓库算一个技能，技能名取仓库名（`.github/` 等仓库基建不计入）。异步导入，字节级进度+取消。每个源钉一个版本 —— 点 ref 徽标可在发布版/分支/手输之间切换。
- **跟踪更新** — 导入的技能记录 repo+commit 快照。检查全部/一键全更；每源徽章（已装/可更新/上游已删/新版本）。同步覆盖本地修改（先确认）；上游删除跟进移入回收站，恢复保留来源归属。更新信息只出现在详情页的上游卡片里，也只有从市场源或直链仓库导入的技能才有：内置、插件 provider 提供、手动拷入、项目级的技能详情页不显示任何更新相关内容。
- **统计** — 会话日志的调用次数+最近使用，分组头汇总；窗口与扫描间隔在设置卡片实时可调。
- **设置卡片** — 注册在 **插件管理页** 的插件自有页面上（侧边栏「插件」→ dsh-skill-hub，默认折叠，点标题展开）：总开关、向 Agent 公告、调用圆点颜色、用量显示开关、统计窗口/间隔。

## 为什么还需要一个管理器？

[dsh-skill-manager](https://www.npmjs.com/package/dsh-skill-manager) 只读浏览，[dsh-skill-importer](https://github.com/saitamahang/dsh-skill-importer) / [dsh-find-skill](https://github.com/Moximxxx/dsh-find-skill) 只做导入。**本插件负责管理。**

| 能力 | 只读浏览器 | **dsh-skill-hub** |
| --- | --- | --- |
| 目录 | 自扫盘、仅用户根 | `ctx.skills` 全量+第三方 |
| 开关 | ❌ | ✅ 单技能+整组，从不删除 |
| 诊断 | ❌ | ✅ 原因+一键修复 |
| 市场 | ❌ | ✅ 内置+自定义，版本钉选，一键全更 |
| 来源跟踪 | ❌ | ✅ 检查/同步/回收站可恢复 |
| 统计 | ❌ | ✅ 次数+最近使用 |

`SKILL.md` 模板：

```markdown
---
name: my-skill
description: 一句话说明何时使用。
---
# my-skill
正文...
```

## 工作原理

```text
GitHub 仓库 ──扫描/导入──▶ ~/.dsh/skills
     ▲                        │
     └─检查/同步/删除── ctx.skills ◀─ provider
                              │ snapshot/get
                              ▼
                  /api/skill-hub/* ──▶ 面板（侧边栏 → 技能）
```

宿主仅用 `ctx.skills.snapshot/get`、`ctx.webServer.register`、`ctx.systemPrompt.section`。路由走 dsh 自身的 `/api` 信任栅栏（回环 / 监听器绑定地址 / `--trusted-host`），JSON。

## HTTP API

| 端点 | 方法 | 用途 |
| --- | --- | --- |
| `/api/skill-hub/catalog?cwd=` | GET | 技能+禁用+诊断+重名 |
| `/api/skill-hub/skill?name=&cwd=` | GET | 技能正文（禁用的也可） |
| `/api/skill-hub/skill/delete` | POST | 移入系统废纸篓 `~/.Trash`（重名追加时间戳） |
| `/api/skill-hub/skill/reveal` | POST | 在 Finder 中显示技能文件（`open -R`） |
| `/api/skill-hub/toggle` | POST | `{name, enabled}` |
| `/api/skill-hub/toggle-batch` | POST | `{names, enabled}` |
| `/api/skill-hub/create` | POST | `{name, description?, root?}` |
| `/api/skill-hub/diagnostic/fix` | POST | `{path}` 自动修 frontmatter |
| `/api/skill-hub/stats` | GET | 调用次数 |
| `/api/skill-hub/config` | GET/POST | 运行时配置（`null` 清除） |
| `/api/skill-hub/groups` | GET | 集合+排序 |
| `/api/skill-hub/market` 等 | GET/POST | 市场源 列表/添加/删除/钉 ref；`…/source/check` + `…/source/sync` 检查与同步 |
| `/api/skill-hub/market/source/versions?repo=` | GET | 版本选择器的 releases+branches |
| `/api/skill-hub/repo?repo=` | GET | 发现（任意根） |
| `/api/skill-hub/repo/import` | POST | 异步任务 `{jobId, total, totalBytes}` |
| `/api/skill-hub/repo/import/progress?jobId=` | GET | 轮询进度 |
| `/api/skill-hub/repo/import/cancel` | POST | 取消任务 |
| `/api/skill-hub/sources` 等 | GET/POST | 来源 列表/检查/同步/删除/恢复/清空回收站 |
| `/api/skill-hub/update` | GET | 插件最新发布 |
| 未知的 `/api/skill-hub/*` | GET/POST | `404 {error}` 且写明路径 —— 拼错路径不该被读成鉴权失败（宿主 SPA fallback 对自己不拥有的 `/api/*` 一律回 401） |

## 开发

```bash
npm run typecheck  # tsc --noEmit
npm test           # 306 tests, 16 suites
npm run build      # tsc + tsdown → lib/index.js + lib/client.js
```

> 同一 `$DSH_HOME` + cwd 下勿开两个 `dsh web` — 无会话日志锁，会 `seq gap` 损坏。换 `DSH_HOME` 或先关旧实例。

## 故障排查

- Git 安装后出现 `ERR_MODULE_NOT_FOUND`，提示缺少 `dsh-skill-hub/lib/index.js` — 旧提交没有随 Git 提供构建产物。卸载旧版本并安装最新提交；现在 Git 依赖打包前会运行 `npm run build`。
- 出现 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` — pnpm 阻止未经批准的 Git 依赖构建脚本。先审查本仓库的 `prepare` / `build` 命令，再根据 pnpm 错误中**提供的完整 Git 依赖键**，在 `~/.dsh/profiles/desktop/pnpm-workspace.yaml` 的 `allowBuilds` 下设为 `true`，然后重试安装（也可在对应 profile 使用 `pnpm approve-builds`）。不要全局放开所有依赖构建。

- `duplicate loader entry id: skill-hub` — 删掉重复安装（只留一种 `dsh plugin add`）。
- 技能不出现 — 看诊断区（缺 frontmatter / 名称不一致 / 描述过短 / 两种发现形态抢同一个名字：`<name>/SKILL.md` 目录包与 `<name>.md` 扁平文件可以并存，注册表只会留一个）。
- 来源组空壳 — 组内技能已被删除、或禁用记录丢失（状态文件被恢复/手改）。启动时自动对账磁盘上的 `.disabled` 文件补记录，**并清掉文件已不存在的死记录**（手工删掉目录后留下的记录以前谁也动不了：启用、新建、删除三条路全失败）；无可见成员的来源组不再渲染。
- 技能建不出来 / 一直显示「已禁用」— 禁用记录指向的文件已经不在了。启动时（以及下一次点「启用」时）会把记录改指到现存的 `.disabled` 文件，找不到就直接删掉记录、把名字释放出来。
- `/` 菜单圆点消失 — dsh 内部触发源变更，目录功能不受影响。
- 找不到配置卡片 — 在插件管理页打开本插件（侧边栏「插件」→ dsh-skill-hub），展开页面顶部的「技能中枢」卡片（默认折叠）。dsh 低于 `0.1.7-alpha.1` 时本插件无法加载（它所用的 settings API 在旧版不存在）。

## 社区

[Issues](https://github.com/cheshireez/dsh-skill-hub/issues) · [讨论区](https://github.com/cheshireez/dsh-skill-hub/discussions) · [官方展示](https://github.com/deepseek-ai/deepseek-harness/discussions/3161) · [市场收录 PR](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1746) · [Discord](https://discord.gg/Ycq5dCaS4)

## License

MIT — [LICENSE](LICENSE).

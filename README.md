# dsh-skill-hub

[中文版](README.zh.md) | [English](README.md)

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D22.19-339933">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/cheshireez/dsh-skill-hub/main/promo/real-skill-hub.png" alt="dsh-skill-hub panel" width="640">
</p>

In-GUI skill hub for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — browse the full `ctx.skills` catalog, toggle skills, inspect bodies, fix discovery issues, install from the market, and scaffold new ones.

> Host runs in the dsh process via official SDKs only; browser renders through official slots. No dsh source changes.

## Quick start

**This fork is distributed from GitHub only; it does not publish an npm package.** The package named `dsh-skill-hub` on npm is the upstream release and does not contain this fork's changes.

In DSH Desktop, open **Plugins → Add → Git repository** and enter:

```text
https://github.com/iBobbyTS/dsh-skill-hub.git
```

Restart DSH if prompted, then open **sidebar → Skills**. Use **Market → Scan → Import** to add skills.

Requires `Node ^22.19 || >=24` + dsh web `>=0.1.7-alpha.1 <0.3`. Git installations run this repository's `prepare` script to compile the `lib/` entrypoints.

Two surfaces — the hub panel opens from the **Skills** entry in the main sidebar, and this plugin's own configuration card sits on the plugin's page in the **Plugins manager** (sidebar → 插件 → dsh-skill-hub). The card is registered by the plugin itself into the `plugins.bundle.config` slot — dsh has no auto-generated config page — and covers the master switch, announce-to-agent, dot colors, usage display and the stats window/interval.

## Features

**Sidebar → Other Plugins → Skill** — 2 tabs: **Sources** (skills, flat/grouped + project tree, with the personal card split by skill provider), **Market** (install + update).

- **Browse** — every root of the `ctx.skills` registry: project / user / bundled + third-party providers. Search across name, description, `displayName`; filter by source and invocation (model / user); sort by name, added time, or usage. Same-name skills from different sources get a duplicate badge instead of silently hiding. Project workspaces are ordered exactly like the DSH sidebar (`workspace.json` → `global.workspaceIds`).
- **Toggle** — per-skill switches and per-group tri-state switches with a conflict dialog (close all / keep on). Disabling renames the discovery file (never deletes); disabled skills stay inspectable and re-enableable from their detail page. Only `~/.dsh/skills` & `~/.agents/skills` are writable; everything else is read-only.
- **Invocation** — two checkboxes on the skill detail page rewrite `SKILL.md`'s `disable-model-invocation` / `user-invocable` (absent key means allowed; writing a default back removes the key). User and project roots are writable; bundled or plugin-provided skills have no file, so theirs stay greyed out.
- **Organize** — auto-aggregated source collections and a project tree ordered like the DSH sidebar. Top-level groups (项目级 / 个人) are plain section headings, like the official 插件 page; edit mode reveals the delete actions without cluttering the read view.
- **Diagnose & fix** — files the provider skips (missing frontmatter, bad YAML, name mismatch, short description) show up with reasons; auto-fixable ones (e.g. unquoted `:` in descriptions) get a one-click Fix button.
- **Scaffold** — new-skill wizard writing to `~/.dsh/skills` or `~/.agents/skills` (`SKILL.md` template below).
- **Market** — built-in curated repos plus custom `owner/repo` sources. Any top-level directory containing `SKILL.md` scans as a root (no allowlist), and a `SKILL.md` at the repo root itself scans as a single skill named after the repo (minus repo tooling such as `.github/`). Async import with byte-level progress and cancel. Each source pins a version — click the ref badge to switch between releases, branches, or a custom ref.
- **Track updates** — imported skills record a repo + commit snapshot. Check all / update-all, per-source badges (installed / updatable / deleted upstream / new release). Sync overwrites local edits (with confirm); upstream deletions move into a restorable trash that keeps the source record.
- **Stats** — per-skill call counts + last-used times from session logs (incremental cache), group summaries; window and scan interval live-configurable from the settings card.
- **Settings card** — registered on the plugin's own page in the **Plugins manager** (sidebar → 插件 → dsh-skill-hub; collapsed until you expand the title): master switch, announce-to-agent, invocation dot colors, usage display toggles, stats window/interval.

## Why not just the read-only browser?

[dsh-skill-manager](https://www.npmjs.com/package/dsh-skill-manager) browses, [dsh-skill-importer](https://github.com/saitamahang/dsh-skill-importer) / [dsh-find-skill](https://github.com/Moximxxx/dsh-find-skill) import. **This plugin manages.**

| Capability | read-only browser | **dsh-skill-hub** |
| --- | --- | --- |
| Catalog | user roots, self-scanned | `ctx.skills` registry, all roots + third-party |
| Toggle | ❌ | ✅ per-skill + per-group, never deletes |
| Diagnostics | ❌ | ✅ reasons + one-click fix |
| Market | ❌ | ✅ built-in + custom, version pins, update-all |
| Source tracking | ❌ | ✅ check/sync/trash with restore |
| Stats | ❌ | ✅ counts + last-used |

Scaffold format (`SKILL.md`):

```markdown
---
name: my-skill
description: One line when the agent should use this skill.
---
# my-skill
Body...
```

## How it works

```text
GitHub repo ──scan/import──▶ ~/.dsh/skills
     ▲                          │
     └─check/sync/delete── ctx.skills ◀─ provider
                                │ snapshot/get
                                ▼
                    /api/skill-hub/* ──▶ Panel (sidebar → Skills)
```

Host uses only `ctx.skills.snapshot/get`, `ctx.webServer.register`, `ctx.systemPrompt.section`. Routes sit behind dsh's own `/api` trust fence (loopback / the listener's bind address / `--trusted-host`), JSON.

## HTTP API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/skill-hub/catalog?cwd=` | GET | skills + disabled + diagnostics + duplicates |
| `/api/skill-hub/skill?name=&cwd=` | GET | skill body (works for disabled too) |
| `/api/skill-hub/skill/delete` | POST | move to trash (snapshots its source) |
| `/api/skill-hub/toggle` | POST | `{name, enabled}` |
| `/api/skill-hub/toggle-batch` | POST | `{names, enabled}` |
| `/api/skill-hub/create` | POST | `{name, description?, root?}` |
| `/api/skill-hub/diagnostic/fix` | POST | `{path}` auto-fix frontmatter |
| `/api/skill-hub/stats` | GET | invocation counts |
| `/api/skill-hub/config` | GET/POST | runtime config (`null` clears) |
| `/api/skill-hub/groups` | GET | collections + orders |
| `/api/skill-hub/market` etc. | GET/POST | list/add/delete/pin sources; `…/source/check` + `…/source/sync` update them |
| `/api/skill-hub/market/source/versions?repo=` | GET | releases + branches for the version picker |
| `/api/skill-hub/repo?repo=` | GET | discover (any root) |
| `/api/skill-hub/repo/import` | POST | async job `{jobId, total, totalBytes}` |
| `/api/skill-hub/repo/import/progress?jobId=` | GET | poll job |
| `/api/skill-hub/repo/import/cancel` | POST | cancel job |
| `/api/skill-hub/sources` etc. | GET/POST | list/check/sync/delete/restore/clear trash |
| `/api/skill-hub/update` | GET | plugin latest release |
| unknown `/api/skill-hub/*` | GET/POST | `404 {error}` naming the path — a typo must not read as an auth failure (the SPA fallback answers 401 for `/api/*` it does not own) |

## Development

```bash
npm run typecheck  # tsc --noEmit
npm test           # 306 tests, 16 suites
npm run build      # tsc + tsdown → lib/index.js + lib/client.js
```

> Don't run two `dsh web` on the same `$DSH_HOME` + cwd — no session-log lock (`seq gap` corruption). Use separate `DSH_HOME`.

## Troubleshooting

- `ERR_MODULE_NOT_FOUND` for `dsh-skill-hub/lib/index.js` after installing from Git — older commits omitted built files. Remove the old installation and install the latest commit: Git preparation now runs `npm run build` before packaging.
- `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` — pnpm requires explicit approval before executing a Git dependency's build scripts. Review this repository's `prepare` / `build` commands first. Then, in `~/.dsh/profiles/desktop/pnpm-workspace.yaml`, set **the exact Git-dependency key printed by pnpm** under `allowBuilds` to `true` and retry the installation (or use `pnpm approve-builds` for the relevant profile). Do not enable all dependency builds indiscriminately.

- `duplicate loader entry id: skill-hub` — remove the duplicate install (keep one `dsh plugin add` method).
- Skill missing — check the diagnostics section (frontmatter / name mismatch / short description / two discovery forms claiming the same name: a `<name>/SKILL.md` bundle and a `<name>.md` file can coexist on disk, and the registry keeps only one of them).
- Empty source group — its skills were deleted, or their disabled records were lost (sidecar restored/hand-edited). Startup reconciles `.disabled` files on disk **and prunes records whose file is gone** (a record left behind by a hand-deleted directory used to be un-actionable: enable, create and delete all failed). Source groups with no visible member are no longer rendered.
- A skill cannot be created / stays "disabled" — the disabled record pointed at a file that no longer exists. At startup (and on the next enable attempt) the record is repointed at the surviving `.disabled` file, or dropped so the name is free again.
- Dots missing in `/` menu — dsh internals changed; catalog still works.
- Settings card missing — open the plugin in the Plugins manager (sidebar → 插件 → dsh-skill-hub) and expand the 「技能中枢」 card at the top of the page (collapsed by default). On dsh older than `0.1.7-alpha.1` this plugin does not load at all (the settings API it targets does not exist there).

## Community

[Issues](https://github.com/cheshireez/dsh-skill-hub/issues) · [Discussions](https://github.com/cheshireez/dsh-skill-hub/discussions) · [Showcase](https://github.com/deepseek-ai/deepseek-harness/discussions/3161) · [Market PR](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1746) · [Discord](https://discord.gg/Ycq5dCaS4)

## License

MIT — [LICENSE](LICENSE).

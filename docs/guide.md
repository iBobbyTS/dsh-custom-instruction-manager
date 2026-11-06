# Skill Hub guide

## Features

The panel remembers the page you left — the top-level category (AGENTS.md / Skill / MCP / Hook / About) together with the Skill sub-tab (Sources / Market) — in local storage, so the next visit reopens there instead of always landing on Skill. With no record (or a corrupt/retired one) it falls back to Skill → Sources.

**Sidebar → Other Plugins → AGENTS.md** — inventory of the instruction files dsh supports. Groups are “user level” plus every registered workspace (sidebar order), with no separate project-level umbrella heading. Each row's title is the real file name on disk and its subtitle is the path from the project folder's parent: `lmdo-website/AGENTS.md` shows as `AGENTS.md` + `lmdo-website`, `lmdo-website/docs/AGENTS.md` as `AGENTS.md` + `lmdo-website/docs`; the two user-level rows show `~/.dsh` and `~/.agents`.

- **Only the intersection** — names dsh supports that actually exist: at user level only `AGENTS.md`; inside a project `AGENTS.md`, `CLAUDE.md` plus the `AGENTS.local.md` / `CLAUDE.local.md` overlays. A group with no candidates keeps its title and shows a grey “No AGENTS.md” line.
- **Collapse** — candidates in one directory whose trimmed content is identical render once; symlinks are hidden in favour of the original file (both `CLAUDE.md → AGENTS.md` and the reverse). Deduplication stays inside one directory, so identical content in two directories still shows twice.
- **Read** — click any row to open a detail page shaped like the skill detail: the file name is the title, the folder-relative path the subtitle, then scope, absolute path, size and modified time, and finally the raw file body in a monospace block (like SKILL.md, Markdown is not rendered). The body is edited right in the same monospace box (there is no separate edit mode), with a fixed "Save / Discard all edits" row underneath — ⌘S also saves, discarding asks for confirmation, and the other action is "Copy path".
- **Token counts** — the detail page ends with a two-column table (model / tokens) sized to its content. The numbers are the **real tokenizer** count of the file text for DeepSeek V4.1 Flash and GLM-5.3, not a character estimate. A row shows `-` until its count arrives; if one vocabulary fails, only that row turns red (hover for the reason) and the other model still reports. Counts are computed asynchronously when the page opens. The last row is “Manage models”: DeepSeek V4.1 Flash and GLM-5.3 are selected by default and Kimi K3 can be added — **selecting downloads** that vocabulary (19 MB), deselecting deletes it, and the selection lives in the plugin data directory. The vocabularies do not ship with the plugin: the first count downloads each `tokenizer.json` at a pinned revision from Hugging Face into `$DSH_HOME/plugin/data/custom-instruction-manager/tokenizer/`, and later counts read that local cache. Counts themselves are not cached — every visit counts the current file.
- **Scan** — the whole project tree recursively, hard-pruning `.git` and `node_modules`, plus the page-local “excluded directories” list (`.agent-work` by default; it only affects this page). Workspaces whose directory is gone are skipped entirely; a nested workspace's subtree belongs only to the nested group, never to its parent. The scan itself never writes; only saving a body does.
- **Index cache + stepped rescan** — the host keeps the last completed index: opening the page lays it out in one go (no cache → skip straight to the first scan), then rescans scope by scope — step 0 is the user level, one step per workspace — replacing the same position in the list as each step lands, so the page never flashes empty and converges to the fresh inventory; the result becomes the next cache. That index is also persisted to `$DSH_HOME/plugin/data/custom-instruction-manager/agents-index.json` and read back when the plugin loads (so on every dsh start), which means the first visit after a restart has content before the scan runs; if the home, the shared agents root or the excluded list changed, the stored key no longer matches and the file is treated as no cache. While scanning, “Rescan” turns into a disabled “Scanning (x%)”, where x = completed steps / total steps.

**Sidebar → Other Plugins → MCP** — the MCP servers configured in this dsh Loader. In dsh an MCP server is not an entry in a config file but **one `@deepseek-ai/dsh-mcp-client` plugin row each**, so this page reads the running rows (whether they come from a bundle layer, the profile patch or the home patch):

- **One row per server** — name, transport (stdio / Streamable HTTP), status and current tool count. Status is only Loaded / Starting / Failed / Disabled: dsh exposes no MCP session state, so the page never claims “connected”.
- **Config summary** — expand for the command/args/working directory or the URL, plus environment variables and headers; values are masked as `••••••` until “Show values”. The call timeout, abort-on-startup-failure flag and the patch row id ride along.
- **Tools** — expand to list the tools the server currently registers (public name `mcp__<server>__<tool>`, description, parameter names). Tools that belong to no server listed here (a server inside an agent preset, or a truncated/rewritten name) are listed separately as unattributed.
- **Toggle** — the per-row switch goes through dsh's plugin manager: it only writes the enablement flag into the profile patch and never edits the server config. The result is reported honestly (applied / restart required / overridden / failed). Rows without an `id` in the patch (e.g. insert rows written by other products) and dsh-managed plugins are read-only, with the reason on the row.
- **Add / edit / delete** — every row carries an Edit button (no need to expand it first; rows created here also get Delete). “Add server” opens a form for a new `@deepseek-ai/dsh-mcp-client` row: stdio (command, one argument per line, working directory, `KEY=VALUE` environment lines) or Streamable HTTP (URL, `KEY: VALUE` header lines), plus call timeout, abort-on-startup-failure and the instructions byte limit. Rows created here carry an `mcp-hub-*` id and live in one marker-delimited managed block inside the profile patch (`# @managed-by: custom-instruction-manager (mcp)`); a save rewrites only that block — everything outside it, including other products' rows, `!!js` expressions and rows dsh's config editor appends between the markers, stays byte-identical — and Delete removes the row from it.
- **Rows the panel does not own** — an existing row is edited through dsh's own config editor (`configEditor.edit`), which validates the whole patch, writes it atomically and lets the Loader apply it; it cannot be deleted here because the panel does not own its declaration (delete says where it lives instead). Rows whose config contains a `!!js` expression stay read-only: the form cannot see the expression's value, so a save would silently turn it into a literal. Duplicate `serverName`s are refused up front (dsh rejects the second instance at activation).
- **Degraded mode** — without a plugin manager in this deployment the servers are still listed from the Loader; only the switches are disabled, with an explanation. Without dsh's config editor only rows in the managed block stay editable.

**Sidebar → Other Plugins → Skill** — 2 tabs: **Sources** (skills, flat/grouped + project tree, with the personal card split by managed-by (market imports show their upstream repo; user-owned skills show User Managed)), **Market** (install + update).

- **Browse** — every root of the `ctx.skills` registry: project / user / bundled + third-party providers. Search across name, description, `displayName`; filter by source and invocation (model / user); sort by name, added time, or usage. Same-name skills from different sources get a duplicate badge instead of silently hiding. Project workspaces are ordered exactly like the DSH sidebar (`workspace.json` → `global.workspaceIds`).
- **No enable/disable** — the hub does not toggle skills. `SKILL.md.disabled` files left by older versions stay untouched and outside discovery; rename one back manually (`SKILL.md.disabled` → `SKILL.md`, or `<name>.md.disabled` → `<name>.md`) to re-enable it.
- **Invocation** — two checkboxes on the skill detail page rewrite `SKILL.md`'s `disable-model-invocation` / `user-invocable` (absent key means allowed; writing a default back removes the key). User and project roots are writable; bundled or plugin-provided skills have no file, so theirs stay greyed out.
- **Edit** — the skill body box is editable in place; there is no separate edit mode. It looks exactly like the read-only box (height follows the content, scrolling inside past 62vh) and carries a fixed "Save / Discard all edits" row. Only the text after the frontmatter is replaced: `name` / `description` / invocation keys stay byte-for-byte as they are (change those through the invocation checkboxes or an editor). Both buttons are grey until something changes; ⌘S saves; going back with unsaved changes asks first; after a save the body becomes what actually landed on disk, the buttons grey out, and tokens are recounted.
- **Save conflicts** — a save carries the `mtime` + size it was loaded with. If the file changed elsewhere in the meantime (say an agent in a dsh session), the save is blocked and three choices appear: **Copy and reload** (your draft goes to the clipboard first, then the editor switches to the on-disk version) / **Keep editing** (dialog closes, draft kept, nothing written) / **Overwrite anyway**.
- **Token counts** — the skill detail page ends with the same table (DeepSeek V4.1 Flash / GLM-5.3), with the same scope as the AGENTS.md page.
- **Organize** — auto-aggregated source collections and a project tree ordered like the DSH sidebar. Top-level groups (用户级 / 项目级) are plain section headings, like the official 插件 page, ordered user-level → source collections → project tree; single-skill actions live in the row menu, and collapse-all sits next to the grouped view switcher.
- **Row menu** — every row ends in a "…" menu styled after the DSH workspace rows (shown on hover). "Show in Finder" selects the skill file; "Delete" moves the skill to the system trash `~/.Trash` (a timestamp is appended on a name clash — never a hard delete), restorable from Finder at any time. Read-only skills only get the Finder item; bundled skills grey it out because their files live inside the app asar.
- **Diagnose & fix** — files the provider skips (missing frontmatter, bad YAML, name mismatch, short description) show up with reasons; auto-fixable ones (e.g. unquoted `:` in descriptions) get a one-click Fix button.
- **Scaffold** — new-skill wizard writing to `~/.dsh/skills` or `~/.agents/skills` (`SKILL.md` template below).
- **Market** — built-in curated repos plus custom `owner/repo` sources. Any top-level directory containing `SKILL.md` scans as a root (no allowlist), and a `SKILL.md` at the repo root itself scans as a single skill named after the repo (minus repo tooling such as `.github/`). Async import with byte-level progress and cancel. Each source pins a version — click the ref badge to switch between releases, branches, or a custom ref.
- **Track updates** — imported skills record a repo + commit snapshot. Check all / update-all, per-source badges (installed / updatable / deleted upstream / new release). Sync overwrites local edits (with confirm); upstream deletions move into a restorable trash that keeps the source record. Update information lives only in the detail page's upstream card, and only skills imported from a market source or a direct repo have one: built-in, plugin-provided, hand-placed and project skills show no update UI at all.
- **Stats** — per-skill call counts + last-used times from session logs (incremental cache), group summaries; window and scan interval live-configurable from the settings card. Inherited fork copies count once across retained logs; a surviving copy remains counted when the original is deleted, while independent calls remain separate.
- **Settings card** — registered on the plugin's own page in the **Plugins manager** (sidebar → 插件 → dsh-skill-hub; collapsed until you expand the title): master switch, invocation dot colors, usage display toggles, stats window/interval.

## Comparison with other plugins

[dsh-skill-manager](https://www.npmjs.com/package/dsh-skill-manager) browses, [dsh-skill-importer](https://github.com/saitamahang/dsh-skill-importer) / [dsh-find-skill](https://github.com/Moximxxx/dsh-find-skill) import. **This plugin manages.**

| Capability | read-only browser | **dsh-skill-hub** |
| --- | --- | --- |
| Catalog | user roots, self-scanned | `ctx.skills` registry, all roots + third-party |
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
                    /api/skill-hub/* ──▶ Panel (sidebar → Other Plugins)
```

The skill catalog reads `ctx.skills.snapshot/get`; the Host registers its HTTP handlers through `ctx.webServer.register`. Routes sit behind dsh's own `/api` trust fence (loopback / the listener's bind address / `--trusted-host`), JSON.

## HTTP API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/skill-hub/catalog?cwd=` | GET | skills + diagnostics + duplicates |
| `/api/skill-hub/skill?name=&cwd=` | GET | skill body |
| `/api/skill-hub/mcp` | GET | MCP servers (Loader rows + config + tools + writability) |
| `/api/skill-hub/mcp/toggle` | POST | `{entryId, enabled}` through dsh's plugin manager, returns the refreshed list |
| `/api/skill-hub/mcp/save` | POST | `{entryId?, server}` — create (no id) or edit; a 400 carries per-field `fields` |
| `/api/skill-hub/mcp/remove` | POST | `{entryId}` — delete a row from the managed block |
| `/api/skill-hub/skill/delete` | POST | move to the system trash `~/.Trash` (timestamped on clash) |
| `/api/skill-hub/skill/reveal` | POST | reveal the skill file in Finder (`open -R`) |
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


## Troubleshooting

- `ERR_MODULE_NOT_FOUND` for `dsh-skill-hub/lib/index.js` after installing from Git — older commits omitted built files. Remove the old installation and install the latest commit: Git preparation now runs `npm run build` before packaging.
- `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` — pnpm requires explicit approval before executing a Git dependency's build scripts. Review this repository's `prepare` / `build` commands first. Then, in `~/.dsh/profiles/desktop/pnpm-workspace.yaml`, set **the exact Git-dependency key printed by pnpm** under `allowBuilds` to `true` and retry the installation (or use `pnpm approve-builds` for the relevant profile). Do not enable all dependency builds indiscriminately.

- `duplicate loader entry id: skill-hub` — remove the duplicate install (keep one `dsh plugin add` method).
- Skill missing — check the diagnostics section (frontmatter / name mismatch / short description / two discovery forms claiming the same name: a `<name>/SKILL.md` bundle and a `<name>.md` file can coexist on disk, and the registry keeps only one of them). A `.disabled` file left by an older version is not listed and not managed: rename it back manually to re-enable the skill.
- A skill cannot be created — the name is occupied on disk by an active file, a legacy `.disabled` placeholder, or an empty directory. Rename or remove the placeholder first; the hub no longer manages it.
- Dots missing in `/` menu — dsh internals changed; catalog still works.
- Settings card missing — open the plugin in the Plugins manager (sidebar → 插件 → dsh-skill-hub) and expand the 「技能中枢」 card at the top of the page (collapsed by default). On dsh older than `0.1.7-alpha.1` this plugin does not load at all (the settings API it targets does not exist there).


The plugin update check queries only this fork's GitHub releases; no published release is reported as unavailable, not as an upstream update.

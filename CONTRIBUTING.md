# Contributing

Thanks for considering a contribution to **dsh-skill-hub**. This project is a
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin with two halves:

- the **host half** (`src/index.ts` + `src/routes.ts`) runs in the dsh process and speaks only official
  dsh SDKs, and
- the **browser half** (`src/client/`) renders inside the web GUI through official slots.

Development boundaries are owned by [AGENTS.md](https://github.com/iBobbyTS/dsh-custom-instruction-manager/blob/main/AGENTS.md).

## Layout

```
src/index.ts            cordis plugin entry (config schema, settings namespace, stats wiring)
src/routes.ts           route-family aggregator (wraps every domain handler in the shared fences)
src/routes/             one file per domain + shared layers:
                        http.ts (fences/JSON/error mapping), deps.ts (route deps + writable-skill
                        resolution), catalog-data.ts (catalog/detail assembly), collection.ts
                        (origin collections), route-state.ts (throttles + import-job table),
                        helpers.ts (barrel)
src/store.ts            sidecar store barrel (paths / migrate / store)
src/skillfs.ts          writable-root file ops + barrel (skillfs/paths.ts, frontmatter.ts, scan.ts)
src/repo.ts             GitHub repo helpers barrel (repo/types.ts, discovery.ts, api.ts, install.ts,
                        github-client.ts = shared request layer)
src/stats.ts            session-log statistics reader + barrel (stats/persistence.ts, stats/scan.ts)
src/provider.ts         the hub's own ctx.skills provider (global layer)
src/protocol.ts         wire contract barrel (protocol/<domain>.ts)
src/concurrency.ts      bounded-concurrency map
src/error-text.ts       unknown → one-line error text
src/client/index.tsx    browser-half entry (slots + locale registration)
src/client/api.ts       the panel's only data access path
src/client/panel/       panel shell, views, dialogs, hooks/ (one hook per domain + aggregator)
src/client/locales/     dictionaries by view (common/skills/market/sources/detail/settings)
```

## Development setup

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # tsc declarations + tsdown bundles (lib/index.js + lib/client.js)
```

## Before opening a pull request

Choose validation for the affected surface:

1. **Typecheck** — run `npm run typecheck` for TypeScript changes.
2. **Tests** — run the relevant existing Vitest suites for changed behavior; add or adjust a distinguishing regression when needed. `npm test -- <test-file>` selects a suite. The Client includes SSR component checks, such as `McpView.test.ts` and `TokenTable.test.ts`, which verify rendered markup. They do not cover real browser interaction or layout; check those affected paths in the live GUI.
3. **Build** — after implementation or build-configuration changes, run `npm run build` to refresh `lib/index.js` and `lib/client.js`.
4. **Keep the diff focused** — one logical change per PR, with a clear title and description.
5. **Documentation** — check changed instructions, links and examples; keep both language entry points consistent. Detailed user/API behavior belongs in `docs/guide.md` and `docs/guide.zh.md`.

## Code style

- TypeScript, strict mode. ESM (`"type": "module"`).
- Host route trust comes from dsh's `/api` fence; see the boundary in [AGENTS.md](https://github.com/iBobbyTS/dsh-custom-instruction-manager/blob/main/AGENTS.md).
- The browser half uses CSS Modules; keep the settings-card chrome family-bucket-compatible.
- Comments explain *why* (routing decisions, dsh host behaviors) more than *what*.

## Testing the plugin in a live dsh web GUI

```bash
# after a change:
npm run build
# restart the dsh web process, then verify both surfaces:
#   sidebar → Other Plugins     — the hub panel
#   sidebar 插件 → dsh-skill-hub  — the plugin's settings card
```

When the web profile installs this repo as a link (`"dsh-skill-hub": "link:/path/to/repo"`, the
usual local-dev setup), `lib/` is picked up on the next `dsh web` restart — no copy step needed.

## Issues

- **Bugs**: include the dsh version, Node version, the plugin version, and the exact steps.
- **Feature requests**: describe the workflow you are trying to accomplish; a short motivation helps
  scope the change.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).

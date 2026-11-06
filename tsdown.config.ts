/**
 * Standalone build config for dsh-skill-hub (adapted from dsh-web-ui's
 * shared/tsdown.client.ts preset, vendored for a single-package repo).
 *
 * Two artifacts:
 *  - the node half (lib/index.js, lib/invariant.js): plain ESM for the host
 *    process, everything @deepseek-ai external (resolved from the dsh
 *    profile tree at runtime);
 *  - the browser half (lib/client.js): a CJS closure-factory artifact that
 *    calls window.__ModuleLoader__.load({id, factory}) and resolves
 *    externals through the injected require (the loader module table —
 *    cordis DI entities, no globals). CSS Modules are compiled by
 *    lightningcss inside the bundle: importing x.module.css yields the
 *    hashed class map, and the css text auto-injects a
 *    <style data-plugin> tag at factory execution.
 */
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve as resolvePath, sep } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/** Plugin id stamped into the __ModuleLoader__.load handoff and style tags. */
const ID = 'dsh-skill-hub'

/**
 * Modules this Client consumes from DSH 0.2.2-rc.1's browser platform table.
 * The store remains bundled to preserve the existing Client build behavior;
 * availability in the shell does not require externalizing every dependency.
 */
const CLIENT_EXTERNALS: readonly string[] = ['react', 'react/jsx-runtime', 'react-dom']

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline
 * (which requires @tsdown/css). The suffix matters: tsdown's guard matches
 * ids ending in .css, so the virtual id must not.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Node-half library build. */
function libConfig(): UserConfig {
  return {
    name: ID,
    entry: ['src/index.ts', 'src/invariant.ts'],
    outDir: 'lib',
    format: ['esm'],
    // Emit lib/index.js (not .mjs) to match the package exports map.
    fixedExtension: false,
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    dts: false,
    // clean must stay off: a default clean would wipe the lib/types
    // declarations tsc emitted before tsdown runs (see scripts/build-runtime.mjs).
    clean: false,
    // The cordis framework and the host SDK resolve at runtime from the dsh
    // profile tree, never from this package; their built declarations carry
    // .ts-suffixed relative imports rolldown cannot follow.
    external: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-skill',
      '@deepseek-ai/dsh-host-webserver',
      '@deepseek-ai/dsh-settings',
      '@deepseek-ai/dsh-system-prompt',
    ],
  }
}

/** Browser-half bundle. */
function clientConfig(): UserConfig {
  return {
    name: ID + '/client',
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    // Browser bundles inline node-idiom deps; a require() the module table
    // cannot answer is a guaranteed runtime throw, so the rule is the table
    // list itself: no opinion for table entries (external above wins),
    // bundle everything else.
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [
      {
        // CSS Modules: compile with lightningcss, emit a class-map export
        // plus a self-injecting <style data-plugin> tag.
        name: 'dsh-css-modules-inline',
        resolveId(source: string, importer: string | undefined) {
          if (!source.endsWith('.module.css')) return null
          const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
          return CSS_VIRTUAL_PREFIX + relative(process.cwd(), abs).split(sep).join('/') + CSS_VIRTUAL_SUFFIX
        },
        async load(virtualId: string) {
          if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
          const fileId = resolvePath(virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length))
          // The virtual id otherwise hides the physical stylesheet from Rolldown's watch graph.
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          const { code, exports: cssExports } = transform({
            filename: relative(process.cwd(), fileId).split(sep).join('/'),
            code: source,
            cssModules: { pattern: '[hash]_[local]' },
            minify: true,
          })
          const classMap: Record<string, string> = {}
          // Deterministic sort: lightningcss's export iteration order is
          // process-dependent, which would churn lib/client.js on rebuild.
          for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
            classMap[local] = exp.name
          }
          // One <style data-plugin> per module file; idempotent under re-evaluation.
          return [
            'const css = ' + JSON.stringify(code.toString()) + ';',
            'const tagId = ' + JSON.stringify(ID + '/' + basename(fileId)) + ';',
            'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
            '  const tag = document.createElement(\'style\');',
            '  tag.dataset.plugin = ' + JSON.stringify(ID) + ';',
            '  tag.dataset.pluginCss = tagId;',
            '  tag.textContent = css;',
            '  document.head.appendChild(tag);',
            '}',
            'export default ' + JSON.stringify(classMap) + ';',
          ].join('\n')
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(ID) + ', factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

/** Standalone build: both faces, no workspace phases. */
export default (): UserConfig[] => [libConfig(), clientConfig()]


/**
 * Build config for a third-party (out-of-repo) DSH plugin.
 *
 * Two artifacts:
 *  - `lib/index.js` — the Host half. Self-contained ESM: it imports nothing but
 *    Node builtins, so it runs from a real profile install with no workspace
 *    `node_modules` of its own. Every `@deepseek-ai/*` use in the Host sources is
 *    `import type` and is erased here.
 *  - `client/client.js` — the browser half, in the exact artifact contract the
 *    client module registry serves: CJS wrapped in
 *    `window.__ModuleLoader__.load({ id, factory })`, with `PLATFORM_MODULES`
 *    kept as `require()` calls the loader's module table answers and everything
 *    else inlined.
 *
 * The repository's `packages/client/tsdown.client.ts` preset is not published,
 * so the wrapper, the module-table externals, and the CSS-Module pipeline are
 * reproduced here (see the plugin-authoring skill's note on this gap).
 */
import { readFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/** Plugin identity: the `__ModuleLoader__.load` id and the style-tag owner. */
const ID = 'dsh-session-sync'

/**
 * `PLATFORM_MODULES` from `packages/client/web/src/platform.ts` — the shell
 * shares exactly these into the frozen module table, so they must stay
 * `require()` calls rather than being inlined.
 */
const PLATFORM_MODULES: readonly string[] = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** tsdown's own guard matches ids ending in `.css`, so the virtual id must not. */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const GLOBAL_CSS_VIRTUAL_PREFIX = '\0dsh-global-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * Emit one plugin-owned style injector plus the optional CSS-Modules class map.
 * @param id - plugin id stamped on the injected tag.
 * @param fileId - the physical stylesheet, used for the tag's identity.
 * @param css - compiled stylesheet text.
 * @param classMap - hashed local-to-global class names, absent for global CSS.
 * @returns module source that injects the tag on first factory execution.
 */
function styleInjectionModule(
  id: string,
  fileId: string,
  css: string,
  classMap?: Readonly<Record<string, string>>,
): string {
  const tagId = `${id}/${basename(fileId)}`
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

/**
 * Resolve a stylesheet import against the importing source file.
 * @param source - the relative import specifier.
 * @param importer - absolute path of the importing module.
 * @returns the absolute path of the stylesheet on disk.
 */
function stylesheetPath(source: string, importer: string | undefined): string {
  return importer === undefined ? source : resolvePath(dirname(importer), source)
}

/** Compile `*.module.css` imports into a hashed class map plus one injected tag. */
function cssModulesPlugin(): NonNullable<UserConfig['plugins']>[number] {
  return {
    name: 'dsh-session-sync:css-modules',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      return CSS_VIRTUAL_PREFIX + stylesheetPath(source, importer) + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      // Sorted because lightningcss hands the class map back in hash order,
      // which is not stable between runs: the same stylesheet produced a
      // different key order on each build, so the committed bundle differed
      // from a fresh build of the same sources for no reason. Order is
      // meaningless to the lookup, but it is not meaningless to a repository
      // that commits its build output for a `github:` install.
      const classMap: Record<string, string> = {}
      const entries = Object.entries(cssExports ?? {})
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      for (const [local, exported] of entries) classMap[local] = exported.name
      return styleInjectionModule(ID, fileId, code.toString(), classMap)
    },
  }
}

/** Compile a plain `.css` import into one globally injected tag. */
function globalCssPlugin(): NonNullable<UserConfig['plugins']>[number] {
  return {
    name: 'dsh-session-sync:css-global',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
      return GLOBAL_CSS_VIRTUAL_PREFIX + stylesheetPath(source, importer) + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(GLOBAL_CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(GLOBAL_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code } = transform({ filename: fileId, code: source, minify: true })
      return styleInjectionModule(ID, fileId, code.toString())
    },
  }
}

/** How the loader's module table answers a specifier this package requests. */
function isPlatformModule(specifier: string): boolean {
  return PLATFORM_MODULES.includes(specifier)
}

const hostConfig: UserConfig = {
  name: ID,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  deps: {
    neverBundle: (specifier: string) => isBuiltin(specifier),
    alwaysBundle: (specifier: string) => !isBuiltin(specifier),
  },
}

const clientConfig: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'client',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: isPlatformModule,
    alwaysBundle: (specifier: string) => !isPlatformModule(specifier) && !isBuiltin(specifier),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  plugins: [cssModulesPlugin(), globalCssPlugin()],
  outputOptions: {
    entryFileNames: 'client.js',
    sourcemapExcludeSources: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [hostConfig, clientConfig]

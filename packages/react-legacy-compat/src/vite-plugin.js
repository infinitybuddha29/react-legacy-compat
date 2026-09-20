import path from "node:path";
import { generateReactDomShim } from "./shim.js";

/**
 * Vite plugin restoring `findDOMNode` for legacy dependencies that call it
 * (directly, via `ReactDOM.findDOMNode`, or via `require('react-dom')`)
 * against React 19, without modifying those dependencies' source.
 *
 * See ARCHITECTURE.md for the full rationale. Summary of the technique,
 * arrived at after two earlier approaches failed under experimentation:
 *
 *   1. A Rollup/Vite `resolveId` hook returning either a `\0`-prefixed
 *      virtual module or a real file worked for a dependency imported
 *      DIRECTLY by application source, but not for a bare `react-dom`
 *      import from INSIDE another dependency that Vite's dependency
 *      optimizer also pre-bundles (e.g. react-transition-group) — the
 *      optimizer resolves such cross-package internal references itself,
 *      bypassing custom `resolveId` hooks. Verified on both Vite 6
 *      (esbuild-based optimizer) and Vite 8 (Rolldown-based optimizer) —
 *      this is general Vite dependency-optimizer behavior, not specific to
 *      either bundler backend.
 *   2. `resolve.alias`, which substitutes the specifier text *before* the
 *      optimizer's dependency graph is even built, does reach those
 *      cross-package references — but is importer-blind, so a naive alias
 *      also redirects react-dom's own internal `require("react-dom")`
 *      self-reference (verified in react-dom@19.3.0's client entry),
 *      recursing into itself.
 *
 * The fix (what ships here): alias to a *generated* file, written once per
 * project into `node_modules/.react-legacy-compat/`, with the real
 * react-dom path already resolved to a concrete absolute path baked in as
 * a literal string. Because that literal path is not the string
 * "react-dom", the same alias rule never matches it — the self-reference
 * problem disappears without needing any importer-based exemption logic.
 * The shim-generation itself (`generateReactDomShim`, in `./shim.js`) is
 * bundler-agnostic and shared with `webpack-plugin.js` — only the alias
 * wiring below is Vite-specific.
 *
 * Verified working, with no additional configuration, for: a direct named
 * import, a namespace/default-import call style, a plain CommonJS
 * `require('react-dom')` dependency, a real published dependency
 * (react-transition-group) that itself gets pre-bundled by Vite, and that
 * every other react-dom export (createPortal, flushSync, react-dom/client)
 * keeps working unchanged. See EVALS.md / fixtures/ for the fixtures
 * exercising each of these.
 */
export function reactLegacyCompat() {
  return {
    name: "react-legacy-compat",

    config(config) {
      const root = config.root ? path.resolve(config.root) : process.cwd();
      const { shimPath } = generateReactDomShim({ root });

      return {
        resolve: {
          alias: [
            // Exact-match only: must NOT intercept 'react-dom/client',
            // 'react-dom/server', etc. — those never had findDOMNode and
            // must keep resolving to the real package.
            { find: /^react-dom$/, replacement: shimPath },
          ],
        },
      };
    },
  };
}

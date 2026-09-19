import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIND_DOM_NODE_PATH = path
  .join(__dirname, "find-dom-node.js")
  .split(path.sep)
  .join("/");

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
 *
 * The generated shim doesn't use `export * from <realPath>` to forward
 * react-dom's other exports (createPortal, flushSync, etc.): Vite's
 * dependency optimizer's static CJS-named-export detection doesn't see
 * through react-dom's `index.js` (`module.exports = require('./cjs/...')`
 * indirection), so a wildcard re-export silently surfaced nothing but
 * `default` (caught by the fixture 09 regression test). Instead this
 * plugin actually `require()`s react-dom once, in Node, at config time —
 * fully executing it is safe (only *calling* its exports touches the DOM,
 * defining them doesn't) — and emits one explicit `export const name = ...`
 * per real export name, which needs no bundler-side CJS inference at all.
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
      const shimDir = path.join(root, "node_modules", ".react-legacy-compat");
      const shimPath = path.join(shimDir, "react-dom-shim.js");

      const require = createRequire(path.join(root, "package.json"));
      let realReactDom;
      let realReactDomPath;
      try {
        realReactDomPath = require.resolve("react-dom");
        // Actually executing react-dom (safe: defining its exports doesn't
        // touch the DOM, only *calling* them does) to enumerate its real
        // export names ourselves, rather than emitting `export * from
        // <realPath>` and relying on the bundler's own static CJS-export
        // detection — verified that detection does NOT see through
        // react-dom's `index.js` (`module.exports = require('./cjs/...')`)
        // indirection: an `export *` re-export from realPath only ever
        // surfaced `default`, silently dropping createPortal, flushSync,
        // and everything else (caught by fixture 09). Enumerating via a
        // real require() call is exactly as accurate as Node's own
        // resolution, so there's no guessing involved.
        realReactDom = require(realReactDomPath);
      } catch (err) {
        throw new Error(
          "[react-legacy-compat] Could not resolve/load 'react-dom' from " +
            root +
            ". Is react-dom installed? (" +
            err.message +
            ")"
        );
      }

      fs.mkdirSync(shimDir, { recursive: true });
      const realPathUrl = JSON.stringify(
        realReactDomPath.split(path.sep).join("/")
      );
      const polyfillPathUrl = JSON.stringify(FIND_DOM_NODE_PATH);
      const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
      const realExportNames = Object.keys(realReactDom).filter(
        (key) =>
          key !== "default" &&
          key !== "findDOMNode" &&
          VALID_IDENTIFIER.test(key)
      );

      fs.writeFileSync(
        shimPath,
        [
          `import * as __real from ${realPathUrl};`,
          `import { findDOMNode as __findDOMNode } from ${polyfillPathUrl};`,
          `const __base = __real.default || __real;`,
          ...realExportNames.map(
            (name) => `export const ${name} = __base[${JSON.stringify(name)}];`
          ),
          `export { findDOMNode } from ${polyfillPathUrl};`,
          `export default Object.assign({}, __base, { findDOMNode: __findDOMNode });`,
          "",
        ].join("\n")
      );

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

# EVALS.md — fixture matrix and verification

## Principle

Every fixture proves failure without the plugin, then proves success with
it. A fixture that only shows the success case is not evidence.

## Fixture apps (`fixtures/`)

Each fixture is a minimal Vite + React 19 app. Each has two npm scripts:
`test:baseline` (plugin NOT installed → must demonstrate the React-19
failure) and `test:compat` (plugin installed → must demonstrate success).
Assertions run headlessly against the built/served output.

| Fixture | Import style under test | Notes |
|---|---|---|
| `01-named-import` | `import { findDOMNode } from 'react-dom'` | direct named import, class component |
| `02-namespace-call` | `import ReactDOM from 'react-dom'; ReactDOM.findDOMNode(...)` | namespace-style call, matches how most real legacy libs call it |
| `03-cjs-require` | `const ReactDOM = require('react-dom')` inside a `.cjs`-style dependency | exercises Vite's CJS interop/pre-bundling path specifically |
| `04-react-transition-group` | real npm package `react-transition-group` `<CSSTransition>` without `nodeRef` | real-world third-party dependency, not a synthetic fixture |
| `05-dev-server` | fixture 01/04 running under `vite dev` | dev-mode / esbuild optimizeDeps path |
| `06-prod-build` | fixture 01/04 running from `vite build` output, served statically | production/Rollup path, minified |
| `07-strict-mode` | fixture 01 wrapped in `<React.StrictMode>` | double-invoked lifecycles |
| `08-unmounted-throw` | `findDOMNode` called after unmount | must throw, not return stale/wrong node |
| `09-other-exports-untouched` | app imports `createPortal`, `flushSync` from `react-dom` and `react-dom/client`'s `createRoot`, with plugin enabled | proves the plugin doesn't alter unrelated react-dom behavior |
| `10-react-quill` | real npm package `react-quill@2.0.0` (`<ReactQuill>`), a real-world, widely-used, now-unmaintained editor component whose `getEditingArea()` calls `ReactDOM.findDOMNode(this.editingArea)` internally | second real third-party package (after react-transition-group); has a hard peerDependencies ceiling at React 18, requiring `legacy-peer-deps=true` (root `.npmrc`) to install under React 19 at all — mirrors a real developer's actual situation with an abandoned dependency |

Fixtures 05/06 are dimensions applied to every fixture (each one is
actually run in both `vite dev` and `vite build` mode by `npm run
verify`/`scripts/verify.mjs`), not separate app trees, to avoid duplicating
fixture source.

## `npm run verify`

Defined at the repo root. Runs, in order, and fails fast on the first
failure:

1. `npm run build` in `packages/react-legacy-compat` (the plugin itself must
   build/typecheck cleanly).
2. `npm test` — unit tests for `find-dom-node.js` (the polyfill), the Vite
   plugin, and the webpack plugin, against the actually-installed
   `react-dom`, using `jsdom` + `react-dom/client` + `act`, independent of
   any fixture app.
3. For each Vite fixture: baseline (no plugin) dev assertion → must observe
   the documented React 19 failure. Then compat (plugin enabled) dev
   assertion → must succeed. Then compat prod build + static-serve
   assertion → must succeed.
4. For each webpack fixture (see "Webpack 5 fixtures" below): the same
   baseline/compat pattern, in both webpack `development` and `production`
   mode.

Total: one command, deterministic, no manual steps, safe to run from a
clean `npm install` (`npm run verify` itself does not require pre-existing
`node_modules/.vite` cache — each fixture step manages its own).

## What counts as "demonstrates the failure"

Not "the plugin's author believes it would fail." A captured, asserted
error: the dev server's browser console / SSR-equivalent throws
`TypeError` containing `findDOMNode is not a function` (or equivalent,
version-dependent wording) for the baseline runs, captured via a headless
browser (Playwright, already available in this environment) evaluating the
page and asserting on `window.__testResult` set by the fixture's own
`try { ... } catch (e) { window.__testResult = { ok: false, error: e.message } }`
harness script, OR (for the CJS/build cases where the error may surface as
an unhandled exception that crashes rendering) asserting the target DOM
node relevant to the test never gets its expected `data-mounted` marker
attribute.

## Webpack 5 fixtures (`fixtures/w*`)

A smaller, representative subset of the Vite matrix above — not all 11
fixtures duplicated — see PROGRESS.md's 2026-09-20 session entry and
`scripts/verify.mjs`'s `WEBPACK_FIXTURES` comment for why: the shim-
generation logic most Vite fixtures exist to exercise
(`generateReactDomShim`, in `src/shim.js`) is shared, unchanged, between
both plugins, so it's already covered. What's bundler-specific is only the
alias-wiring, which this subset targets directly, plus one real
third-party package end-to-end:

| Fixture | Import style under test | Notes |
|---|---|---|
| `w01-named-import` | `import { findDOMNode } from 'react-dom'` | webpack counterpart of `01-named-import` |
| `w03-cjs-require` | `const ReactDOM = require('react-dom')` inside a real (non-symlinked) `node_modules` CJS package | webpack counterpart of `03-cjs-require`; the closest webpack analog to the cross-package-internal-reference case that forced Vite onto `resolve.alias` (see ARCHITECTURE.md's "Webpack support") |
| `w04-react-transition-group` | real npm package `react-transition-group` `<CSSTransition>` without `nodeRef` | webpack counterpart of `04-react-transition-group` |

The "other react-dom exports unaffected" and "alias doesn't intercept
`react-dom/client`/`react-dom/server`" concerns (fixture `09-other-exports`
for Vite) are covered for webpack by unit tests in
`webpack-plugin.test.js` instead of a browser fixture, since they're
assertions about the shared shim content and the alias key's shape, not
something that needs a real page — `generateReactDomShim`'s "every export
preserved" behavior is already asserted once, exhaustively, by
`vite-plugin.test.js` against the same shared function.

Each webpack fixture is run in both webpack's `development` and
`production` `mode`, driven by `scripts/eval-fixture-webpack.mjs` (webpack
Node API → static-file-serve the output → Playwright, mirroring
`eval-fixture.mjs`'s dev/build split for Vite). Unlike Vite, this
dimension doesn't exercise a materially different *resolution* code path
for webpack (no separate pre-bundler to diverge from) — mainly
minification/mode-dependent codegen — so it isn't claimed to carry the
same evidentiary weight as Vite's dev/build split; it's still run both
ways for consistency and because it's cheap.

## What counts as "demonstrates success"

The same harness script's `window.__testResult` is `{ ok: true, tagName:
'DIV', ... }` with the returned node identity checked against the actual
rendered DOM node (`===`, via `document.querySelector` on a known
`data-testid`), not just "truthy" — a wrong-node bug (e.g. returning the
container instead of the rendered child) must fail this check.

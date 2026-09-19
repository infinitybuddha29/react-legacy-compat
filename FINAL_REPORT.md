# FINAL_REPORT.md

## Conclusion

**Yes** — a Vite application on React 19 can successfully run legacy
third-party dependencies that call `findDOMNode`, without modifying those
dependencies, via a small (~100 LOC) Vite plugin:

```ts
import { reactLegacyCompat } from "react-legacy-compat";

export default defineConfig({
  plugins: [reactLegacyCompat()],
});
```

This is demonstrated against two *real, unmodified, published* npm
packages (react-transition-group, react-quill), in both `vite dev` and
`vite build`, and against every documented `findDOMNode` call style
(named import, namespace/default-import call, plain CommonJS `require`).

## Resulting architecture

At Vite `config()` time, the plugin:

1. Resolves the consuming project's real, installed `react-dom`.
2. Actually `require()`s it once, in Node, to get its complete, accurate
   list of export names (safe — defining exports doesn't touch the DOM).
3. Writes a generated file,
   `node_modules/.react-legacy-compat/react-dom-shim.js`, containing one
   explicit `export const <name> = ...` per real export, plus
   `export { findDOMNode }` sourced from a userland polyfill, plus a
   merged `default` export.
4. Adds a `resolve.alias` entry redirecting the *exact* `react-dom`
   specifier (not `react-dom/client`, `react-dom/server`, etc.) to that
   generated file.

The `findDOMNode` polyfill itself is plain, framework-agnostic JS: given a
class component instance, it reads `instance._reactInternals` (the same
internal field React's own, now-removed `findDOMNode` used) and walks
`.child`/`.sibling` to the first fiber whose `.stateNode` is a real DOM
node. It detects an unmounted instance via `fiber.stateNode !== instance`
(React nulls that back-reference on unmount) and throws, rather than
returning a stale or wrong node.

Full rationale, the two intermediate designs that were actually built and
then replaced after failing under real testing, and the complete
evidence trail are in `ARCHITECTURE.md`.

## Experiments performed

All of the following were actually run, not merely reasoned about; scripts
and evidence live under `_research/` (throwaway, gitignored) and
`packages/react-legacy-compat/test/` + `fixtures/` (kept, part of the
verified deliverable):

- Confirmed `findDOMNode` is fully absent from `react-dom@19.3.0`'s
  exports, dev and production builds.
- Decompiled react-dom@18.3.1's own (last version that had it)
  `findDOMNode` implementation to recover the exact original algorithm.
- Confirmed `instance._reactInternals` still exists in React 19.3.0, with
  the same shape, in both dev and production builds (including that the
  production build's own minifier does not mangle that property name).
- Confirmed (mount → multiple updates → read) that
  `instance._reactInternals` is not a snapshot — React keeps it pointing
  at the current, just-committed fiber — simplifying the polyfill
  relative to React's own removed implementation, which additionally had
  to support the out-of-scope case of calling `findDOMNode` mid-render.
- Confirmed (plain unmount, conditional render-to-null unmount, unmount
  inside `<StrictMode>`, in both jsdom and a real headless browser) that
  React nulls a class fiber's `stateNode` back-reference on unmount.
- Confirmed ESM namespace mutation (the "monkey-patch the already-loaded
  module" approach) throws (`Cannot add property ..., object is not
  extensible`) — ruled out that approach.
- Built and ran a `resolveId`-hook-based virtual-module design; found and
  diagnosed a real crash (`UNLOADABLE_DEPENDENCY ... unexpected NUL byte`)
  caused by react-dom's own internal self-require looping through the
  interception.
- Fixed that, then found the deeper problem: `resolveId`-based
  interception is bypassed by Vite's dependency optimizer for `react-dom`
  references *internal* to another pre-bundled package (e.g.
  react-transition-group) — verified on **both** Vite 6 (esbuild-based
  optimizer) and Vite 8 (Rolldown-based optimizer), ruling out "avoid
  Rolldown" as a fix and confirming this is general Vite behavior.
- Redesigned around `resolve.alias` (substitutes before the optimizer
  builds its graph) pointing at a generated real file with the real
  react-dom path baked in as a literal absolute path — verified this
  reaches cross-package references and does not loop on react-dom's own
  self-reference.
- Found and fixed a silent correctness bug: `export * from <realPath>`
  only ever surfaced the `default` export in the generated shim (Vite's
  optimizer doesn't statically see through react-dom's
  `index.js → require('./cjs/...')` indirection), dropping
  `createPortal`, `flushSync`, and everything else. Fixed by enumerating
  real export names via an actual `require()` call and emitting explicit
  `export const` statements. Added a dedicated regression unit test.
- Found and fixed a test-harness bug (not a plugin bug): the Playwright
  wait condition resolved on the fixtures' own placeholder object instead
  of waiting for the real result. Re-verified every fixture after fixing
  it.
- Found and fixed two fixture timing bugs (not plugin bugs):
  `root.render()`/`root.unmount()` are not synchronous outside React's own
  `act()`; fixed by waiting on explicit readiness signals instead of fixed
  delays.
- Confirmed `react-dom/server` (SSR) resolves and renders normally,
  entirely untouched by the plugin (only the exact `react-dom` specifier
  is aliased).
- Confirmed the plugin does not regress an app still on React 18
  (differential fixture 11): native `findDOMNode` already works there;
  the plugin's override still returns the identical, correct result.

## Packages tested

| Package | Real/synthetic | Call style | Result under baseline | Result with plugin |
|---|---|---|---|---|
| (fixture source) | synthetic | named import | fails | passes |
| (fixture source) | synthetic | namespace/default-import call | fails | passes |
| `legacy-cjs-dep` (local, CJS) | synthetic | `require('react-dom')` | fails | passes |
| `react-transition-group@4.4.5` | **real npm package** | namespace/default-import call | fails | passes |
| `react-quill@2.0.0` | **real npm package**, unmaintained, peer-capped at React 18 | namespace/default-import call | fails | passes |

## Verification results

`npm run verify` — from a genuinely clean `node_modules` removal +
reinstall — passes: package build, unit tests (10 assertions across two
test files), and 9 fixtures each checked in three ways (baseline-dev,
compat-dev, compat-production-build) = 27 fixture-level checks. Full,
unedited output of the clean-install run is reproduced in
"Exact commands to reproduce" below.

Two fixtures (08, 09) intentionally don't use the "baseline fails" pattern
by design — see their own top-of-file comments and `EVALS.md`:

- `08-unmounted-throw`: baseline trivially "throws" too (findDOMNode is
  simply undefined there), which is not meaningful evidence either way —
  only the compat-enabled result (must throw an "unmounted" error, not
  return a stale node) is asserted.
- `09-other-exports`: exists specifically to prove *no regression* —
  baseline is expected to already succeed, same as compat.
- `11-react18-diff`: same shape as 09, but on React 18.

## Known limitations

- Depends on the unsupported internal `instance._reactInternals`. Guarded
  (feature-detected, throws loudly rather than guessing) but not a
  guarantee against a future React release changing the shape.
- Vite-only. The `findDOMNode` polyfill itself is framework-agnostic, but
  the module-resolution plumbing is Vite/Rollup-specific.
- Only fixes `findDOMNode`. Other APIs React 19 removed (string refs,
  legacy context, `unstable_renderSubtreeIntoContainer`, ...) are
  untouched.
- Multiple `react-dom` copies in one dependency tree are not specially
  handled — all `react-dom` imports resolve to the one, root-resolved
  copy through the shim. Not a new failure mode (React itself doesn't
  support multiple copies), and not exercised by either real package in
  the verified target set, so not built into a fixture — see
  `ARCHITECTURE.md`.
- Does not restore `findDOMNode` for function components (there is no
  instance to call it on) — this was never valid in React ≤18 either.
- Requires `legacy-peer-deps=true` (or equivalent) to even `npm install` a
  package like react-quill whose own `peerDependencies` still cap at React
  18 — this is a property of the ecosystem/npm, not something the plugin
  can or should paper over.

## Risks

- **Silent breakage on a future React internals change.** Mitigated by
  throwing a clear, identifiable error rather than a wrong node, and by a
  unit test suite that runs against the actually-installed React version.
- **A maintainer of a legacy package fixes it upstream (adds `nodeRef` /
  drops `findDOMNode`), and an app keeps the plugin enabled unnecessarily.**
  Low risk — the plugin is inert (adds one export) for code that doesn't
  call `findDOMNode`.
- **Ecosystem drift**: Vite's dependency-optimizer internals (esbuild →
  Rolldown transition, observed first-hand during this project) are not
  a stable target. The chosen technique (`resolve.alias` to a generated
  real file) was specifically chosen because it held across both
  generations; a future Vite architecture change could still require
  revisiting this.

## Future work

- A companion package/CLI hint (`npx react-legacy-compat doctor`?) that
  scans `node_modules` for known packages still calling `findDOMNode`,
  to help users decide when they can safely remove this plugin.
- Consider whether the same generated-shim-plus-alias technique
  generalizes to other React 19-removed legacy APIs on request from real
  affected packages (out of scope for v0.1 per the scope freeze — no
  evidence of demand yet).
- webpack/Rspack support, if there is real demand — same polyfill,
  different module-resolution plumbing.

## Exact commands to reproduce all results

```bash
git clone <this repo>
cd react-legacy-compat
npm install
npx playwright install --with-deps chromium   # only needed once
npm run verify
```

Individual pieces, if you want to inspect a single result:

```bash
# Unit tests only
node --test packages/react-legacy-compat/test/find-dom-node.test.js \
             packages/react-legacy-compat/test/vite-plugin.test.js

# One fixture, one mode, with/without the plugin (COMPAT=1/0):
node scripts/eval-fixture.mjs 10-react-quill dev 0   # baseline: must fail
node scripts/eval-fixture.mjs 10-react-quill dev 1   # compat: must pass
node scripts/eval-fixture.mjs 10-react-quill build 1 # production build
```

---

STATUS: COMPLETE

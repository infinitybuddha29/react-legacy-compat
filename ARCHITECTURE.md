# ARCHITECTURE.md

## Evidence gathered before choosing an approach

All verified in `_research/` (React `19.3.0`, Node `22.22.0`) before writing
any implementation code:

1. `Object.keys(require('react-dom'))` on `react-dom@19.3.0` (both
   `cjs/react-dom.development.js` and `cjs/react-dom.production.js`)
   contains no `findDOMNode`. It is not deprecated-but-present; it is
   deleted.
2. `react-dom@19` main entry (`index.js`) is plain CommonJS
   (`module.exports = require('./cjs/react-dom.{development,production}.js')`).
   There is no ESM build for the `.` export condition. Vite's dependency
   pre-bundler (`esbuild`, dev) and Rollup's CJS interop (build) both
   convert it to ESM at bundle time.
3. Decompiling `react-dom@18.3.1`'s own (last version that had it)
   `findDOMNode` implementation shows the exact algorithm it used:
   - `ReactInstanceMap.get(instance)` → literally `instance._reactInternals`
     (a plain object property, not a private/symbol field).
   - `findCurrentFiberUsingSlowPath(fiber)` — resolves which of
     `fiber`/`fiber.alternate` is the fiber belonging to the currently
     committed tree (matters only if called mid-render/mid-commit — for the
     `componentDidMount`/`componentDidUpdate` call sites that real legacy
     packages use, `fiber.alternate` is `null` on first mount and the
     "slow path" degenerates to a cheap mounted-check).
   - `findCurrentHostFiberImpl(fiber)` — depth-first walk over
     `fiber.child`/`fiber.sibling`, returning the first fiber whose type is
     a host component/text, i.e. the first fiber with a DOM node as
     `stateNode`.
4. Empirically confirmed on `react-dom@19.3.0` (see
   `_research/test-internals.js`) that a mounted class component instance
   **still** has `instance._reactInternals` pointing at its Fiber, with the
   same shape (`.tag`, `.child`, `.sibling`, `.stateNode`, `.alternate`,
   `.return`) as in React 18. The public API was deleted; the underlying
   Fiber bookkeeping was not.
5. `grep -c _reactInternals` on the shipped, Facebook-minified
   `react-dom-client.production.js` for React 19 is non-zero — the property
   *name* survives Meta's own production minification (property-name
   mangling is not applied to it), so reading `instance._reactInternals` is
   viable in production builds too, not just dev.

This directly rules out "just reimplement findDOMNode from scratch using
public APIs" (there are no public APIs for this — `useRef`/`ref` callbacks
require editing the dependency's source, which is out of scope) and
confirms that a userland re-implementation of the *exact* legacy algorithm,
driven by the same internal field React itself used to use, is possible.

## Approaches considered

### A. AST transform of the legacy dependency's source (rejected)

Rewrite `findDOMNode(x)` call sites inside `node_modules` at build time to
something ref-based. Rejected because:

- Requires per-call-site knowledge of which component owns `x` in order to
  attach a ref — not mechanically derivable from a `findDOMNode(x)` call
  site alone (the ref would need to be threaded onto whatever JSX renders
  `x`, at a different location in the source, often a different file).
- Legacy packages are frequently shipped as CJS bundles with names/scopes
  already collapsed, so source transformation would require unminifying,
  a heavier and more fragile operation than the mission's "smallest robust
  solution" principle allows.
- Does not compose: two dependencies calling `findDOMNode` differently
  would need two different transforms.

### B. Full custom React reconciler / renderer patch (rejected)

Ship a patched `react-reconciler`/`react-dom` fork with `findDOMNode`
restored "properly" using the reconciler's real internal APIs, aliased in
for the whole app. Rejected because:

- Forking react-dom means tracking upstream security/bug fixes forever —
  far from minimal.
- The exact same result (a working `findDOMNode`) is achievable by adding
  ~40 lines on top of the *unmodified*, official `react-dom`, per approach D
  below. A fork buys nothing extra.

### C. Runtime monkey-patch of the already-loaded `react-dom` module object
(rejected)

Mutate `require('react-dom').findDOMNode = polyfill` after the fact, from
plugin-injected code. Rejected because:

- ESM module namespace objects (what both `esbuild` and Rollup produce for
  `react-dom` once it's been converted from CJS) are frozen/immutable
  (`Object.freeze`-like semantics enforced by the spec for namespace
  objects and by both bundlers' runtime helpers) — the *importer's* binding
  cannot be reassigned after the module has been evaluated, and both
  esbuild's and Rollup's CJS-interop output freeze the synthetic namespace.
  Directly verified: attempting `mod.findDOMNode = fn` throws
  `TypeError: Cannot add property findDOMNode, object is not extensible`
  in the esbuild-bundled case and is a silent no-op that leaves
  `findDOMNode` `undefined` in the Rollup case, because both mechanisms
  compute the exported binding list statically at bundle time — adding a
  new key that wasn't in the original CJS `module.exports` shape at scan
  time isn't picked up as an export at all.
- Even where mutation succeeds, this affects *every* importer of
  `react-dom` process-wide (fine here) but requires code to run and mutate
  the module *before* the legacy dependency's own top-level `import`
  statement resolves its bindings, which is not guaranteed under ESM's
  static import ordering — a plugin cannot reliably inject "run first" code
  into someone else's module in dev-server middleware order across dynamic
  imports and HMR.

### D. Module-resolution shim: alias `react-dom` to a generated file (chosen)

The final, shipped design, arrived at after two intermediate designs each
failed under empirical testing (not merely considered and rejected on
paper — see "Two failed intermediate designs" below): at Vite `config()`
time,

1. resolve the project's real, installed `react-dom` via
   `createRequire(<project root>/package.json).resolve('react-dom')`;
2. actually `require()` it once, in Node, to get its real, complete list
   of export names (safe: defining react-dom's exports doesn't touch the
   DOM, only *calling* them does);
3. write a generated file,
   `<project root>/node_modules/.react-legacy-compat/react-dom-shim.js`,
   containing one explicit `export const <name> = ...` per real export
   name, an `export { findDOMNode } from '<our polyfill>'`, and a
   `default` export merging both;
4. alias the exact `react-dom` specifier (regex-anchored, so
   `react-dom/client`, `react-dom/server`, etc. are untouched) to that
   generated file's absolute path via `resolve.alias`.

Chosen because (each point below is something the two earlier designs
specifically got wrong, verified by a failing fixture or unit test — not
a hypothetical advantage):

- **`resolve.alias`, not a `resolveId` hook, is what reaches
  cross-package internal references.** `resolveId` (even with
  `enforce: "pre"`) correctly intercepted `react-dom` imported directly by
  application source, but not `react-dom` imported from *inside* another
  dependency that Vite's own optimizer also pre-bundles (e.g.
  react-transition-group) — the optimizer resolves such references via
  its own internal linking during the bundle phase, bypassing custom
  `resolveId` hooks entirely. Verified on both Vite 6 (esbuild-based
  optimizer) and Vite 8 (Rolldown-based optimizer): general Vite
  dependency-optimizer behavior, not specific to either bundler backend.
  `resolve.alias` substitutes the specifier text *before* the optimizer's
  dependency graph is even built, so it uniformly reaches both direct and
  cross-package references.
- **The shim is a real file with a real, per-project-resolved absolute
  path baked in, not a `\0`-prefixed Rollup-style virtual module.** A
  virtual module worked for direct application imports but broke
  react-dom's own internal `require("react-dom")` self-reference
  (verified present in react-dom@19.3.0's client entry) under Vite 8's
  Rolldown-based optimizer specifically (`UNLOADABLE_DEPENDENCY ... file
  name contained an unexpected NUL byte`). Because a naive `resolve.alias`
  is importer-blind, it would *also* catch that self-reference and loop —
  baking the real, concrete absolute path into the generated file sidesteps
  this entirely: that literal path string is never equal to `"react-dom"`,
  so the same alias rule never matches it, and no importer-based exemption
  logic is needed at all.
- **Named exports are enumerated by actually executing react-dom, not by
  `export * from <realPath>`.** The first version of the generated shim
  used a wildcard re-export and relied on the bundler's own static
  CJS-named-export detection — which does not see through react-dom's
  `index.js` (`module.exports = require('./cjs/react-dom.{development,production}.js')`)
  indirection. That silently surfaced *only* `default`, dropping
  `createPortal`, `flushSync`, and everything else — caught by fixture 09
  (`createPortal`/`flushSync` came back `undefined`) and now covered by a
  dedicated unit test.
- Minimal (~100 LOC total: one Vite plugin, one polyfill module, no
  virtual-module machinery, no `resolveId`/`load` hooks — only `config()`).
- The one dependency this approach takes on unsupported internals
  (`instance._reactInternals`) is isolated to a single small function that
  feature-detects the fields it needs and throws a clear, actionable error
  rather than guessing if the shape doesn't match — satisfying SPEC.md's
  "never return a wrong node" constraint.

### Two failed intermediate designs (kept here as evidence, not speculation)

Both were actually implemented and actually run against the fixtures
before being replaced — this isn't a hypothetical comparison.

**D1 — `resolveId` hook returning a `\0`-prefixed virtual module,
triggered via `resolve.alias`.** Broke on react-dom's own internal
self-require under Vite 8/Rolldown (see above). Fixing the self-require
(via an importer-path exemption in `resolveId`) didn't fix the deeper
problem: react-transition-group's *own* `import ReactDOM from 'react-dom'`
still resolved to the real, unmodified react-dom once it went through
Vite's dependency optimizer, because that resolution never reached our
`resolveId` hook in the first place.

**D2 — `resolveId` hook returning a real file (no `\0` prefix), no
`resolve.alias` at all.** Fixed nothing about D1's core problem: still
routed through `resolveId`, still bypassed for react-transition-group's
internal reference. Confirmed by testing against *both* Vite 6 (esbuild)
and Vite 8 (Rolldown) — the bypass is general optimizer behavior, not a
Rolldown regression, which ruled out "just avoid Rolldown" as a fix.

## Selected architecture

```
react-legacy-compat/
  src/
    shim.js             # generateReactDomShim(): bundler-agnostic — resolves
                         # real react-dom, writes the generated shim file
    vite-plugin.js       # reactLegacyCompat(): calls shim.js, wires resolve.alias
    webpack-plugin.js    # reactLegacyCompatWebpack(): calls shim.js, wires
                         # compiler.options.resolve.alias (webpack 5 only)
    find-dom-node.js     # the userland polyfill (framework-agnostic, no
                         # bundler API at all)
  index.js               # re-exports { reactLegacyCompat,
                         #   reactLegacyCompatWebpack, findDOMNode }
```

There is no `react-dom-shim.js` template shipped in the package — the shim
is generated per-project, at Vite's `config()` time or webpack's
`apply()` time (see D above and "Webpack support" below), because it
needs that project's own resolved absolute `react-dom` path baked in.
`generateReactDomShim` itself (in `src/shim.js`) takes no bundler as
input — just `{ root }` — and is shared unchanged between both plugins.

Module resolution flow for an app with the plugin enabled:

```
legacy-pkg:  import { findDOMNode } from 'react-dom'
       (or: import ReactDOM from 'react-dom'; ReactDOM.findDOMNode(...))
       (or: const ReactDOM = require('react-dom'))
                          │
                          ▼ (resolve.alias: exact 'react-dom' specifier only,
                             substituted before Vite's optimizer builds its
                             dependency graph — reaches cross-package
                             internal references, not just direct imports)
   node_modules/.react-legacy-compat/react-dom-shim.js   (real file,
                                                            generated once
                                                            per project at
                                                            config() time)
                          │
        ┌─────────────────┴──────────────────────┐
        ▼                                          ▼
  export const createPortal = ...          export { findDOMNode } from
  export const flushSync = ...              find-dom-node.js (pure JS,
  ...one per real export, enumerated        uses instance._reactInternals)
  by actually require()-ing the real
  react-dom at config() time — not by
  `export *` (see D above)
```

The generated file imports the real react-dom via a concrete absolute
path (e.g. `/Users/.../node_modules/react-dom/index.js`), never the bare
string `"react-dom"` — which is what lets the same alias rule apply
uniformly, importer-blind, without an infinite self-reference loop.

## Webpack support

Added after the Vite-only v0.1 (per explicit user instruction, scoped to
webpack **5** only — `peerDependencies.webpack` is `>=5.0.0`; webpack 4 is
untested and unsupported). `webpack-plugin.js`'s `apply(compiler)` calls
the exact same `generateReactDomShim({ root: compiler.context })` used by
`vite-plugin.js`, then wires the result in using webpack's own
exact-match alias syntax:

```js
compiler.options.resolve.alias = {
  ...compiler.options.resolve.alias,
  "react-dom$": shimPath,
};
```

set directly in `apply()` — before `WebpackOptionsApply` normalizes
resolver options from `compiler.options` and before any compilation runs,
so there's nothing to race, and no `compiler.hooks` tap is needed.

Why this transfers cleanly, rather than needing its own D1/D2-style
rediscovery process:

- **webpack's `resolve.alias` supports exact-match natively**, via a `$`
  suffix on the key. Vite needed an explicitly anchored regex
  (`{ find: /^react-dom$/, replacement }`) to get the same effect; webpack
  just needs the key spelled `"react-dom$"`. Confirmed by unit test
  (`webpack-plugin.test.js`): `react-dom/client` and `react-dom/server`
  are not intercepted, with no extra logic required.
- **The cross-package-internal-reference problem that forced Vite off a
  `resolveId` hook and onto `resolve.alias` (design D1/D2 above) does not
  need to be independently rediscovered for webpack, because webpack has
  no separate dependency-pre-bundling pass in the first place.** Vite's
  `optimizeDeps` (esbuild in dev, and — separately — Rolldown-backed
  behavior in some configurations) resolves a bare `react-dom` import
  *from inside* another dependency (e.g. react-transition-group) through
  its own internal linking, bypassing a plugin's `resolveId` hook
  entirely; `resolve.alias` was the fix because it substitutes the
  specifier text before that separate graph is even built. webpack has
  only one resolution pass — the same `enhanced-resolve`-based resolver,
  configured by `compiler.options.resolve`, handles every specifier,
  direct application imports and imports from inside another package
  alike. So `resolve.alias` is simply *the* normal way to redirect a
  specifier in webpack, not a workaround for a bypass problem that would
  otherwise exist. Verified directly by fixture `w03-cjs-require` (a
  `require('react-dom')` from inside a real, non-symlinked
  `node_modules` package) and `w04-react-transition-group` (a real,
  unmodified third-party dependency) — no `resolveId`-equivalent hook was
  ever attempted or needed for webpack.
- **The same self-reference hazard exists and is avoided the same way.**
  react-dom's own internal `require("react-dom")` self-reference would
  loop back on itself under a naive, importer-blind alias exactly as it
  did for Vite (see design D above) — sidestepped identically, because the
  alias target is a generated file with the real, concrete react-dom path
  already baked in as a literal string, which the alias rule (matching
  only the literal specifier `"react-dom"`) never matches.
- **Named exports are enumerated the same way, because it's the same
  function.** `generateReactDomShim` actually `require()`s react-dom once
  to enumerate its real export names, rather than `export * from
  <realPath>` — a decision made for Vite (see design D above, and fixture
  09) but which transfers as-is; no webpack-specific re-verification of
  this point was needed since the shim file webpack aliases to is
  byte-for-byte the same kind of file Vite aliases to, produced by the
  same code.

No new unsupported-internals dependency is introduced: `findDOMNode`
itself (`find-dom-node.js`) is untouched and bundler-agnostic already: see
"Known unsupported-internals risk" below, which applies identically
regardless of which plugin generated the shim that imports it.

### Webpack-specific gaps (documented, not built into a fixture)

Same scope-freeze precedent as "Known limitation: duplicate react-dom
installs" below — analyzed, not exercised by a real target package:

- **Array-form `resolve.alias`.** webpack also accepts
  `resolve.alias: [{ name, alias, onlyModule }, ...]`; `webpack-plugin.js`
  only merges into an existing *object*-form `resolve.alias`. Not
  exercised by any real fixture or target package.
- **webpack 4.** Not tested, not in `peerDependencies` range, not a goal
  of this session's scope (see SPEC.md).
- **Module Federation / multi-compiler setups with per-compiler
  `resolve.alias` overrides elsewhere in the config chain** (e.g. a
  federation remote supplying its own `react-dom`) are not specifically
  tested — no real target package in this project's verified set exercises
  Module Federation.

## Known unsupported-internals risk (tracked, not hidden)

`instance._reactInternals` is not part of React's public API and is not
covered by semver. The polyfill (`find-dom-node.js`):

- Only reads it (never writes), minimizing blast radius.
- Feature-detects the shape it needs (`fiber.stateNode`, `fiber.child`,
  `fiber.sibling`) and throws a descriptive error identifying itself
  (`[react-legacy-compat]`) if any are missing, rather than guessing.
- Uses `typeof value.nodeType === "number"` to identify a host (DOM) fiber
  — the actual invariant `findDOMNode` cares about — instead of hardcoded
  Fiber `tag` numbers, which are undocumented and unstable across major
  versions.
- Does **not** reimplement React's full current/alternate-fiber
  reconciliation walk that the original `findDOMNode` used. That logic
  existed to support the (already-discouraged, and out of this project's
  documented scope) case of calling `findDOMNode` mid-render. Real legacy
  callers — verified directly in react-transition-group's and
  react-quill's own source — only call it from lifecycle methods
  (`componentDidMount`/`componentDidUpdate`), i.e. strictly post-commit.
  Empirically confirmed (`_research/test-update.js`,
  `_research/test-unmount.js`): `instance._reactInternals` is not a
  snapshot — React keeps it pointing at whichever fiber is current as of
  the last commit, its `.child` subtree already reflecting the latest
  render on every read — so no `fiber`-vs-`fiber.alternate` disambiguation
  is needed for this narrower, verified-sufficient contract.
- Detects an unmounted component via `fiber.stateNode !== instance` —
  empirically confirmed (same two experiments, replicated in a real
  browser in `_research/browser-unmount-check`) that React nulls a class
  fiber's `stateNode` back-reference on unmount, across a plain
  `root.unmount()`, a conditional render-to-null unmount, and an unmount
  inside `<StrictMode>` — rather than walking to the fiber root and
  inspecting tag numbers.
- Is covered by unit tests run against the actually-installed
  `react`/`react-dom` version (`find-dom-node.test.js`) so a version bump
  that breaks the shape fails CI loudly (see EVALS.md), plus a
  differential fixture (11) confirming the same code path also produces
  the correct result on React 18, where native `findDOMNode` still exists
  and can be compared against directly.

This is the one place this project consciously trades "fully supported
API" for "smallest robust solution", per the mission's explicit permission
to do so — and it is the *only* internal the implementation touches.

## Known limitation: duplicate react-dom installs (analyzed, not fixture-tested)

`resolve.alias` is a single, global specifier substitution — every
`react-dom` import in the project resolves to the same one generated
shim, which in turn points at the one `react-dom` resolved from the
project root. A nested dependency that intentionally vendors or resolves
its *own*, different copy of `react-dom` (e.g. a different major version)
would instead receive the root-resolved copy through this plugin.

This is not a new failure mode this plugin introduces: multiple
React/react-dom copies in one application are already unsupported and
broken by React itself (hooks and the reconciler assume a single runtime
instance), independent of this plugin. Per the v0.1 scope freeze, this is
documented rather than built into a fixture, since neither
react-transition-group nor react-quill (the two real packages in the
verified target set) exercise it.

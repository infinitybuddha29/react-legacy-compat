# PROGRESS.md

## 2026-09-20 — Session 3: release, npm README, third real-package fixture (complete)

### Result

Published `react-legacy-compat@0.2.0` to npm (previously only 0.1.0 was
live — and 0.1.0 had **no README at all** on the npm package page,
because the published `packages/react-legacy-compat/` directory never
contained one; only the repo root did). Tagged and released `v0.2.0` on
GitHub. README.md rewritten (both the repo-root copy and a new
`packages/react-legacy-compat/README.md`, now published and kept
byte-identical to the root copy except for relative-vs-absolute cross-file
links, since GitHub-relative links resolve wrong once read from npm's
package directory) with a requirements table, a bundler quick-start, and
an FAQ section — prioritizing what someone installing the package needs
first over the original's dev/architecture-first ordering.

### A fourth adversarial pass, done for outreach, not because it was asked for in isolation

While looking for a second real-world GitHub issue to mention the tool in
(the first, `zenoamaro/react-quill#1039`, already had a comment from a
prior session), `react-grid-layout/react-draggable#771` looked promising
at first but turned out to be already fixed upstream (react-draggable
4.6.0+ added its own React-19 feature-detection). Its last comment linked
a second issue, `react-grid-layout/react-draggable#670`
(`<DraggableCore> not mounted on DragStart!`), reported as still
reproducing on 4.7.0 with React 19. Rather than guess whether
react-legacy-compat also fixes that one, read react-draggable's actual
source (`node_modules/react-draggable/build/cjs/Draggable.js` at 4.7.2):
its own `findDOMNode()` wrapper already has a
`typeof legacyReactDOM.findDOMNode === "function"` feature-detection
fallback — exactly what this plugin restores — but when that check fails
(vanilla React 19), it silently returns `null` instead of throwing
directly, and the null then trips an unrelated-looking `<DraggableCore>
not mounted on DragStart!` invariant one call site up, in
`handleDragStart`. Same root cause, confusing downstream symptom.

Built fixture `12-react-draggable` to verify this empirically rather than
argue it from reading the source alone — and it needed a real pointer
interaction (mousedown → mousemove → mouseup) to reach the crash at all;
merely mounting the component doesn't. A page-side synthetic
`dispatchEvent` sequence was tried first and reproduced `onStart` but
never `onDrag`/`onStop` — not investigated further since it wasn't the
point; switched to a real Playwright-driven mouse drag instead, which
reproduced the exact `#670` error on baseline and the full, correct
`onStart`/`onDrag`/`onStop` lifecycle under compat, in both dev and
production build. Generalized this into `scripts/eval-fixture.mjs` as an
opt-in `data-drag-target` convention (any fixture element with that
attribute gets a real driven drag before `window.__testResult` is
awaited) rather than one-off scripting it, since "a library needs an
actual interaction, not just a mount, to reach its `findDOMNode` call
site" is a real category, not specific to react-draggable. Confirmed a
no-op for every pre-existing fixture via a full `npm run verify` re-run
after the change.

## 2026-09-20 — Session 2: webpack 5 support (complete)

### Result

`npm run verify` (extended, still the single entry point) passes: the
full original Vite suite (11 fixtures × {dev, build} × unit tests,
unchanged) plus 3 new webpack 5 fixtures × {development, production} ×
{baseline, compat}. Scoped to webpack 5 only, per explicit user
instruction — no webpack 4 support, no version matrix.

### Architecture

The shim-generation logic (resolve real `react-dom`, `require()` it once
to enumerate its real exports, write the generated
`node_modules/.react-legacy-compat/react-dom-shim.js`) was bundler-
agnostic already in spirit (ARCHITECTURE.md's original "Known
limitations" called this out) but lived inline inside `vite-plugin.js`.
Extracted verbatim into `src/shim.js` (`generateReactDomShim({ root })`),
with `vite-plugin.js` updated to call it — no behavior change, confirmed
by the unmodified `vite-plugin.test.js` still passing against the
refactor.

`webpack-plugin.js` (`reactLegacyCompatWebpack()`) calls the same shared
function and wires the result in via webpack's own exact-match alias
syntax (`{ "react-dom$": shimPath }`, set on `compiler.options.resolve`
directly inside `apply()`), instead of Vite's `config()`-hook-returned
`resolve.alias` array. See ARCHITECTURE.md's new "Webpack support"
section for why the technique transfers without rediscovering any of
Vite's own two rejected intermediate designs — webpack has no separate
dependency-optimizer pass for `resolve.alias` to need to reach *around*.

### Scope decisions (both per explicit user instruction)

1. **webpack 5 only.** `peerDependencies.webpack` set to `>=5.0.0`;
   nothing here is tested against or claims to support webpack 4.
2. **A representative fixture subset, not the full 11-fixture Vite
   matrix.** `generateReactDomShim` — the part of the logic most fixtures
   exist to exercise — is already fully covered by the *existing* Vite
   fixtures and by `vite-plugin.test.js`'s explicit "every real export
   preserved" regression test, and that coverage transfers unchanged
   because it's the same function. What's actually bundler-specific is
   only the alias wiring, so the webpack fixtures (`w01-named-import`,
   `w03-cjs-require`, `w04-react-transition-group`) were chosen to cover:
   a direct named import, the cross-package CJS `require()` case (the
   closest webpack analog to the cross-package-reference problem that
   forced Vite onto `resolve.alias` in the first place), and one real,
   unmodified third-party package end-to-end. The "other exports
   unaffected" and "exact-match doesn't intercept subpaths" concerns are
   instead covered by webpack-specific unit tests in
   `webpack-plugin.test.js`, since they're really assertions about the
   shared shim/alias-key shape, not something that needs a browser.

### Notes on the webpack harness (`scripts/eval-fixture-webpack.mjs`)

- Unlike Vite, webpack has no separate dev-server module-resolution path
  distinct from production bundling (no esbuild/Rolldown-style
  pre-bundler to diverge from). "development" vs "production" for the
  webpack fixtures maps to webpack's own `mode` option and mainly
  exercises minification/mode-dependent codegen, not a materially
  different resolution code path the way Vite's dev-vs-build split does.
  Documented as such rather than implied to be an equivalent-strength
  signal to the Vite dev/build split.
- `@babel/preset-react`'s automatic JSX runtime needed `development:
  false` pinned explicitly in every fixture's `babel-loader` options —
  left to its default, the dev/production choice of `react/jsx-dev-
  runtime` vs `react/jsx-runtime` came out inconsistent between webpack's
  `development` and `production` modes in a way unrelated to this
  project's actual subject (module resolution), producing an unrelated
  `jsxDEV is not a function` failure caught while building `w01-named-
  import`'s production case. Pinning it removed the inconsistency; not
  investigated further since it's orthogonal to what's being verified.

## 2026-09-19 — Session 1 (complete)

### Result

`npm run verify` passes, from a genuinely clean `node_modules` removal +
reinstall, across 9 fixtures × {dev, production build} × {baseline,
compat}, plus unit tests. Two real npm packages (react-transition-group,
react-quill) confirmed broken under vanilla React 19 and fixed by the
plugin without touching either package's source. See FINAL_REPORT.md for
the full writeup.

### Architecture (final)

`reactLegacyCompat()` (zero-argument): at Vite `config()` time, resolves
the project's real `react-dom`, writes a generated shim file to
`node_modules/.react-legacy-compat/react-dom-shim.js` with the real path
and every real export name baked in explicitly, and aliases the exact
`react-dom` specifier to that file. `findDOMNode` itself is a userland
Fiber-walk reading `instance._reactInternals`. Full rationale and the two
rejected intermediate designs are in ARCHITECTURE.md.

### Bugs found and fixed during adversarial testing (all real, not
hypothetical — each caught by an actual failing fixture or unit test)

1. **react-dom's own internal self-require** (`react-dom-client.development.js`
   does `require("react-dom")`) — an importer-blind `resolve.alias` looped
   back on itself. Fixed by generating a file with the real react-dom path
   already baked in as a literal absolute path, which the alias pattern
   (`^react-dom$`) never matches.
2. **Cross-package internal references bypass `resolveId`** — a
   `resolveId`-hook-based interception (the first design) worked for
   direct app imports but not for `react-dom` imported from *inside*
   another dependency that Vite's optimizer also pre-bundles (e.g.
   react-transition-group). Verified on both Vite 6 (esbuild) and Vite 8
   (Rolldown) — general Vite behavior, not bundler-specific. Fixed by
   switching from `resolveId` to `resolve.alias`, which substitutes before
   the optimizer's graph is built.
3. **`export * from` silently drops named exports** — Vite's dependency
   optimizer's static CJS-export detection doesn't see through
   react-dom's `index.js` → `module.exports = require('./cjs/...')`
   indirection, so a wildcard re-export only ever surfaced `default`
   (caught by fixture 09: `createPortal`/`flushSync` came back undefined).
   Fixed by actually `require()`-ing react-dom once at config time (safe —
   defining its exports doesn't touch the DOM) and emitting one explicit
   `export const name = ...` per real export name. Now covered by a
   dedicated unit test (`vite-plugin.test.js`) so this class of bug fails
   fast without a browser.
4. **Test harness bug**: `waitForFunction` checked `window.__testResult &&
   .settled !== false`, which is trivially true for the placeholder object
   fixtures set before their real (possibly async) result — so it resolved
   almost immediately rather than actually waiting. Fixed by using a
   non-object `"pending"` sentinel and checking `typeof === "object"`.
   Several earlier "passing" results were partly timing luck before this
   fix; all fixtures were re-verified after it.
5. **`root.render()`/`root.unmount()` are not synchronous** outside
   React's own `act()` — two fixtures (08, 09) had timing bugs from
   assuming otherwise (a same-tick `setTimeout(0)` racing ahead of the
   actual commit). Fixed by waiting on an explicit readiness signal
   (`componentDidMount`/`useEffect`) instead of a fixed delay.

### Scope freeze (per user instruction, 2026-09-19)

v0.1 is frozen. Not pursuing further hypothetical edge cases (duplicate
react-dom installs, non-npm package managers, etc.) beyond what's already
documented as a known limitation — no real package in the target set
(react-transition-group, react-quill) exercises them.

### Deferred (post-session, per user request)

Build a sibling `projects/legacy-compat-playground/` (or similar) with a
handful of commonly-broken libraries, linking `react-legacy-compat` in via
a local package reference, for the user's own manual testing. Not part of
the mission's own completion criteria — doing this last.

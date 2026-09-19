# PROGRESS.md

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

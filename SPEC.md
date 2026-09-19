# SPEC.md — react-legacy-compat

## Problem

React 19 removed `ReactDOM.findDOMNode` entirely — it is no longer exported
from `react-dom` (verified: absent from `Object.keys(require('react-dom'))`
in both the development and production builds of `react-dom@19.3.0`). Any
third-party package that calls `findDOMNode` — directly, via
`ReactDOM.findDOMNode(...)`, or via `require('react-dom').findDOMNode` —
throws `TypeError: ... is not a function` (or `undefined is not a function`)
the first time that code path runs, at both dev and build time, with no
opportunity for the *application* author to fix it, because the bug is
inside a dependency's compiled source.

## Goal

A Vite plugin, installed and configured only in the *application's*
`vite.config`, that lets such legacy dependencies keep calling
`findDOMNode` and get back the correct host DOM node, in development and in
production builds, **without the application author editing any file inside
`node_modules`** and without forking/patching the legacy package.

## Non-goals

- Restoring `findDOMNode` as a *supported*, forward-looking API for new
  application code to call. This is a compatibility shim for legacy
  dependencies, not a recommended pattern.
- Supporting bundlers other than Vite. (The technique may generalize, but
  only Vite is in scope for this project.)
- Supporting class-component-free findDOMNode use cases that never existed
  (e.g. findDOMNode on a function component instance — this was never valid
  even in React ≤18, since function components have no instance).
- Silently fixing packages that are broken for reasons *other* than the
  removal of `findDOMNode` (e.g. other removed legacy APIs like string refs,
  `unstable_renderSubtreeIntoContainer`, legacy context).

## Required behavior

Given a Vite application on React 19 with a dependency (own code untouched)
that does any of:

1. `import { findDOMNode } from 'react-dom'; findDOMNode(this)`
2. `import ReactDOM from 'react-dom'; ReactDOM.findDOMNode(this)`
3. `const ReactDOM = require('react-dom'); ReactDOM.findDOMNode(this)`
   (a CJS dependency, pre-bundled/transpiled by Vite)

when the application adds:

```ts
import { reactLegacyCompat } from "react-legacy-compat";

export default defineConfig({
  plugins: [reactLegacyCompat()],
});
```

then:

- `findDOMNode(classComponentInstance)` returns the actual mounted host DOM
  node for that class component (the same node a correctly-implemented
  `findDOMNode` would have returned pre-React-19), both in `vite dev` and in
  a `vite build` production bundle.
- `findDOMNode(domNode)` returns `domNode` unchanged (pass-through case).
- `findDOMNode(null)` / `findDOMNode(undefined)` returns `null`.
- Calling `findDOMNode` on an unmounted component instance throws an `Error`
  (matching legacy React's own contract — callers of `findDOMNode`, e.g.
  react-transition-group, already handle this by catching or by only calling
  it post-mount).
- All *other* `react-dom` exports (`createPortal`, `flushSync`,
  `createRoot` via `react-dom/client`, etc.) continue to behave exactly as
  they do without the plugin — the plugin must not otherwise change what
  `react-dom` resolves to for application code.
- Enabling the plugin has no effect on an application that never calls
  `findDOMNode` — no output size regression beyond the shim module itself,
  no behavior change.

## Constraints

- No modification of files inside `node_modules`.
- No requirement that the application author transpile or patch the legacy
  dependency's source.
- Must work for the dependency being pre-bundled by Vite's dependency
  optimizer (`optimizeDeps`) in dev, and bundled by Rollup in
  `vite build`.
- Must not silently produce a *wrong* DOM node — if the correct node cannot
  be determined, throwing (matching legacy behavior for unmounted
  components) is preferred over returning a wrong node.
- Explicitly allowed to depend on a documented, tested-against-specific-
  versions React internal field (`instance._reactInternals`), **as long as
  this is documented as an unsupported-internals dependency** with a stated
  compatibility range and a loud runtime failure mode if the shape is
  unrecognized (see ARCHITECTURE.md and the "Known limitations" section of
  FINAL_REPORT.md).

## Acceptance

See `EVALS.md` for the concrete fixture matrix and `npm run verify` for the
single command that must pass for this spec to be considered met.

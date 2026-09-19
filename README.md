# react-legacy-compat

A Vite plugin that restores `ReactDOM.findDOMNode` for legacy third-party
dependencies running under React 19+, **without editing anything inside
`node_modules`**.

React 19 removed `findDOMNode` from `react-dom` entirely. Any dependency
that still calls it — directly, via `ReactDOM.findDOMNode(...)`, or via
`require('react-dom')` — throws `TypeError: ... is not a function` the
moment that code path runs. This plugin lets those dependencies keep
working while you migrate away from them (or while you wait for them to be
fixed upstream).

## Install

```bash
npm install --save-dev react-legacy-compat
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactLegacyCompat } from "react-legacy-compat";

export default defineConfig({
  plugins: [react(), reactLegacyCompat()],
});
```

That's it — no other configuration. Any dependency in your project that
calls `findDOMNode` on a class component instance will now get the correct
DOM node back, in both `vite dev` and `vite build`.

## What this actually does

At Vite config time, the plugin:

1. Resolves your project's real, installed `react-dom` package.
2. Generates a small file (`node_modules/.react-legacy-compat/react-dom-shim.js`)
   that re-exports everything real `react-dom` exports, plus a userland
   `findDOMNode` implementation.
3. Aliases the exact `react-dom` specifier (not `react-dom/client`,
   `react-dom/server`, etc.) to that generated file.

The `findDOMNode` implementation walks the React Fiber tree reachable from
`instance._reactInternals` — the same internal field React's own removed
`findDOMNode` used — to find the first rendered host (DOM) node. This is an
unsupported React internal, used deliberately and narrowly; see
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full rationale, the
alternatives that were tried and rejected, and exactly what's being relied
upon.

## What's verified

`npm run verify` (see [EVALS.md](./EVALS.md)) exercises, in both dev and
production-build mode:

- A direct named import (`import { findDOMNode } from 'react-dom'`)
- The namespace/default-import call style (`ReactDOM.findDOMNode(...)`)
- A plain CommonJS dependency (`require('react-dom')`)
- Two real, unmodified npm packages: **react-transition-group**
  (`<CSSTransition>` without `nodeRef`) and **react-quill** (a widely-used,
  now-unmaintained editor component capped at React 18 in its own
  `peerDependencies`)
- `<React.StrictMode>`
- Calling `findDOMNode` on an already-unmounted component (throws, as the
  original did — it does not return a stale or wrong node)
- Every other `react-dom` export (`createPortal`, `flushSync`,
  `react-dom/client`'s `createRoot`, ...) behaving identically with the
  plugin enabled
- That the plugin doesn't regress an app still on React 18 (differential
  check)

## Known limitations

- **Relies on an unsupported React internal** (`instance._reactInternals`).
  It is read-only and feature-detected — if a future React version changes
  its shape, the polyfill throws a clear error identifying itself rather
  than silently returning a wrong node — but this is not a guarantee.
- **Vite only.** The technique (alias a bare specifier to a generated
  shim) is Vite/Rollup-specific plumbing; the `findDOMNode` polyfill itself
  is framework-agnostic, but no other bundler integration exists.
- **Only fixes `findDOMNode`.** Other APIs React 19 removed (string refs,
  legacy context, `unstable_renderSubtreeIntoContainer`, ...) are out of
  scope and are not patched by this plugin.
- **Not a fix for React 19 incompatibilities in general.** A dependency
  that's broken under React 19 for reasons other than `findDOMNode` will
  still be broken.

## Development

```bash
npm install
npm run verify
```

See [SPEC.md](./SPEC.md), [ARCHITECTURE.md](./ARCHITECTURE.md),
[EVALS.md](./EVALS.md), and [FINAL_REPORT.md](./FINAL_REPORT.md) for the
full research and design record.

# react-legacy-compat

[![npm version](https://img.shields.io/npm/v/react-legacy-compat.svg)](https://www.npmjs.com/package/react-legacy-compat)
[![CI](https://github.com/infinitybuddha29/react-legacy-compat/actions/workflows/ci.yml/badge.svg)](https://github.com/infinitybuddha29/react-legacy-compat/actions/workflows/ci.yml)

Upgraded to React 19 and now `react-transition-group`, `react-quill`, or
some other legacy dependency crashes with:

```
TypeError: ReactDOM.findDOMNode is not a function
```

**react-legacy-compat** restores `findDOMNode` for those dependencies —
**without editing anything inside `node_modules`**, and without forking
or patching the broken package. One line in your Vite or webpack config
and it's fixed.

## Requirements

| | |
|---|---|
| React / react-dom | `>=19.0.0` |
| Bundler | Vite `>=5.0.0` **or** webpack `>=5.0.0` (webpack 4 not supported) |
| Node | `>=18.0.0` |

## Install

```bash
npm install --save-dev react-legacy-compat
```

## Quick start

Pick your bundler:

### Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactLegacyCompat } from "react-legacy-compat";

export default defineConfig({
  plugins: [react(), reactLegacyCompat()],
});
```

### webpack

```js
// webpack.config.js
const { reactLegacyCompatWebpack } = require("react-legacy-compat");

module.exports = {
  plugins: [reactLegacyCompatWebpack()],
};
```

That's it — no other configuration, no code changes in your app or in
the broken dependency. Every `findDOMNode` call site (`import {
findDOMNode } from "react-dom"`, `ReactDOM.findDOMNode(...)`, or a plain
`require("react-dom")`) now gets back the correct DOM node, in dev and in
a production build.

## FAQ

**Do I need to change anything in the broken package?**
No. That's the whole point — nothing inside `node_modules` is touched or
patched.

**Will this break `react-dom/client`, `react-dom/server`, or any other
`react-dom` export?**
No. Only the plain `react-dom` specifier is affected, and only
`findDOMNode` is added — `createPortal`, `flushSync`, `createRoot`, etc.
all keep working exactly as before. Verified explicitly; see
[What's verified](#whats-verified).

**Do I need both the Vite and webpack plugins installed?**
No — use whichever one matches your bundler. Both ship in the same
package; `vite` and `webpack` are optional peer dependencies, so you only
need the one you actually use installed.

**Can I remove this once my dependencies drop `findDOMNode`?**
Yes — it's a shim, not a permanent architectural change. Delete the
plugin from your config and uninstall the package once nothing in your
dependency tree calls `findDOMNode` anymore.

**Does this work with React 18?**
It doesn't need to — React 18 already has `findDOMNode`. The plugin is
verified to not regress an app still on React 18 if you have one in a
monorepo, but there's no reason to add it there.

**Something's still broken after adding the plugin.**
This plugin only restores `findDOMNode`. If your dependency also relies
on other APIs React 19 removed (string refs, legacy context,
`unstable_renderSubtreeIntoContainer`), or is broken under React 19 for
an unrelated reason, this won't fix that — see
[Known limitations](#known-limitations).

## What's verified

`npm run verify` (see [EVALS.md](./EVALS.md)) exercises, in both dev and
production-build mode:

- A direct named import (`import { findDOMNode } from 'react-dom'`)
- The namespace/default-import call style (`ReactDOM.findDOMNode(...)`)
- A plain CommonJS dependency (`require('react-dom')`)
- Three real, unmodified npm packages: **react-transition-group**
  (`<CSSTransition>` without `nodeRef`), **react-quill** (a widely-used,
  now-unmaintained editor component capped at React 18 in its own
  `peerDependencies`), and **react-draggable** — including the
  `<DraggableCore> not mounted on DragStart!` crash reported in
  [react-draggable#670](https://github.com/react-grid-layout/react-draggable/issues/670),
  which only reproduces on a real drag interaction, not merely on mount
- `<React.StrictMode>`
- Calling `findDOMNode` on an already-unmounted component (throws, as the
  original did — it does not return a stale or wrong node)
- Every other `react-dom` export (`createPortal`, `flushSync`,
  `react-dom/client`'s `createRoot`, ...) behaving identically with the
  plugin enabled
- That the plugin doesn't regress an app still on React 18 (differential
  check)

The webpack plugin is verified against a representative subset of the
same cases (a direct named import, a CommonJS `require('react-dom')`
dependency, and react-transition-group) in both webpack `development` and
`production` mode — see [EVALS.md](./EVALS.md) for why it's a subset
rather than the full list.

## Known limitations

- **Relies on an unsupported React internal** (`instance._reactInternals`).
  It is read-only and feature-detected — if a future React version changes
  its shape, the polyfill throws a clear error identifying itself rather
  than silently returning a wrong node — but this is not a guarantee.
- **Vite and webpack 5 only.** No other bundler integration exists (no
  Rollup-standalone, esbuild-standalone, Parcel, Rspack, ...), and webpack
  **4** specifically is not supported.
- **Only fixes `findDOMNode`.** Other APIs React 19 removed (string refs,
  legacy context, `unstable_renderSubtreeIntoContainer`, ...) are out of
  scope and are not patched by this plugin.
- **Not a fix for React 19 incompatibilities in general.** A dependency
  that's broken under React 19 for reasons other than `findDOMNode` will
  still be broken.

## How it works

At config time, the plugin resolves your project's real `react-dom`,
generates a small shim re-exporting everything it exports plus a userland
`findDOMNode`, and aliases the exact `react-dom` specifier to that
generated file. The `findDOMNode` implementation walks the React Fiber
tree the same way React's own removed implementation did. Full rationale,
the alternatives that were tried and rejected, and exactly what unsupported
internal is relied upon: see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Development

This repo is the plugin's own monorepo (not something you need to clone
just to use the package above).

```bash
npm install
npm run verify
```

See [SPEC.md](./SPEC.md), [ARCHITECTURE.md](./ARCHITECTURE.md),
[EVALS.md](./EVALS.md), and [FINAL_REPORT.md](./FINAL_REPORT.md) for the
full research and design record.

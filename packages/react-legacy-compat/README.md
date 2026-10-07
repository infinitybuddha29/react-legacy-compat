# react-legacy-compat

[![npm version](https://img.shields.io/npm/v/react-legacy-compat.svg)](https://www.npmjs.com/package/react-legacy-compat)
[![CI](https://github.com/infinitybuddha29/react-legacy-compat/actions/workflows/ci.yml/badge.svg)](https://github.com/infinitybuddha29/react-legacy-compat/actions/workflows/ci.yml)

Upgraded to React 19 (or to Next.js 15/16, which ships React 19) and now
`react-transition-group`, `react-quill`, `react-draggable`, or some other
legacy dependency crashes with one of:

```
TypeError: ReactDOM.findDOMNode is not a function
TypeError: (0 , react_dom__WEBPACK_IMPORTED_MODULE_1__.findDOMNode) is not a function
TypeError: (0 , __TURBOPACK__imported__module__...react-dom...findDOMNode) is not a function
Attempted import error: 'findDOMNode' is not exported from 'react-dom'
```

**react-legacy-compat** restores `findDOMNode` for those dependencies —
**without editing anything inside `node_modules`**, and without forking
or patching the broken package. One line in your Next.js, Vite or webpack
config and it's fixed.

## Requirements

| | |
|---|---|
| React / react-dom | `>=19.0.0` |
| Framework / bundler | Next.js `>=15.3.0` (Turbopack or webpack), Vite `>=5.0.0`, **or** webpack `>=5.0.0` (webpack 4 not supported) |
| Node | `>=18.0.0` |

## Install

```bash
npm install --save-dev react-legacy-compat
```

## Quick start

Pick your framework or bundler:

### Next.js

```js
// next.config.mjs
import { withReactLegacyCompat } from "react-legacy-compat/next";

const nextConfig = {
  // ...your existing config
};

export default withReactLegacyCompat(nextConfig);
```

Works with Turbopack (the default in Next 16, and `next dev --turbopack`
in Next 15) and with webpack (`next --webpack`), in both the App Router
and the Pages Router. Your own `webpack()` function and `turbopack`
options are kept. A config function (`(phase) => config`) works too.

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

**Does it work with Next.js App Router / Turbopack?**
Yes. Next.js uses its own built-in copy of `react-dom` for the App Router
and your installed one for the Pages Router; `withReactLegacyCompat`
patches whichever one Next picks, so you never end up with two copies of
React DOM. Verified under Turbopack and webpack, dev and production
build, on Next 16.4, 15.5 and 15.3. Use `withReactLegacyCompat` here, not the
webpack plugin.

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

`npm run verify` (see [EVALS.md](https://github.com/infinitybuddha29/react-legacy-compat/blob/main/EVALS.md))
exercises, in both dev and production-build mode:

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
`production` mode — see EVALS.md (linked above) for why it's a subset
rather than the full list.

The Next.js wrapper is verified (fixture `n01-next`, Next 16.4) with a
named import, a `ReactDOM.findDOMNode(...)` call and react-transition-group,
each on both an App Router and a Pages Router page, under Turbopack and
under webpack, in `next dev` and in `next build` + `next start`.

## Known limitations

- **Relies on an unsupported React internal** (`instance._reactInternals`).
  It is read-only and feature-detected — if a future React version changes
  its shape, the polyfill throws a clear error identifying itself rather
  than silently returning a wrong node — but this is not a guarantee.
- **Next.js, Vite and webpack 5 only.** No other bundler integration
  exists (no Rollup-standalone, esbuild-standalone, Parcel, Rspack, ...),
  and webpack **4** specifically is not supported. Next.js below 15.3
  isn't supported (its `turbopack` config key didn't exist yet).
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
generated file. On Next.js, which resolves `react-dom` to a different file
per compilation layer, it instead adds a small loader that appends
`findDOMNode` to whichever `react-dom` entry file Next already chose. The
`findDOMNode` implementation walks the React Fiber
tree the same way React's own removed implementation did. Full rationale,
the alternatives that were tried and rejected, and exactly what unsupported
internal is relied upon:
[ARCHITECTURE.md](https://github.com/infinitybuddha29/react-legacy-compat/blob/main/ARCHITECTURE.md).

## Development

This package is published from a monorepo (not something you need to
clone just to use the package above):
[github.com/infinitybuddha29/react-legacy-compat](https://github.com/infinitybuddha29/react-legacy-compat).

```bash
npm install
npm run verify
```

See
[SPEC.md](https://github.com/infinitybuddha29/react-legacy-compat/blob/main/SPEC.md),
[ARCHITECTURE.md](https://github.com/infinitybuddha29/react-legacy-compat/blob/main/ARCHITECTURE.md),
[EVALS.md](https://github.com/infinitybuddha29/react-legacy-compat/blob/main/EVALS.md),
and
[FINAL_REPORT.md](https://github.com/infinitybuddha29/react-legacy-compat/blob/main/FINAL_REPORT.md)
for the full research and design record.

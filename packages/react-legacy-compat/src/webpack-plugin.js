import { generateReactDomShim } from "./shim.js";

/**
 * webpack 5 plugin restoring `findDOMNode` for legacy dependencies that
 * call it against React 19, without modifying those dependencies' source.
 * webpack 5 only — see README.md "Known limitations".
 *
 * Reuses the exact same shim-generation logic as the Vite plugin
 * (`generateReactDomShim`, in `./shim.js`): resolve the project's real
 * `react-dom`, require() it once to enumerate its real named exports, and
 * write a generated file re-exporting each of them plus a userland
 * `findDOMNode`. Only the alias wiring differs from Vite:
 *
 *   - webpack's `resolve.alias` supports an exact-match specifier natively
 *     via a `$` suffix on the key (`{ "react-dom$": <path> }`), so no
 *     regex/array form is needed the way Vite's `resolve.alias` requires.
 *   - webpack has no separate dependency-pre-bundling pass distinct from
 *     its own module resolution (unlike Vite, which resolves a bare
 *     `react-dom` import from *inside* another dependency, e.g.
 *     react-transition-group, through a separate esbuild/Rolldown-based
 *     optimizer that can bypass resolver hooks — see ARCHITECTURE.md).
 *     Every `require('react-dom')`/`import ... from 'react-dom'`,
 *     including ones from inside another package, goes through the same
 *     `resolve.alias` webpack itself already applies everywhere, so the
 *     cross-package-reference problem that forced Vite onto `resolve.alias`
 *     (over a `resolveId` hook) doesn't need to be independently
 *     rediscovered here — the same fix applies, for the same reason.
 *   - Same self-reference hazard as Vite (react-dom's own internal
 *     `require("react-dom")`) is avoided the same way: the alias target is
 *     a generated file with the real react-dom path already baked in as a
 *     concrete literal string, which the alias rule (matching only the
 *     literal specifier `"react-dom"`) never matches.
 *
 * Applied via `compiler.options.resolve.alias` directly in `apply()`
 * (before webpack's `WebpackOptionsApply` normalizes resolver options from
 * `compiler.options`, and before any compilation runs), not inside a
 * lifecycle hook — no compilation has started yet at `apply()` time, so
 * there's nothing to race.
 */
export class ReactLegacyCompatWebpackPlugin {
  apply(compiler) {
    const root = compiler.context || process.cwd();
    const { shimPath } = generateReactDomShim({ root });

    compiler.options.resolve ??= {};
    // Only merge with an existing object-form `resolve.alias`. webpack
    // also accepts an array form (`[{ name, alias, onlyModule }, ...]`);
    // that form isn't merged here — undocumented, unsupported combination,
    // not exercised by any real target dependency (see README.md "Known
    // limitations"), same scope-freeze precedent as ARCHITECTURE.md's
    // "duplicate react-dom installs" note.
    compiler.options.resolve.alias = {
      ...compiler.options.resolve.alias,
      // Exact-match only: must NOT intercept 'react-dom/client',
      // 'react-dom/server', etc. — those never had findDOMNode and must
      // keep resolving to the real package.
      "react-dom$": shimPath,
    };
  }
}

/**
 * Factory mirroring the Vite plugin's `reactLegacyCompat()` API shape:
 *
 *   import { reactLegacyCompatWebpack } from "react-legacy-compat";
 *   module.exports = { plugins: [reactLegacyCompatWebpack()] };
 */
export function reactLegacyCompatWebpack() {
  return new ReactLegacyCompatWebpackPlugin();
}

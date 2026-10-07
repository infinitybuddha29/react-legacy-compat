"use strict";

/**
 * webpack/Turbopack loader used by `withReactLegacyCompat` (./next.js).
 * Applied only to a react-dom package entry file (`react-dom/index.js`,
 * including Next's own vendored `next/dist/compiled/react-dom/index.js`),
 * it appends a `findDOMNode` export onto that module's own exports object
 * when the real one is missing. See next.js for why Next.js needs this
 * instead of the `resolve.alias` approach used for Vite and plain webpack.
 *
 * CommonJS on purpose: Turbopack runs loaders in a Node worker that loads
 * them with `require()`.
 *
 * The polyfill source is inlined rather than `require()`d: Turbopack
 * refuses to resolve files outside its project root, which this package
 * is whenever it's symlinked in (npm link, workspaces), and a bare
 * `react-legacy-compat/...` specifier fails the same way from inside
 * Next's vendored react-dom. find-dom-node.js has no imports of its own,
 * so inlining it is exact.
 */

const fs = require("node:fs");
const path = require("node:path");

const POLYFILL_SOURCE = fs
  .readFileSync(path.join(__dirname, "find-dom-node.js"), "utf8")
  .replace(/^export function findDOMNode\(/m, "function findDOMNode(");

if (POLYFILL_SOURCE.includes("export ")) {
  throw new Error(
    "[react-legacy-compat] find-dom-node.js gained an export the Next.js " +
      "loader doesn't know how to inline."
  );
}

module.exports = function reactLegacyCompatNextLoader(source) {
  return (
    source +
    "\n;(function () {\n" +
    "  var exp = module.exports;\n" +
    '  if (!exp || typeof exp.findDOMNode === "function") return;\n' +
    POLYFILL_SOURCE +
    "\n  exp.findDOMNode = findDOMNode;\n" +
    "})();\n"
  );
};

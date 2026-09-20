import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIND_DOM_NODE_PATH = path
  .join(__dirname, "find-dom-node.js")
  .split(path.sep)
  .join("/");

/**
 * Bundler-agnostic core of react-legacy-compat: resolves the project's
 * real, installed `react-dom`, and writes a generated shim file re-
 * exporting every one of its real named exports plus a userland
 * `findDOMNode`, to `<root>/node_modules/.react-legacy-compat/react-dom-shim.js`.
 *
 * Extracted out of the original Vite-only `vite-plugin.js` so the webpack
 * integration (`webpack-plugin.js`) can reuse the exact same shim-
 * generation logic — only *how each bundler is told to alias `react-dom`
 * to the returned path* differs per bundler. See ARCHITECTURE.md for why
 * the shim must be a real, per-project generated file (not a virtual
 * module) with the real react-dom path baked in as a literal string, and
 * why its exports are enumerated by actually `require()`-ing react-dom
 * rather than via `export * from`.
 *
 * @param {{ root: string }} options - absolute path to the project root
 *   (the directory containing the project's package.json / node_modules).
 * @returns {{ shimPath: string }}
 */
export function generateReactDomShim({ root }) {
  const shimDir = path.join(root, "node_modules", ".react-legacy-compat");
  const shimPath = path.join(shimDir, "react-dom-shim.js");

  const require = createRequire(path.join(root, "package.json"));
  let realReactDom;
  let realReactDomPath;
  try {
    realReactDomPath = require.resolve("react-dom");
    // Actually executing react-dom (safe: defining its exports doesn't
    // touch the DOM, only *calling* them does) to enumerate its real
    // export names ourselves, rather than emitting `export * from
    // <realPath>` and relying on a bundler's own static CJS-export
    // detection — verified that detection does NOT see through
    // react-dom's `index.js` (`module.exports = require('./cjs/...')`)
    // indirection: an `export *` re-export from realPath only ever
    // surfaced `default`, silently dropping createPortal, flushSync,
    // and everything else (caught by fixture 09). Enumerating via a
    // real require() call is exactly as accurate as Node's own
    // resolution, so there's no guessing involved.
    realReactDom = require(realReactDomPath);
  } catch (err) {
    throw new Error(
      "[react-legacy-compat] Could not resolve/load 'react-dom' from " +
        root +
        ". Is react-dom installed? (" +
        err.message +
        ")"
    );
  }

  fs.mkdirSync(shimDir, { recursive: true });
  const realPathUrl = JSON.stringify(
    realReactDomPath.split(path.sep).join("/")
  );
  const polyfillPathUrl = JSON.stringify(FIND_DOM_NODE_PATH);
  const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  const realExportNames = Object.keys(realReactDom).filter(
    (key) =>
      key !== "default" &&
      key !== "findDOMNode" &&
      VALID_IDENTIFIER.test(key)
  );

  fs.writeFileSync(
    shimPath,
    [
      `import * as __real from ${realPathUrl};`,
      `import { findDOMNode as __findDOMNode } from ${polyfillPathUrl};`,
      `const __base = __real.default || __real;`,
      ...realExportNames.map(
        (name) => `export const ${name} = __base[${JSON.stringify(name)}];`
      ),
      `export { findDOMNode } from ${polyfillPathUrl};`,
      `export default Object.assign({}, __base, { findDOMNode: __findDOMNode });`,
      "",
    ].join("\n")
  );

  return { shimPath };
}

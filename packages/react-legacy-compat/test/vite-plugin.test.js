import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { reactLegacyCompat } from "../src/vite-plugin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
const require = createRequire(path.join(packageRoot, "package.json"));

// Regression test for the bug caught by fixtures/09-other-exports: an
// earlier version of the generated shim used `export * from <realPath>`,
// which silently dropped every named export except `default` because
// Vite's dependency-optimizer's static CJS-export detection doesn't see
// through react-dom's `index.js` -> `module.exports = require('./cjs/...')`
// indirection. This test asserts every real, actually-installed react-dom
// export name shows up as an explicit `export const` in the generated
// shim, so that bug (or an equivalent one) fails a unit test, not only a
// browser-level fixture.
test("generated shim preserves every real react-dom export by name", () => {
  const plugin = reactLegacyCompat();
  const resolved = plugin.config({ root: packageRoot });
  const shimPath = resolved.resolve.alias[0].replacement;
  const shimContent = fs.readFileSync(shimPath, "utf8");

  const realReactDom = require("react-dom");
  const realNames = Object.keys(realReactDom).filter((k) => k !== "default");

  assert.ok(
    realNames.length > 5,
    "sanity check: react-dom should export more than a handful of names"
  );

  for (const name of realNames) {
    assert.match(
      shimContent,
      new RegExp(`export const ${name} = `),
      `shim is missing an explicit export for react-dom's "${name}"`
    );
  }

  // findDOMNode itself must come from the polyfill, not the real module.
  assert.match(shimContent, /export \{ findDOMNode \} from ".*find-dom-node\.js"/);
});

test("alias only matches the exact 'react-dom' specifier", () => {
  const plugin = reactLegacyCompat();
  const resolved = plugin.config({ root: packageRoot });
  const find = resolved.resolve.alias[0].find;

  assert.equal(find.test("react-dom"), true);
  assert.equal(find.test("react-dom/client"), false);
  assert.equal(find.test("react-dom/server"), false);
  assert.equal(find.test("my-react-dom"), false);
});

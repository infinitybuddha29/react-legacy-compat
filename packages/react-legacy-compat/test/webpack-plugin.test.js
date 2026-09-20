import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  reactLegacyCompatWebpack,
  ReactLegacyCompatWebpackPlugin,
} from "../src/webpack-plugin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");

// Shim-content correctness itself (every real react-dom export preserved,
// findDOMNode sourced from the polyfill) is already covered exhaustively
// by vite-plugin.test.js against the SAME shared `generateReactDomShim`
// (see src/shim.js) that this plugin also calls — not re-asserted here to
// avoid duplicating that coverage. What's specific to the webpack
// integration, and so what's tested here, is the alias-wiring contract.

function fakeCompiler(initialResolve) {
  return {
    context: packageRoot,
    options: { resolve: initialResolve },
  };
}

test("reactLegacyCompatWebpack() returns an object with an apply() method", () => {
  const plugin = reactLegacyCompatWebpack();
  assert.ok(plugin instanceof ReactLegacyCompatWebpackPlugin);
  assert.equal(typeof plugin.apply, "function");
});

test("apply() sets an exact-match 'react-dom$' alias to a generated shim file", () => {
  const compiler = fakeCompiler(undefined);
  reactLegacyCompatWebpack().apply(compiler);

  const shimPath = compiler.options.resolve.alias["react-dom$"];
  assert.ok(shimPath, "expected 'react-dom$' alias to be set");
  assert.ok(fs.existsSync(shimPath), "generated shim file should exist on disk");

  const shimContent = fs.readFileSync(shimPath, "utf8");
  assert.match(shimContent, /export \{ findDOMNode \} from ".*find-dom-node\.js"/);
});

test("apply() merges into, rather than clobbers, an existing resolve.alias object", () => {
  const compiler = fakeCompiler({ alias: { "my-lib": "/some/path.js" } });
  reactLegacyCompatWebpack().apply(compiler);

  assert.equal(compiler.options.resolve.alias["my-lib"], "/some/path.js");
  assert.ok(compiler.options.resolve.alias["react-dom$"]);
});

test("apply() does not add an alias for 'react-dom/client' or 'react-dom/server'", () => {
  const compiler = fakeCompiler(undefined);
  reactLegacyCompatWebpack().apply(compiler);

  const aliasKeys = Object.keys(compiler.options.resolve.alias);
  assert.ok(!aliasKeys.includes("react-dom/client$"));
  assert.ok(!aliasKeys.includes("react-dom/server$"));
  // webpack's own exact-match semantics for a `$`-suffixed key mean
  // "react-dom$" itself does not match "react-dom/client" or
  // "react-dom/server" specifiers either — no extra config needed here
  // (unlike Vite, which required an explicitly anchored regex).
});

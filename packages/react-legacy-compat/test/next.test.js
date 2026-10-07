import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { withReactLegacyCompat, REACT_DOM_ENTRY } from "../src/next.js";

const require = createRequire(import.meta.url);
const loader = require("../src/next-loader.cjs");

// Browser-level behavior (App Router + Pages Router, Turbopack + webpack,
// dev + production build) is covered by fixtures/n01-next. What's tested
// here is the config-wrapping contract and the loader's output, which
// fail fast without starting Next.

function fakeWebpackConfig() {
  return { module: { rules: [] } };
}

test("REACT_DOM_ENTRY matches react-dom entry files only", () => {
  for (const file of [
    "/app/node_modules/react-dom/index.js",
    "/app/node_modules/next/dist/compiled/react-dom/index.js",
    "/app/node_modules/next/dist/compiled/react-dom-experimental/index.js",
    "C:\\app\\node_modules\\react-dom\\index.js",
  ]) {
    assert.equal(REACT_DOM_ENTRY.test(file), true, file);
  }
  for (const file of [
    "/app/node_modules/react-dom/client.js",
    "/app/node_modules/react-dom/server.js",
    "/app/node_modules/react-dom/cjs/react-dom.production.js",
    "/app/node_modules/my-react-dom/index.js",
  ]) {
    assert.equal(REACT_DOM_ENTRY.test(file), false, file);
  }
});

test("adds a Turbopack rule and keeps the user's existing turbopack config", () => {
  const config = withReactLegacyCompat({
    reactStrictMode: true,
    turbopack: { resolveAlias: { foo: "bar" }, rules: { "*.svg": ["svgr"] } },
  });

  assert.equal(config.reactStrictMode, true);
  assert.deepEqual(config.turbopack.resolveAlias, { foo: "bar" });
  assert.deepEqual(config.turbopack.rules["*.svg"], ["svgr"]);

  const ruleKeys = Object.keys(config.turbopack.rules).filter((k) =>
    k.includes("react-dom")
  );
  assert.equal(ruleKeys.length, 1);
  const [loaderPath] = config.turbopack.rules[ruleKeys[0]].loaders;
  assert.match(loaderPath, /next-loader\.cjs$/);
});

test("adds a webpack rule and still calls the user's own webpack()", () => {
  let userCalledWith;
  const config = withReactLegacyCompat({
    webpack(webpackConfig, context) {
      userCalledWith = context;
      webpackConfig.marker = true;
      return webpackConfig;
    },
  });

  const result = config.webpack(fakeWebpackConfig(), { isServer: false });
  assert.deepEqual(userCalledWith, { isServer: false });
  assert.equal(result.marker, true);
  assert.equal(result.module.rules.length, 1);
  assert.equal(result.module.rules[0].test, REACT_DOM_ENTRY);
});

test("accepts a config function (sync or async)", async () => {
  const fromSync = await withReactLegacyCompat((phase) => ({ phase }))("p1");
  assert.equal(fromSync.phase, "p1");
  assert.equal(typeof fromSync.webpack, "function");

  const fromAsync = await withReactLegacyCompat(async (phase) => ({ phase }))("p2");
  assert.equal(fromAsync.phase, "p2");
  assert.ok(fromAsync.turbopack.rules);
});

test("loader output adds a working findDOMNode to react-dom's exports", () => {
  const out = loader("module.exports = { createPortal() {} };");
  const module = { exports: {} };
  new Function("module", "exports", out)(module, module.exports);

  assert.equal(typeof module.exports.createPortal, "function");
  assert.equal(typeof module.exports.findDOMNode, "function");
  assert.equal(module.exports.findDOMNode(null), null);
  const domNode = { nodeType: 1 };
  assert.equal(module.exports.findDOMNode(domNode), domNode);
});

test("loader output leaves an existing findDOMNode (React 18) untouched", () => {
  const out = loader("function original() {} module.exports = { findDOMNode: original };");
  const module = { exports: {} };
  new Function("module", "exports", out)(module, module.exports);

  assert.equal(module.exports.findDOMNode.name, "original");
});

#!/usr/bin/env node
// Single deterministic entry point required by the mission spec:
//   npm run verify
// Runs, in order, failing fast on the first failure:
//   1. Package build/sanity check.
//   2. Unit tests for the findDOMNode polyfill.
//   3. Every fixture: baseline (must demonstrate the React 19 failure),
//      then compat dev, then compat production build.
// See EVALS.md for the fixture matrix this drives.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let failures = 0;
function section(title) {
  console.log(`\n\x1b[1m== ${title} ==\x1b[0m`);
}
function pass(msg) {
  console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}
function fail(msg) {
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  failures++;
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
    ...opts,
  });
}

// --- 0. Fixture setup: legacy-cjs-dep must be a REAL (non-symlinked)
// node_modules package for fixture 03 to faithfully represent how a real
// npm-installed CJS dependency is laid out — see fixtures/03-cjs-require/
// package.json's explanatory comment. npm prunes this on every `npm
// install` since it isn't a declared dependency, so it's (re)written here.
section("Fixture setup");
{
  const src = path.join(ROOT, "local-legacy-deps", "legacy-cjs-dep");
  const dest = path.join(
    ROOT,
    "fixtures",
    "03-cjs-require",
    "node_modules",
    "legacy-cjs-dep"
  );
  fs.mkdirSync(dest, { recursive: true });
  for (const file of ["package.json", "index.js"]) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
  pass("legacy-cjs-dep installed as a real node_modules package for fixture 03");
}

// --- 1. Package build/sanity check ---
section("Package build");
try {
  const out = run("npm", ["run", "build", "-w", "packages/react-legacy-compat"]);
  pass("packages/react-legacy-compat build script succeeded");
  if (process.env.VERBOSE) console.log(out);
} catch (err) {
  fail("package build failed:\n" + err.stdout + err.stderr);
}

// --- 2. Unit tests ---
section("Unit tests (find-dom-node polyfill)");
try {
  const out = run("node", [
    "--test",
    "packages/react-legacy-compat/test/find-dom-node.test.js",
    "packages/react-legacy-compat/test/vite-plugin.test.js",
  ]); // kept explicit rather than a glob so `npm run verify` fails loudly
     // (ENOENT) if either file is ever renamed, instead of silently running 0 tests.
  const summaryLine = out.split("\n").find((l) => l.startsWith("# pass"));
  const failLine = out.split("\n").find((l) => l.startsWith("# fail"));
  if (failLine && !failLine.endsWith(" 0")) {
    fail("unit tests reported failures:\n" + out);
  } else {
    pass(`unit tests passed (${summaryLine?.trim() ?? "see output"})`);
  }
} catch (err) {
  fail("unit tests failed:\n" + err.stdout + err.stderr);
}

// --- 3. Fixtures ---
// Most fixtures follow "baseline fails, compat succeeds". Two don't, by
// design (see EVALS.md and each fixture's own top-of-file comment):
//   - 08-unmounted-throw: baseline trivially "throws" too (findDOMNode is
//     simply undefined there, regardless of mount state) — that's not
//     meaningful evidence either way, so its baseline isn't asserted.
//   - 09-other-exports: exists specifically to prove NO regression, so
//     baseline is expected to already succeed, same as compat.
const FIXTURES = [
  { name: "01-named-import" },
  { name: "02-namespace-call" },
  { name: "03-cjs-require" },
  { name: "04-react-transition-group" },
  { name: "07-strict-mode" },
  { name: "08-unmounted-throw", skipBaselineFailureCheck: true },
  { name: "09-other-exports", baselineShouldSucceed: true },
  { name: "10-react-quill" },
  { name: "11-react18-diff", baselineShouldSucceed: true },
];

function clearFixtureCaches(fixture) {
  const dir = path.join(ROOT, "fixtures", fixture, "node_modules");
  for (const name of [".vite", ".react-legacy-compat"]) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
  fs.rmSync(path.join(ROOT, "fixtures", fixture, "dist-eval"), {
    recursive: true,
    force: true,
  });
}

function evalFixture(fixture, mode, compat) {
  const out = run("node", [
    "scripts/eval-fixture.mjs",
    fixture,
    mode,
    compat ? "1" : "0",
  ]);
  return JSON.parse(out);
}

for (const { name: fixture, skipBaselineFailureCheck, baselineShouldSucceed } of FIXTURES) {
  section(`Fixture: ${fixture}`);
  clearFixtureCaches(fixture);

  // Baseline: must demonstrate the vanilla React 19 failure (unless this
  // fixture is one of the documented exceptions above).
  try {
    const { result } = evalFixture(fixture, "dev", false);
    if (skipBaselineFailureCheck) {
      pass(`baseline (dev, no plugin) ran (not asserted either way — see EVALS.md): ${JSON.stringify(result)}`);
    } else if (baselineShouldSucceed) {
      if (result.ok === true) {
        pass(`baseline (dev, no plugin) already succeeds, as expected: ${JSON.stringify(result)}`);
      } else {
        fail(`baseline (dev, no plugin) was expected to already succeed — got: ${JSON.stringify(result)}`);
      }
    } else if (result.ok === false) {
      pass(`baseline (dev, no plugin) correctly fails: ${result.error ?? JSON.stringify(result)}`);
    } else {
      fail(
        `baseline (dev, no plugin) did NOT fail as expected — got: ${JSON.stringify(result)}`
      );
    }
  } catch (err) {
    fail(`baseline dev run crashed: ${err.stdout || err.message}`);
  }

  // Compat, dev.
  clearFixtureCaches(fixture);
  try {
    const { result } = evalFixture(fixture, "dev", true);
    if (result.ok === true) {
      pass(`compat (dev, plugin enabled) succeeds`);
    } else {
      fail(`compat (dev) FAILED: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    fail(`compat dev run crashed: ${err.stdout || err.message}`);
  }

  // Compat, production build.
  clearFixtureCaches(fixture);
  try {
    const { result } = evalFixture(fixture, "build", true);
    if (result.ok === true) {
      pass(`compat (production build) succeeds`);
    } else {
      fail(`compat (production build) FAILED: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    fail(`compat build run crashed: ${err.stdout || err.message}`);
  }
}

section("Summary");
if (failures === 0) {
  console.log("\x1b[32mAll checks passed.\x1b[0m");
  process.exit(0);
} else {
  console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m`);
  process.exit(1);
}

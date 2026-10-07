#!/usr/bin/env node
// Next.js counterpart of eval-fixture.mjs / eval-fixture-webpack.mjs.
// Builds or starts one Next fixture app with the given bundler, loads
// every route in ROUTES in a headless browser, and returns a single
// combined window.__testResult (ok only if every route is ok).
//
// The bundler is a separate dimension here because Next 16 ships two
// independent ones (Turbopack, the default, and webpack via --webpack)
// and withReactLegacyCompat configures each through a different hook.
//
// Usage: node scripts/eval-fixture-next.mjs <fixtureDir> <dev|build> <0|1> <turbopack|webpack>

import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , fixtureDirArg, mode, compatArg, bundler] = process.argv;

if (
  !fixtureDirArg ||
  !["dev", "build"].includes(mode) ||
  !["0", "1"].includes(compatArg) ||
  !["turbopack", "webpack"].includes(bundler)
) {
  console.error(
    "Usage: node scripts/eval-fixture-next.mjs <fixtureDir> <dev|build> <0|1> <turbopack|webpack>"
  );
  process.exit(2);
}

const ROUTES = ["/", "/legacy"];
const fixtureDir = path.resolve(__dirname, "..", "fixtures", fixtureDirArg);
const nextBin = createRequire(path.join(fixtureDir, "package.json")).resolve(
  "next/dist/bin/next"
);
const env = { ...process.env, COMPAT: compatArg, NEXT_TELEMETRY_DISABLED: "1" };
const bundlerArgs = bundler === "webpack" ? ["--webpack"] : [];

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  const args =
    mode === "build"
      ? ["start", "-p", String(port)]
      : ["dev", "-p", String(port), ...bundlerArgs];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd: fixtureDir,
    env,
    stdio: "pipe",
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("next did not start:\n" + log)), 120000);
    const check = () => {
      if (/Ready in|ready started/i.test(log)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", check);
    child.on("exit", (code) => reject(new Error(`next exited (${code}):\n` + log)));
  });
  return { child, ready, getLog: () => log };
}

async function collectRoute(browser, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    try {
      await page.waitForFunction(() => typeof window.__testResult === "object", null, {
        timeout: 60000,
      });
    } catch {
      // Pages Router reports a crash in componentDidMount through React's
      // error overlay rather than window.onerror, so the fixture may never
      // set __testResult; fall back to the first captured error below.
    }
    const result = await page.evaluate(() =>
      typeof window.__testResult === "object" ? window.__testResult : null
    );
    return result ?? { ok: false, error: errors[0] ?? "no __testResult set" };
  } finally {
    await page.close();
  }
}

fs.rmSync(path.join(fixtureDir, ".next"), { recursive: true, force: true });

if (mode === "build") {
  try {
    execFileSync(process.execPath, [nextBin, "build", ...bundlerArgs], {
      cwd: fixtureDir,
      env,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (err) {
    console.log(
      JSON.stringify({ result: { ok: false, error: "next build failed: " + (err.stdout + err.stderr).slice(-2000) } })
    );
    process.exit(0);
  }
}

const port = await freePort();
// "localhost", not 127.0.0.1: next dev treats 127.0.0.1 as a cross-origin
// dev request and blocks its HMR/dev resources, so the App Router page
// never hydrates.
const server = startServer(port);
let browser;
try {
  await server.ready;
  browser = await chromium.launch();
  const routes = {};
  for (const route of ROUTES) {
    routes[route] = await collectRoute(browser, `http://localhost:${port}${route}`);
  }
  const failed = Object.entries(routes).find(([, r]) => r.ok !== true);
  const result = failed
    ? { ok: false, error: `${failed[0]}: ${failed[1].error ?? JSON.stringify(failed[1])}`, routes }
    : { ok: true, routes };
  console.log(JSON.stringify({ result }));
} finally {
  await browser?.close();
  server.child.kill();
}

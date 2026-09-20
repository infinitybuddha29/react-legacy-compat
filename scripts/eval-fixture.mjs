#!/usr/bin/env node
// Runs one fixture app in either dev-server or production-build mode, with
// the compat plugin either enabled or disabled, and returns the fixture's
// window.__testResult as captured by a headless browser. See EVALS.md.
//
// Usage: node scripts/eval-fixture.mjs <fixtureDir> <dev|build> <0|1>

import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , fixtureDirArg, mode, compatArg] = process.argv;

if (!fixtureDirArg || !["dev", "build"].includes(mode) || !["0", "1"].includes(compatArg)) {
  console.error(
    "Usage: node scripts/eval-fixture.mjs <fixtureDir> <dev|build> <0|1>"
  );
  process.exit(2);
}

const fixtureDir = path.resolve(__dirname, "..", "fixtures", fixtureDirArg);
process.env.COMPAT = compatArg;

async function collectResultFromPage(url) {
  const browser = await chromium.launch();
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    await page.goto(url, { waitUntil: "load" });
    // Opt-in convention for fixtures that need a real pointer interaction
    // to reach the code path under test (e.g. fixture 12-react-draggable:
    // the crash/fix only manifests on an actual mousedown+mousemove+mouseup
    // sequence, not merely on mount) — a real Playwright-driven drag,
    // since a page-side synthetic `dispatchEvent` sequence was tried first
    // and did not reliably reach every listener the library attaches.
    // A no-op for every other fixture (none of them render this attribute).
    const dragTarget = await page.$("[data-drag-target]");
    if (dragTarget) {
      const box = await dragTarget.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 5 });
        await page.mouse.up();
      }
    }
    let result;
    try {
      // Fixtures initialize window.__testResult to the string "pending"
      // and only ever replace it with the final result OBJECT once the
      // real (possibly async) assertion has run — checking for "an object"
      // rather than "any truthy value" matters: an early placeholder
      // *object* would otherwise satisfy a truthy check immediately on
      // page load, resolving this wait before the real result exists.
      await page.waitForFunction(
        () => typeof window.__testResult === "object" && window.__testResult !== null,
        { timeout: 5000 }
      );
    } catch {
      // fall through: read whatever is there, or timed-out marker below
    }
    result = await page.evaluate(() => window.__testResult ?? null);
    if (!result || typeof result !== "object") {
      result = { ok: false, error: "window.__testResult was never set (timeout)" };
    }
    return { result, consoleErrors, pageErrors };
  } finally {
    await browser.close();
  }
}

async function runDev() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: fixtureDir,
    configFile: path.join(fixtureDir, "vite.config.js"),
    server: { port: 0, strictPort: false },
    logLevel: "error",
  });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://localhost:${address.port}/`;
  try {
    return await collectResultFromPage(url);
  } finally {
    await server.close();
  }
}

async function runBuild() {
  const { build, preview } = await import("vite");
  try {
    await build({
      root: fixtureDir,
      configFile: path.join(fixtureDir, "vite.config.js"),
      build: { outDir: "dist-eval", emptyOutDir: true },
      logLevel: "error",
    });
  } catch (err) {
    // A build-time failure is itself a valid captured result for baseline
    // runs (see EVALS.md note on dev-vs-build failure-mode differences).
    return {
      result: { ok: false, error: `vite build threw: ${err.message}` },
      consoleErrors: [],
      pageErrors: [],
      buildFailed: true,
    };
  }

  const previewServer = await preview({
    root: fixtureDir,
    configFile: path.join(fixtureDir, "vite.config.js"),
    build: { outDir: "dist-eval" },
    preview: { port: 0, strictPort: false },
    logLevel: "error",
  });
  const address = previewServer.httpServer.address();
  const url = `http://localhost:${address.port}/`;
  try {
    return await collectResultFromPage(url);
  } finally {
    await new Promise((resolve) => previewServer.httpServer.close(resolve));
  }
}

const outcome = mode === "dev" ? await runDev() : await runBuild();
console.log(JSON.stringify(outcome, null, 2));

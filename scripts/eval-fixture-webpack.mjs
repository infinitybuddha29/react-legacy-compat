#!/usr/bin/env node
// webpack 5 counterpart of eval-fixture.mjs (see that file's header comment
// for the Vite version). Compiles one fixture app with webpack, serves the
// output statically, and returns the fixture's window.__testResult as
// captured by a headless browser.
//
// "dev" / "build" here map to webpack's `mode: "development"` /
// `mode: "production"` — unlike Vite, webpack has no separate dev-server
// resolution path distinct from its production bundling (no esbuild-style
// pre-bundling optimizer to diverge from Rollup/Rolldown's own resolution,
// per ARCHITECTURE.md's "Webpack support" section), so this dimension
// mainly exercises minification/mode-dependent codegen, not a materially
// different resolution code path. Still run both, for the same "don't
// claim more than what's asserted" reason EVALS.md states for Vite.
//
// The browser-polling logic below is intentionally duplicated from
// eval-fixture.mjs rather than factored into a shared module, to avoid
// touching that already-verified Vite harness while adding this one.
//
// Usage: node scripts/eval-fixture-webpack.mjs <fixtureDir> <dev|build> <0|1>

import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import webpack from "webpack";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , fixtureDirArg, mode, compatArg] = process.argv;

if (!fixtureDirArg || !["dev", "build"].includes(mode) || !["0", "1"].includes(compatArg)) {
  console.error(
    "Usage: node scripts/eval-fixture-webpack.mjs <fixtureDir> <dev|build> <0|1>"
  );
  process.exit(2);
}

const fixtureDir = path.resolve(__dirname, "..", "fixtures", fixtureDirArg);
process.env.COMPAT = compatArg;
const webpackMode = mode === "dev" ? "development" : "production";

const MIME_TYPES = { ".html": "text/html", ".js": "text/javascript" };

function serveStatic(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = req.url === "/" ? "/index.html" : req.url;
      const filePath = path.join(dir, reqPath);
      fs.readFile(filePath, (err, body) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
        });
        res.end(body);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

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
    let result;
    try {
      // See eval-fixture.mjs for why this checks "is an object", not
      // "is truthy" — fixtures set window.__testResult = "pending" first.
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

async function compile(config) {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stats);
    });
  });
}

const configPath = path.join(fixtureDir, "webpack.config.js");
const { default: configFactory } = await import(pathToFileURL(configPath).href);
const config = configFactory(webpackMode);

let stats;
try {
  stats = await compile(config);
} catch (err) {
  // A compile-time crash is itself a valid captured result (mirrors
  // eval-fixture.mjs's `vite build threw` handling).
  console.log(
    JSON.stringify(
      {
        result: { ok: false, error: `webpack compile threw: ${err.message}` },
        consoleErrors: [],
        pageErrors: [],
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (stats.hasErrors()) {
  console.log(
    JSON.stringify(
      {
        result: {
          ok: false,
          error: `webpack compilation errors: ${stats.toString({ errorDetails: true, all: false, errors: true })}`,
        },
        consoleErrors: [],
        pageErrors: [],
      },
      null,
      2
    )
  );
  process.exit(0);
}

fs.copyFileSync(
  path.join(fixtureDir, "index.html"),
  path.join(config.output.path, "index.html")
);

const server = await serveStatic(config.output.path);
const { port } = server.address();
const url = `http://127.0.0.1:${port}/`;
try {
  const outcome = await collectResultFromPage(url);
  console.log(JSON.stringify(outcome, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}

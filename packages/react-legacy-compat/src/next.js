import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOADER_PATH = path.join(__dirname, "next-loader.cjs");

/**
 * Matches a react-dom package entry file: the project's own
 * `node_modules/react-dom/index.js` (Pages Router) and Next's vendored
 * `next/dist/compiled/react-dom/index.js` / `react-dom-experimental/index.js`
 * (App Router). Not `react-dom/client.js`, `server.js`, etc.
 */
export const REACT_DOM_ENTRY = /[\\/]react-dom(?:-experimental)?[\\/]index\.js$/;
const TURBOPACK_REACT_DOM_ENTRY = "**/{react-dom,react-dom-experimental}/index.js";

/**
 * Next.js integration: wraps a Next config so that every react-dom entry
 * module gets a `findDOMNode` export, under both Turbopack (the default
 * since Next 16) and `next --webpack`.
 *
 * Why not the `resolve.alias` approach used by the Vite and webpack
 * plugins: Next resolves `react-dom` differently per compilation layer
 * (its own vendored copy for App Router client code, a separate SSR
 * entry for server rendering, the project's installed copy for Pages
 * Router — see next/dist/build/create-compiler-aliases.js). Aliasing
 * `react-dom` to one generated shim would bypass that and load a second
 * copy of React DOM next to the one Next itself uses. Instead, a loader
 * (./next-loader.cjs) patches whichever react-dom entry file Next already
 * picked, so there is still exactly one react-dom per layer.
 *
 * Accepts a config object or a config function (`(phase, ctx) => config`,
 * sync or async), like other `withX` Next config wrappers.
 */
export function withReactLegacyCompat(nextConfig = {}) {
  if (typeof nextConfig === "function") {
    return async (...args) => applyCompat(await nextConfig(...args));
  }
  return applyCompat(nextConfig);
}

function applyCompat(config) {
  const userWebpack = config.webpack;
  const turbopack = config.turbopack ?? {};

  return {
    ...config,
    turbopack: {
      ...turbopack,
      rules: {
        ...turbopack.rules,
        // A glob key containing "/" matches the full project-relative path
        // (Next's turbopack docs). Used instead of `condition: { path }`,
        // which only exists since Next 16, so this also works on Next 15.
        [TURBOPACK_REACT_DOM_ENTRY]: { loaders: [LOADER_PATH] },
      },
    },
    webpack(webpackConfig, context) {
      webpackConfig.module.rules.push({
        test: REACT_DOM_ENTRY,
        use: [{ loader: LOADER_PATH }],
      });
      return typeof userWebpack === "function"
        ? userWebpack(webpackConfig, context)
        : webpackConfig;
    },
  };
}

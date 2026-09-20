import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactLegacyCompatWebpack } from "react-legacy-compat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// COMPAT=1 enables the plugin under test; unset/0 reproduces the vanilla
// React 19 failure. Controlled by the eval harness, not meant to be set
// by hand. Mirrors the same convention as the Vite fixtures'
// vite.config.js.
const compatEnabled = process.env.COMPAT === "1";

// Exported as a factory, called directly by
// scripts/eval-fixture-webpack.mjs with "development" or "production" —
// not consumed via webpack-cli, so there's no argv/env convention to
// match; this is the simplest shape for the harness to call.
export default function config(mode) {
  return {
    mode,
    context: __dirname,
    entry: "./src/main.jsx",
    output: {
      path: path.join(__dirname, "dist-eval"),
      filename: "main.js",
      clean: true,
    },
    resolve: { extensions: [".js", ".jsx"] },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              // development: false pinned explicitly so the automatic JSX
              // runtime's react/jsx-dev-runtime vs react/jsx-runtime choice
              // doesn't depend on webpack's mode — this fixture is testing
              // module resolution, not Babel's dev/prod JSX split.
              presets: [["@babel/preset-react", { development: false }]],
            },
          },
        },
      ],
    },
    plugins: [...(compatEnabled ? [reactLegacyCompatWebpack()] : [])],
    devtool: false,
  };
}

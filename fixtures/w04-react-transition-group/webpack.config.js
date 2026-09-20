import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactLegacyCompatWebpack } from "react-legacy-compat";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compatEnabled = process.env.COMPAT === "1";

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

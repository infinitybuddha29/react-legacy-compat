import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactLegacyCompat } from "react-legacy-compat";

const compatEnabled = process.env.COMPAT === "1";

export default defineConfig({
  plugins: [
    react(),
    ...(compatEnabled ? [reactLegacyCompat()] : []),
  ],
  logLevel: "warn",
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { reactLegacyCompat } from "react-legacy-compat";

// COMPAT=1 enables the plugin under test; unset/0 reproduces the vanilla
// React 19 failure. Controlled by the eval harness, not meant to be set
// by hand.
const compatEnabled = process.env.COMPAT === "1";

export default defineConfig({
  plugins: [react(), ...(compatEnabled ? [reactLegacyCompat()] : [])],
  logLevel: "warn",
});

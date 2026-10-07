import { withReactLegacyCompat } from "react-legacy-compat/next";

const nextConfig = {};

export default process.env.COMPAT === "1"
  ? withReactLegacyCompat(nextConfig)
  : nextConfig;

import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default config;

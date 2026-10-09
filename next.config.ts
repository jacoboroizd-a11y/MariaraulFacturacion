import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingIncludes: {
    "/api/pdf/**/*": ["./public/brand/mariaraul.png"],
  },
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default config;

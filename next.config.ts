import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.100.205.146"],
  outputFileTracingRoot: appDir,
  turbopack: {
    root: appDir,
  },
  // @resvg/resvg-js ships a platform-specific .node binding that Turbopack
  // can't bundle into the server output. Mark it external so Node's require()
  // resolves the binary at runtime from node_modules.
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;

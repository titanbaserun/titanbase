import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@titanbase/core",
    "@titanbase/editor",
    "@titanbase/ui",
    "@titanbase/export-postgres",
    "@titanbase/export-mermaid",
    "@titanbase/export-prisma",
    "@titanbase/export-drizzle",
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@titanbase/core", "@titanbase/editor", "@titanbase/ui", "@titanbase/export-postgres"],
};

export default nextConfig;

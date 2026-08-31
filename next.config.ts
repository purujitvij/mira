import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // db/schema.sql is read at runtime by src/lib/db.ts; make sure Vercel bundles it with the functions.
  outputFileTracingIncludes: { "/**": ["./db/**"] },
};

export default nextConfig;

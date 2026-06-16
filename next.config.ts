import type { NextConfig } from "next";

/** Paths that should not trigger dev recompiles (Excel exports, PDFs, Supabase temp). */
const DEV_WATCH_IGNORE = [
  "**/exports_*.xlsx",
  "**/*Bidfood*.pdf",
  "**/Testdata*.pdf",
  "**/supabase/.temp/**",
  "**/.cursor/**",
];

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) {
      const prev = config.watchOptions?.ignored;
      const prevList = Array.isArray(prev) ? prev : prev ? [prev] : [];
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [...prevList, ...DEV_WATCH_IGNORE],
      };
    }
    return config;
  },
};

export default nextConfig;

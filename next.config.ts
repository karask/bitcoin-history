import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "true";
const basePath = githubPages ? "/bitcoin-history" : "";

const nextConfig: NextConfig = {
  ...(githubPages ? { output: "export" as const } : {}),
  assetPrefix: basePath,
  // Vinext's prerenderer follows concrete paths, while GitHub Pages serves the
  // emitted .html files as clean URLs without requiring directory redirects.
  trailingSlash: false,
  images: { unoptimized: githubPages },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;

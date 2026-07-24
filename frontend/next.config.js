/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  // Keep the development cache separate from production builds. Running
  // `next build` while `next dev` is open must not replace the manifests and
  // CSS chunks currently served by the dev server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

module.exports = nextConfig;

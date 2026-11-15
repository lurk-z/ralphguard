/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  // Keep the development cache separate from production builds. Running
  // `next build` while `next dev` is open must not replace the manifests and
  // CSS chunks currently served by the dev server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // Retired pages. Old bookmarks still land somewhere useful instead of a 404.
  async redirects() {
    return [
      { source: "/register", destination: "/login", permanent: false },
      { source: "/forgot-password", destination: "/login", permanent: false },
      { source: "/settings", destination: "/projects", permanent: false },
      { source: "/projects/new", destination: "/projects", permanent: false },
      { source: "/history", destination: "/projects", permanent: false },
      { source: "/skin-viewer", destination: "/assess", permanent: false },
      { source: "/models", destination: "/", permanent: false },
      { source: "/herbs", destination: "/projects", permanent: false },
      { source: "/how-to", destination: "/", permanent: false },
      { source: "/methodology", destination: "/", permanent: false },
      { source: "/about", destination: "/", permanent: false },
      { source: "/projects/:id/results", destination: "/assess?projectId=:id", permanent: false },
    ];
  },
};

module.exports = nextConfig;

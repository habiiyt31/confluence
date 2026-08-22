/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Explicit so Turbopack doesn't have to guess: this app's root is
  // this directory (frontend/), not the parent confluence/ folder --
  // even though confluence/ also has its own package.json (root
  // convenience scripts only, no real dependencies) which can produce
  // its own package-lock.json if `npm install` is ever run there.
  // Without this, Turbopack sees two lockfiles and warns it inferred
  // the wrong workspace root.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;

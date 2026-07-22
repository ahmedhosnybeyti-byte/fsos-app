/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Production Docker deploy (Railway) needs the minimal self-contained
  // ".next/standalone" server output — otherwise the image would need the
  // full node_modules tree (including devDependencies-adjacent build
  // tooling) copied in at runtime. Doesn't affect `pnpm dev`/local `next
  // start` at all. See Dockerfile.web / docs/DEPLOYMENT.md.
  output: "standalone",
  // Internal workspace packages ship TS source directly (no build step) —
  // Next transpiles them itself rather than expecting compiled JS.
  transpilePackages: ["@field-sales-os/schemas"],
  // July 2026: user reported navigation between dashboard pages feeling very
  // slow in `pnpm dev`. lucide-react and the Radix packages each re-export
  // hundreds of modules from one barrel file; without this, every route that
  // imports even one icon/primitive drags the whole package's module graph
  // into that route's dev compile, which is the classic cause of slow
  // per-route compilation/HMR in `next dev` (this app has 20+ dashboard
  // routes, most importing several icons). This tells Next to rewrite those
  // imports to their individual source files instead, both in dev and in
  // the production build. See PROJECT_LOG.md.
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-dialog"],
  },
};

export default nextConfig;

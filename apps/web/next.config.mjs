/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Internal workspace packages ship TS source directly (no build step) —
  // Next transpiles them itself rather than expecting compiled JS.
  transpilePackages: ["@field-sales-os/schemas"],
};

export default nextConfig;

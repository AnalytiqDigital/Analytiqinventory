/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The validation package publishes CommonJS for Node consumers; Next bundles
  // the TypeScript source directly so the browser gets an ESM build.
  transpilePackages: ['@analytiq/validation'],
};

export default nextConfig;

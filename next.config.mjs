/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow redirecting the build output dir (e.g. to /tmp) to avoid file-sync
  // races on synced folders like ~/Desktop. Vercel uses the default `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // NOTE: env vars (ML_SERVICE_URL, OPENAI_API_KEY, DATABASE_URL) are read at
  // RUNTIME from process.env in the API routes. Do NOT inject defaults here —
  // baking values at build time prevents Vercel env vars from taking effect.
};

export default nextConfig;

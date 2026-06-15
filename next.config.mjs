/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

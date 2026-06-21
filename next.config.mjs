/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework version.
  poweredByHeader: false,
  // Strip console.* in production builds (keep warn/error for diagnostics).
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  // Allow redirecting the build output dir (e.g. to /tmp) to avoid file-sync
  // races on synced folders like ~/Desktop. Vercel uses the default `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
  // NOTE: env vars (ML_SERVICE_URL, OPENAI_API_KEY, DATABASE_URL) are read at
  // RUNTIME from process.env in the API routes. Do NOT inject defaults here —
  // baking values at build time prevents Vercel env vars from taking effect.
  async headers() {
    const securityHeaders = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    ];
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;

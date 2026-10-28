/** @type {import('next').NextConfig} */
// Allow production builds to use a separate output directory while `next dev` is open.
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];

    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
    }

    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
export default nextConfig;

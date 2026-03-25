import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../'),
  transpilePackages: ['lodash-es'],
  eslint: {
    // Linting is handled at the monorepo root via `npm run lint`.
    // next build should not duplicate it (root .eslintrc.js paths don't
    // resolve correctly when ESLint runs from inside the frontend/ directory).
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

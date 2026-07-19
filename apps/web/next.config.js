const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: 'http://152.42.215.193:4000/api/:path*',
        },
      ],
    };
  },
};

module.exports = withSentryConfig(
  nextConfig,
  {
    // Suppresses source map uploading logs during bundling and prevents blocking build when tokens are missing
    silent: true,
    org: 'dataforge-ai',
    project: 'web',
  },
  {
    // Hides source maps from public requests
    hideSourceMaps: true,
    disableLogger: true,
  }
);

const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

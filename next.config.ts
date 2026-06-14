import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite'],
  turbopack: {
    resolveAlias: {
      kysely: './lib/vendor/kysely-next.js',
    },
  },
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias.kysely = path.resolve(__dirname, 'lib/vendor/kysely-next.js');
    return config;
  },
};

export default nextConfig;

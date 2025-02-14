// frontend/next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ];
  },
  webpack: (config) => {
    // Modify existing TypeScript rule or add a new one
    config.module.rules.push({
      test: /\.ts$/,
      use: [
        {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            configFile: path.resolve(__dirname, './tsconfig.json'),
          },
        },
      ],
      exclude: /node_modules/,
    });

    // Add resolver for TypeChain imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@typechain': path.resolve(__dirname, '../typechain'),
    };

    // Ensure proper resolution of TypeScript files
    config.resolve.extensions = [...config.resolve.extensions, '.ts', '.tsx'];

    return config;
  },
}

module.exports = nextConfig;
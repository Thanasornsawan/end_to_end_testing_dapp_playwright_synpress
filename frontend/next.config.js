// frontend/next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Add TypeScript loader for TypeChain files
    config.module.rules.push({
      test: /\.ts$/,
      include: [
        path.resolve(__dirname, '../typechain')
      ],
      use: [
        {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      ],
    });

    // Add resolver for TypeChain imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@typechain': path.resolve(__dirname, '../typechain'),
    };

    return config;
  },
}

module.exports = nextConfig;
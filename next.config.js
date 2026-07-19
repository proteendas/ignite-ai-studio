/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'chromadb', 'pdf-parse', 'mammoth'],
  },
};

module.exports = nextConfig;

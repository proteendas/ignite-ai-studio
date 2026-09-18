/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // `pg` is listed so Next does not try to bundle its optional native
    // accelerator (pg-native); the rest carry dynamic requires that webpack
    // cannot statically resolve.
    serverComponentsExternalPackages: ['pg', 'chromadb', 'pdf-parse', 'mammoth'],
  },
};

module.exports = nextConfig;

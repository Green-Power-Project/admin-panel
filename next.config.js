/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Allow larger multipart bodies (catalogue PDF uploads). Server Actions default is 1mb; route
  // handlers also respect this in many Next.js setups.
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Improve chunk loading reliability
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Increase timeout for chunk loading in development
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
      // Faster builds in development
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
      };
    }
    return config;
  },
  // Add error handling for chunk loading
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Do NOT add path aliases like @/components here — optimizePackageImports only applies to
  // specific node_modules packages. Wrong entries cause webpack to emit require("./undefined").
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Compress output
  compress: true,
};

module.exports = nextConfig;


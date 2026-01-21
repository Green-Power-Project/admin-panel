/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
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
  // Enable prefetching for better navigation performance
  experimental: {
    optimizePackageImports: ['@/components', '@/contexts', 'firebase/firestore', 'firebase/auth'],
  },
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Compress output
  compress: true,
};

module.exports = nextConfig;


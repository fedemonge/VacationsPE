/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  webpack: (config) => {
    // Fix for Windows webpack cache corruption
    config.cache = {
      type: "filesystem",
      buildDependencies: {
        config: [__filename],
      },
      compression: false,
    };
    return config;
  },
};

module.exports = nextConfig;

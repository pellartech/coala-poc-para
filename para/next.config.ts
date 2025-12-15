import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer, webpack }) => {
    // Ignore React Native and Node.js-only modules in the browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };

      // Ignore optional dependencies that don't work in browser
      config.resolve.alias = {
        ...config.resolve.alias,
        "@react-native-async-storage/async-storage": false,
        "pino-pretty": false,
        "@safe-global/safe-apps-provider": false,
        "@safe-global/safe-apps-sdk": false,
        porto: false,
        "porto/internal": false,
      };

      // Ignore porto module completely using webpack.IgnorePlugin
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^porto$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^porto\/internal$/,
        })
      );
    }

    return config;
  },
};

export default nextConfig;

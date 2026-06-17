import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      new URL("https://cdn.dummyjson.com/**"),
      new URL("https://i.dummyjson.com/**"),
    ],
    qualities: [75],
  },
};

export default nextConfig;

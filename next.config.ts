import type { NextConfig } from "next";

const publicAssetBaseUrl = String(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "").trim();
const publicAssetHostname = (() => {
  if (!publicAssetBaseUrl) return "";
  try {
    return new URL(publicAssetBaseUrl).hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      },
      ...(publicAssetHostname
        ? [{
          protocol: "https" as const,
          hostname: publicAssetHostname,
        }]
        : []),
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

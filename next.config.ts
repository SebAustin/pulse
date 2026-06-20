import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the AWS SDK out of the bundle; load it as a native Node module in
  // Route Handlers / Server Actions (it requires the Node.js runtime, not edge).
  serverExternalPackages: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/util-dynamodb",
  ],
  async headers() {
    // Baseline hardening headers. A nonce-based CSP is layered in by the
    // security pass; these apply to every route.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

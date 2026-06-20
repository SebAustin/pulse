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
    // Content-Security-Policy (F-11). script-src allows 'unsafe-inline' because
    // the Next.js App Router emits inline bootstrap/RSC-streaming scripts; a
    // nonce-based policy would force every page into dynamic rendering (Next only
    // stamps nonces on dynamically rendered pages), sacrificing the static
    // performance the landing/audience views depend on. There is no
    // dangerouslySetInnerHTML anywhere and React escapes all interpolated text,
    // so the residual inline-script XSS surface is negligible; the remaining
    // directives still constrain script origins and data exfiltration.
    // 'unsafe-eval' is added only in development (Turbopack/HMR).
    const scriptSrc =
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'";
    const csp = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join("; ");

    return [
      // -----------------------------------------------------------------------
      // Baseline headers — all routes
      // -----------------------------------------------------------------------
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // frame-ancestors in CSP supersedes X-Frame-Options, but keep both
          // for older browsers that do not parse CSP.
          { key: "X-Frame-Options", value: "DENY" },
          // Default referrer policy for all routes: send origin only on
          // same-origin and cross-origin HTTPS, strip entirely on downgrade.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: csp },
          // F-11: HSTS — instruct browsers to always use HTTPS.
          // max-age=63072000 = 2 years.  includeSubDomains + preload allow
          // submission to the HSTS preload list.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      // -----------------------------------------------------------------------
      // F-01: Stronger referrer suppression on host console routes.
      //
      // The host console URL embeds the raw hostToken in the path
      // (/host/[eventId]/[hostToken]).  This is the "capability URL" pattern
      // — the unguessable token IS the credential; we accept it in the path
      // for usability but must not let it leak via the Referer header to any
      // third-party asset (analytics, fonts, CDN) loaded by the page.
      //
      // Overriding with no-referrer on /host/* routes ensures the browser
      // sends no Referer header on any sub-request originating from those
      // pages, whether the resource is same-origin or cross-origin.
      //
      // API calls from the host console still carry the token only via the
      // x-pulse-host-token request header (see src/lib/api/client.ts), so
      // the Referer suppression here is a defence-in-depth layer, not the
      // only protection.
      // -----------------------------------------------------------------------
      {
        source: "/host/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;

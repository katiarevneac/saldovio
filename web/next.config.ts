import type { NextConfig } from "next";

// CSP is report-only in this story (improvements.md S04.14) — no
// directive here can break production rendering (Recharts,
// foreignObject tick labels in ForecastChartLine) since nothing is
// blocked yet, only reported. Enforcement mode is a future story once
// report data confirms the allowlist is complete.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Matches finance-api's own CSV upload cap exactly (main.ts's
      // useBodyParser('json', { limit: '5mb' }) and
      // transactions.controller.ts's MAX_UPLOAD_BYTES) — Server
      // Actions default to a 1MB body limit, which previewImportAction
      // would hit on any real statement file well before Finance API's
      // own limit ever applied.
      bodySizeLimit: "5mb",
      // Next.js already rejects a Server Action request whose Origin
      // header doesn't match the app's own host by default (confirmed
      // via context7's data-security.mdx) — this option is additive,
      // for the case where a reverse proxy sits in front (Epic 12 S3's
      // Vercel/Render deploy) and the app's externally-visible origin
      // differs from what Next.js sees internally. Left empty until S3
      // actually deploys and the real production hostname is known;
      // documented here so it isn't forgotten (improvements.md S04.13).
      allowedOrigins:
        process.env.WEB_PUBLIC_ORIGIN !== undefined
          ? [process.env.WEB_PUBLIC_ORIGIN]
          : undefined,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;

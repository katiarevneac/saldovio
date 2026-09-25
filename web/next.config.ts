import type { NextConfig } from "next";

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
};

export default nextConfig;

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
    },
  },
};

export default nextConfig;

// Local dev only — becomes env vars once this ever deploys
// somewhere other than localhost.
export const FINANCE_API_URL = "http://localhost:3000";
export const ANALYTICS_SERVICE_URL = "http://localhost:8000";
export const ANALYTICS_API_SECRET = process.env.ANALYTICS_API_SECRET ?? "";

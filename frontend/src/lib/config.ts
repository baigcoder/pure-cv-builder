const LOCAL_API_URL = "http://localhost:8000";
const PRODUCTION_API_URL = "https://pure-cv-builder-production-80b6.up.railway.app";
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
const configuredApiUrlIsLocal =
  configuredApiUrl?.includes("localhost") || configuredApiUrl?.includes("127.0.0.1");

export const API_URL =
  process.env.NODE_ENV === "production"
    ? configuredApiUrl && !configuredApiUrlIsLocal
      ? configuredApiUrl
      : PRODUCTION_API_URL
    : configuredApiUrl || LOCAL_API_URL;

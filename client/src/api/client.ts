import axios from "axios";

/**
 * Pre-configured Axios instance. `baseURL: "/api"` is served by the Vite dev
 * proxy (see vite.config.ts) to the backend at http://localhost:3000.
 */
export const client = axios.create({
  baseURL: "/api",
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

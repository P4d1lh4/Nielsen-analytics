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

// Attach the Clerk session token to every request. Clerk populates `window.Clerk`
// once ClerkProvider mounts; the audit UI only renders inside <SignedIn>, so a
// session exists by the time these requests fire.
type ClerkGlobal = { Clerk?: { session?: { getToken(): Promise<string | null> } } };
client.interceptors.request.use(async (config) => {
  const token = await (window as unknown as ClerkGlobal).Clerk?.session?.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

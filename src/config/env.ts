/**
 * Fail-fast env validation. Call once at process boot with the vars that process
 * genuinely can't run without, so misconfig surfaces immediately instead of on
 * the first request/job. Empty string counts as missing.
 */
export function requireEnv(names: string[], env: NodeJS.ProcessEnv = process.env): void {
  const missing = names.filter((n) => !env[n]);
  if (missing.length > 0) {
    throw new Error(`Missing required env var(s): ${missing.join(", ")}`);
  }
}

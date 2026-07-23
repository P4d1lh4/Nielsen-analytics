import { lookup } from "node:dns/promises";

/** Raised when a URL must not be navigated to (SSRF guard). */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/**
 * True for IPv4/IPv6 addresses that must never be reachable from an audit
 * target: loopback, private (RFC1918), link-local (incl. cloud metadata
 * 169.254.169.254), CGNAT, ULA, unspecified. Malformed input is treated as
 * unsafe (fail closed).
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) -> test the embedded IPv4.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return isPrivateIp(mapped[1]!);

  if (ip.includes(".")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return true; // 0.0.0.0/8 unspecified
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local (incl. metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    return false;
  }

  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true; // loopback / unspecified
  if (v6.startsWith("fe80")) return true; // link-local fe80::/10
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // ULA fc00::/7
  return false;
}

/**
 * Throws BlockedUrlError unless `url` is http(s) and every resolved address is
 * public. Call before every navigation.
 *
 * ponytail: pre-navigation DNS check. Residual DNS-rebinding risk (host could
 * re-resolve to a private IP between this check and the browser's own lookup);
 * upgrade path = intercept at the Chromium request level or route the worker
 * through an egress proxy enforcing the same policy.
 */
export async function assertPublicUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BlockedUrlError(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BlockedUrlError(`Blocked URL scheme '${parsed.protocol}' (only http/https allowed)`);
  }

  const host = parsed.hostname;
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError(`Could not resolve host: ${host}`);
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new BlockedUrlError(
        `Blocked navigation to private/internal address (${host} -> ${address})`,
      );
    }
  }
}

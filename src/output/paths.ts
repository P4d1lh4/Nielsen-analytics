import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/** Converts a target URL into a filesystem-safe slug (hostname + path). */
export function slugifyTarget(targetUrl: string): string {
  try {
    const url = new URL(targetUrl);
    const slug = `${url.hostname}${url.pathname}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "target";
  } catch {
    return "target";
  }
}

/** Sortable, filesystem-safe timestamp: `YYYY-MM-DD_HH-mm-ss`. */
export function timestampSlug(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/**
 * Creates (recursively) and returns the absolute output directory for a session:
 * `<root>/<timestamp>_<target>/`.
 */
export function createOutputDir(targetUrl: string, root = ".ux-audit-reports"): string {
  const dir = resolve(
    process.cwd(),
    root,
    `${timestampSlug()}_${slugifyTarget(targetUrl)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Creates (recursively) and returns an isolated, deterministic output directory
 * keyed by a queue job id: `<root>/job_<id>/`. Used by the async worker so each
 * job's artifacts live in their own folder.
 */
export function createJobOutputDir(jobId: string, root = ".ux-audit-reports"): string {
  const dir = resolve(process.cwd(), root, `job_${jobId}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Dependency-free logger. Pretty ANSI for local/TTY use; one JSON line per
 * record when LOG_JSON=1 or NODE_ENV=production (parseable by log aggregators,
 * with timestamp + level). Same API in both modes — no call-site changes.
 *
 * ponytail: job_id/request_id still ride inside `msg` (callers interpolate them).
 * Promote them to structured fields via child loggers when correlation across
 * concurrent jobs actually needs querying — not before.
 */

type Params = Record<string, unknown>;
type Level = "info" | "step" | "success" | "warn" | "error";

const JSON_MODE = process.env.LOG_JSON === "1" || process.env.NODE_ENV === "production";

const c = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};

/** Structured JSON record (prod mode). Exported for testing. */
export function formatJson(level: Level, message: string, fields?: Params): string {
  return JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...fields });
}

function out(level: Level, line: string): void {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info(message: string): void {
    out("info", JSON_MODE ? formatJson("info", message) : `${c.cyan}i${c.reset} ${message}`);
  },
  step(index: number, total: number, name: string, params: Params): void {
    out(
      "step",
      JSON_MODE
        ? formatJson("step", name, { index, total, params })
        : `${c.blue}>${c.reset} [${index}/${total}] ${name} ${c.dim}${JSON.stringify(params)}${c.reset}`,
    );
  },
  success(message: string): void {
    out("success", JSON_MODE ? formatJson("success", message) : `${c.green}OK${c.reset} ${message}`);
  },
  warn(message: string): void {
    out("warn", JSON_MODE ? formatJson("warn", message) : `${c.yellow}!${c.reset} ${message}`);
  },
  error(message: string): void {
    out("error", JSON_MODE ? formatJson("error", message) : `${c.red}x${c.reset} ${message}`);
  },
};

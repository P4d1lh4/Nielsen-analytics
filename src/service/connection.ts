import { Redis, type RedisOptions } from "ioredis";
import { logger } from "../logger";

/** Redis endpoint. Override with REDIS_URL (e.g. redis://127.0.0.1:6379). */
export const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const parsed = new URL(REDIS_URL);

/**
 * Connection options handed to BullMQ. We pass OPTIONS (not a pre-built client)
 * so BullMQ creates and error-handles its own connections — avoiding raw
 * unhandled-error spam from internally duplicated clients.
 */
export const redisConnectionOptions: RedisOptions = {
  host: parsed.hostname,
  port: Number(parsed.port || "6379"),
  ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
  ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
  maxRetriesPerRequest: null, // required by BullMQ
  retryStrategy: (times) => Math.min(times * 250, 3000),
};

/** Returns a wrapper that runs `fn` at most once per `ms` (de-spams reconnect storms). */
export function throttle(ms: number): (fn: () => void) => void {
  let last = 0;
  return (fn) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn();
    }
  };
}

// A dedicated lightweight client, used only for readiness + clear outage logging.
const health = new Redis(redisConnectionOptions);
const logDown = throttle(5000);
health.on("ready", () => logger.success(`[redis] connected (${parsed.host})`));
health.on("error", (err: NodeJS.ErrnoException) => {
  logDown(() => {
    const hint = err.code === "ECONNREFUSED" ? ` — is Redis running at ${REDIS_URL}?` : "";
    logger.error(`[redis] ${err.message}${hint}`);
  });
});

/** True only when Redis can serve commands right now (used to fail fast with 503). */
export function isRedisReady(): boolean {
  return health.status === "ready";
}

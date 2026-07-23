import { Queue } from "bullmq";
import { redisConnectionOptions, throttle } from "./connection";
import { AUDIT_QUEUE_NAME, type AuditJobData } from "./schema";
import type { AuditReport } from "../evaluator/report";
import { logger } from "../logger";

/** The audit job queue. BullMQ owns the producer connection (created from options). */
export const auditQueue = new Queue<AuditJobData, AuditReport>(AUDIT_QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    // Retry transient failures (Redis/S3 blip, LLM rate-limit, flaky nav) with
    // exponential backoff. ponytail: deterministic failures (blocked SSRF URL,
    // bad selector) still burn all 3 attempts — throw UnrecoverableError from the
    // worker to skip retries for those if the wasted browser launches ever matter.
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 1000 }, // keep recent results queryable
    removeOnFail: { age: 24 * 3600 },
  },
});

// Surface (throttled) connection errors instead of letting them crash/spam.
const logErr = throttle(5000);
auditQueue.on("error", (err) => logErr(() => logger.error(`[queue] ${(err as Error).message}`)));

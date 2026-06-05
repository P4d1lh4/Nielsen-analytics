import { z } from "zod";
import { flowActionSchema } from "../config/schema";

/** Shared queue name (kept here, side-effect-free, so both queue.ts and worker.ts can import it). */
export const AUDIT_QUEUE_NAME = "audit";

/**
 * Strict validation for `POST /api/audit`. Reuses the Phase 1 `flowActionSchema`
 * (discriminated union: goto | click | type | wait) instead of redefining it.
 */
export const auditRequestSchema = z.object({
  target_url: z.string().url("`target_url` must be a valid absolute URL"),
  flow: z.array(flowActionSchema).min(1, "`flow` must contain at least one action"),
  viewport: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
});

/** Data carried by an audit job (request body + the authenticated owner). */
export type AuditJobData = z.infer<typeof auditRequestSchema> & { user_id: string };

// The job RESULT type is the real audit report — see `AuditReport` in
// `../evaluator/report`. The worker now returns the parsed `audit-report.json`.

// Strict typings mirroring the backend contract (Zod schema + Prisma models).

// ---------- Request payload (POST /api/audit) ----------

/** A single interaction in the audit flow (discriminated union on `action`). */
export type FlowAction =
  | { action: "goto"; url: string }
  | { action: "click"; selector: string }
  | { action: "type"; selector: string; text: string }
  | { action: "wait"; ms: number };

export interface Viewport {
  width: number;
  height: number;
}

export interface AuditRequest {
  target_url: string;
  flow: FlowAction[];
  viewport?: Viewport;
}

// ---------- Status (strict union) ----------

export type AuditStatus = "queued" | "processing" | "completed" | "failed";

/** Nielsen severity: 1 = cosmetic … 4 = catastrophe. */
export type Severity = 1 | 2 | 3 | 4;

// ---------- Persisted report (AuditReport -> AuditStep -> Violation) ----------

export interface Violation {
  id: string;
  step_id: string;
  heuristic: string;
  severity: Severity;
  issue_description: string;
  code_fix: string;
}

export interface AuditStep {
  id: string;
  report_id: string;
  step_name: string;
  screenshot_url: string;
  violations: Violation[];
}

export interface AuditReport {
  id: string;
  job_id: string;
  target_url: string;
  created_at: string; // ISO timestamp (JSON-serialized DateTime)
  total_violations: number;
  steps: AuditStep[];
}

// ---------- API responses ----------

/** Response of POST /api/audit (HTTP 202). */
export interface SubmitAuditResponse {
  job_id: string;
  status: Extract<AuditStatus, "queued">;
}

/**
 * Normalized result of GET /api/audit/:id. The backend returns the bare
 * `AuditReport` when completed; the service wraps it into this discriminated
 * union so the UI always switches on a strict `status`.
 */
export type AuditResult =
  | { status: Extract<AuditStatus, "processing"> }
  | { status: Extract<AuditStatus, "failed">; reason: string | null }
  | { status: Extract<AuditStatus, "completed">; report: AuditReport };

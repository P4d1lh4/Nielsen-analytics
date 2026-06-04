import axios from "axios";
import { client } from "./client";
import type { AuditRequest, AuditResult, AuditReport, SubmitAuditResponse } from "./types";

/** POST /api/audit — enqueues an audit and returns the job id. */
export async function submitAudit(payload: AuditRequest): Promise<string> {
  try {
    const { data } = await client.post<SubmitAuditResponse>("/audit", payload);
    return data.job_id;
  } catch (error) {
    throw toClearError(error, "Failed to submit audit");
  }
}

/**
 * GET /api/audit/:id — fetches the job status / report.
 * Normalizes the response into a strict {@link AuditResult} discriminated union.
 * Throws a clear error on 404 (or any other failure).
 */
export async function getAuditResult(id: string): Promise<AuditResult> {
  try {
    const { data } = await client.get<unknown>(`/audit/${id}`);

    // Completed jobs return the bare AuditReport (no top-level `status`).
    if (data && typeof data === "object" && "status" in data) {
      const status = (data as { status: string }).status;
      if (status === "processing") {
        return { status: "processing" };
      }
      if (status === "failed") {
        return { status: "failed", reason: (data as { reason?: string | null }).reason ?? null };
      }
    }
    return { status: "completed", report: data as AuditReport };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new Error(`Audit job "${id}" not found.`);
    }
    throw toClearError(error, `Failed to fetch audit "${id}"`);
  }
}

/** Builds a clear Error, preferring the backend's `{ error: "..." }` message. */
function toClearError(error: unknown, context: string): Error {
  if (axios.isAxiosError(error)) {
    const detail =
      (error.response?.data as { error?: string } | undefined)?.error ?? error.message;
    const status = error.response?.status;
    return new Error(`${context}${status ? ` (HTTP ${status})` : ""}: ${detail}`);
  }
  return new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}

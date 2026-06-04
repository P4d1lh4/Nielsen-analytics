import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_MODEL, type StepResult } from "./evaluator";
import type { StepAudit } from "./auditSchema";
import { logger } from "../logger";

export interface AuditReport {
  generated_at: string;
  model: string;
  total_steps: number;
  analyzed_steps: number;
  failed_steps: number;
  total_violations: number;
  /** Strict per-step format ({ step_name, violations[] }) for successfully analyzed steps. */
  results: StepAudit[];
  /** Steps that could not be analyzed. */
  errors: { step_name: string; error: string }[];
}

/** Writes `audit-report.json` to the report directory and returns its path. */
export function writeReport(reportDir: string, results: StepResult[], model: string = AUDIT_MODEL): string {
  const analyzed = results.filter((r) => r.audit);
  const failed = results.filter((r) => r.error);

  const report: AuditReport = {
    generated_at: new Date().toISOString(),
    model,
    total_steps: results.length,
    analyzed_steps: analyzed.length,
    failed_steps: failed.length,
    total_violations: analyzed.reduce((n, r) => n + r.audit!.violations.length, 0),
    results: analyzed.map((r) => r.audit!),
    errors: failed.map((r) => ({ step_name: r.step_name, error: r.error! })),
  };

  const path = join(reportDir, "audit-report.json");
  writeFileSync(path, JSON.stringify(report, null, 2), "utf8");
  return path;
}

/** Prints a per-step violation summary (counts by Nielsen severity) to the terminal. */
export function printSummary(results: StepResult[]): void {
  for (const r of results) {
    if (r.error) {
      logger.error(`${r.step_name}: ${r.error}`);
      continue;
    }
    const violations = r.audit!.violations;
    if (violations.length === 0) {
      logger.success(`${r.step_name}: no violations`);
      continue;
    }
    const bySeverity: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const v of violations) bySeverity[v.severity]++;
    logger.warn(
      `${r.step_name}: ${violations.length} violation(s) ` +
        `[catastrophe:${bySeverity[4]} major:${bySeverity[3]} minor:${bySeverity[2]} cosmetic:${bySeverity[1]}]`,
    );
  }
}

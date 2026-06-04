import "dotenv/config";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { redisConnectionOptions, throttle } from "./connection";
import { AUDIT_QUEUE_NAME, type AuditJobData } from "./schema";
import { uploadScreenshot } from "./storage";
import { logger } from "../logger";

// --- Core pipeline pieces (Phases 1 & 2) reused from the CLI. Phase 3 (HTML) is gone. ---
import type { AuditConfig } from "../config/schema";
import { createJobOutputDir } from "../output/paths";
import { AuditEngine } from "../engine/browser";
import { readManifest } from "../evaluator/manifest";
import { stepName } from "../evaluator/payload";
import { Evaluator, runAnalysis, AUDIT_MODEL } from "../evaluator/evaluator";
import { AgentSdkEvaluator } from "../evaluator/agentEngine";
import { createClient } from "../evaluator/client";
import { writeReport, type AuditReport } from "../evaluator/report";

// Max 2 jobs at once (each spins a real browser + LLM).
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);
// Hard wall-clock cap per job so a stuck browser/LLM can't run forever.
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 180_000);
const ENGINE = (process.env.AUDIT_ENGINE ?? "agent-sdk") === "api" ? "api" : "agent-sdk";
const MODEL = process.env.AUDIT_MODEL ?? AUDIT_MODEL;
const DEFAULT_VIEWPORT = { width: 1366, height: 768 };

const prisma = new PrismaClient();

/** Rejects after `ms`, while swallowing a late rejection from the loser. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Runs the real audit (Phase 1 capture + Phase 2 AI), uploads each screenshot to
 * S3, and persists the report + steps + violations to Postgres in one transaction.
 * Returns the parsed `audit-report.json`. Throws on any failure.
 */
async function runAuditPipeline(job: Job<AuditJobData, AuditReport>, reportDir: string): Promise<AuditReport> {
  const jobId = String(job.id);
  const config: AuditConfig = {
    target_url: job.data.target_url,
    viewport: job.data.viewport ?? DEFAULT_VIEWPORT,
    flow: job.data.flow,
  };

  // --- Phase 1: headless capture ---
  const capture = await new AuditEngine(config, reportDir).run();
  if (capture.failed) {
    throw new Error(
      `Capture failed at step ${capture.failedAt?.step}/${capture.totalSteps}: ` +
        `${capture.failedAt?.error ?? "unknown"}`,
    );
  }

  // --- Phase 2: AI evaluation -> audit-report.json ---
  const entries = readManifest(reportDir);
  if (entries.length === 0) throw new Error("No steps captured — nothing to analyze");
  const analyzer =
    ENGINE === "agent-sdk"
      ? new AgentSdkEvaluator(reportDir, MODEL)
      : new Evaluator(createClient(), reportDir, MODEL);
  const results = await runAnalysis(analyzer, entries);
  writeReport(reportDir, results, MODEL);
  const failures = results.filter((r) => r.error);
  if (failures.length > 0) {
    throw new Error(`Analysis failed on ${failures.length}/${results.length} step(s): ${failures[0]?.error}`);
  }
  const report = JSON.parse(readFileSync(join(reportDir, "audit-report.json"), "utf8")) as AuditReport;

  // --- Upload each step's screenshot to S3 and build the relational step records ---
  const auditByName = new Map(results.map((r) => [r.step_name, r]));
  const steps = [];
  for (const entry of entries) {
    const name = stepName(entry);
    const file = entry.artifacts.screenshot; // e.g. step_01_click.png
    const screenshot_url = await uploadScreenshot(join(reportDir, file), `reports/job_${jobId}/${file}`);
    const violations = auditByName.get(name)?.audit?.violations ?? [];
    steps.push({ step_name: name, screenshot_url, violations });
  }

  // --- Persist the whole report in a single transaction. Idempotent per job_id:
  // remove any prior report for this job_id first (e.g. a re-run, or a BullMQ id
  // reused after the queue was drained) so the unique(job_id) never collides. ---
  const total_violations = steps.reduce((n, s) => n + s.violations.length, 0);
  await prisma.$transaction([
    prisma.auditReport.deleteMany({ where: { job_id: jobId } }),
    prisma.auditReport.create({
      data: {
        job_id: jobId,
        target_url: config.target_url,
        total_violations,
        steps: {
          create: steps.map((s) => ({
            step_name: s.step_name,
            screenshot_url: s.screenshot_url,
            violations: {
              create: s.violations.map((v) => ({
                heuristic: v.heuristic,
                severity: v.severity,
                issue_description: v.issue_description,
                code_fix: v.suggested_code_fix,
              })),
            },
          })),
        },
      },
    }),
  ]);

  return report;
}

const worker = new Worker<AuditJobData, AuditReport>(
  AUDIT_QUEUE_NAME,
  async (job): Promise<AuditReport> => {
    const reportDir = createJobOutputDir(String(job.id));
    logger.info(
      `Job ${job.id} started — ${job.data.target_url} (${job.data.flow.length} step(s)) ` +
        `[engine: ${ENGINE}, model: ${MODEL}]`,
    );
    try {
      // All Playwright + AI + S3 + DB work is bounded and guarded here.
      const report = await withTimeout(runAuditPipeline(job, reportDir), JOB_TIMEOUT_MS, `Job ${job.id}`);
      logger.success(
        `Job ${job.id} persisted — ${report.total_violations} violation(s) across ${report.analyzed_steps} step(s)`,
      );
      return report;
    } catch (error) {
      // Log, then RE-THROW so BullMQ records the failure + stack trace. Process stays up.
      logger.error(`Job ${job.id} failed: ${(error as Error).message}`);
      throw error;
    } finally {
      // EPHEMERAL: always wipe the job workspace — the worker disk must not retain
      // artifacts. Best-effort: retry transient locks (Windows/OneDrive/AV) and never
      // let a cleanup error override the job's actual success/failure.
      try {
        rmSync(reportDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        logger.info(`Job ${job.id} workspace removed: ${reportDir}`);
      } catch (cleanupError) {
        logger.warn(`Job ${job.id} workspace cleanup failed (not failing the job): ${(cleanupError as Error).message}`);
      }
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: CONCURRENCY,
    lockDuration: JOB_TIMEOUT_MS + 30_000,
  },
);

const logErr = throttle(5000);
worker.on("ready", () => logger.success(`Worker ready — concurrency ${CONCURRENCY}, waiting for jobs`));
worker.on("active", (job) => logger.info(`Job ${job.id} active`));
worker.on("completed", (job) => logger.success(`Job ${job.id} completed`));
worker.on("failed", (job, err) => logger.error(`Job ${job?.id ?? "?"} failed: ${err.message}`));
worker.on("error", (err) => logErr(() => logger.error(`Worker error: ${err.message}`)));

async function shutdown(signal: string): Promise<void> {
  logger.warn(`Received ${signal} — closing worker...`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

logger.info("Worker process starting...");

import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { Webhook } from "svix";
import { PrismaClient } from "@prisma/client";
import { auditQueue } from "./queue";
import { auditRequestSchema } from "./schema";
import { deleteJobArtifacts, presignReportScreenshots } from "./storage";
import { isRedisReady } from "./connection";
import { requireEnv } from "../config/env";
import { logger } from "../logger";

// Fail fast on missing config instead of 500-ing on the first request.
requireEnv(["DATABASE_URL", "CLERK_SECRET_KEY"]);

const PORT = Number(process.env.PORT ?? 3000);

// Read side queries the DB (the worker is the write side).
const prisma = new PrismaClient();

/** Builds the Express app (exported for testing without binding a port). */
export function createServer() {
  const app = express();

  // Security headers on every response.
  app.use(helmet());
  // CORS: explicit allowlist from CORS_ORIGIN (comma-separated). Unset -> no
  // cross-origin access (safe default; the dev client uses the Vite proxy).
  const corsOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : false, credentials: true }));

  // Clerk webhook — MUST be registered BEFORE express.json(): svix verifies the
  // RAW request body, which a JSON parser would destroy. Public (svix-signed).
  app.post(
    "/api/webhook/clerk",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const secret = process.env.CLERK_WEBHOOK_SECRET;
      if (!secret) {
        logger.error("CLERK_WEBHOOK_SECRET is not set — cannot verify webhook");
        return res.status(500).json({ error: "Webhook not configured" });
      }

      const svixId = req.headers["svix-id"];
      const svixTimestamp = req.headers["svix-timestamp"];
      const svixSignature = req.headers["svix-signature"];
      if (!svixId || !svixTimestamp || !svixSignature) {
        return res.status(400).json({ error: "Missing Svix headers" });
      }

      let evt: { type: string; data: { id: string } };
      try {
        const wh = new Webhook(secret);
        evt = wh.verify(req.body, {
          "svix-id": String(svixId),
          "svix-timestamp": String(svixTimestamp),
          "svix-signature": String(svixSignature),
        }) as { type: string; data: { id: string } };
      } catch (err) {
        logger.warn(`Clerk webhook signature invalid: ${(err as Error).message}`);
        return res.status(400).json({ error: "Invalid signature" });
      }

      if (evt.type === "user.deleted") {
        const userId = evt.data.id;
        try {
          // 1) every job owned by the deleted user
          const reports = await prisma.auditReport.findMany({
            where: { user_id: userId },
            select: { job_id: true },
          });
          // 2) wipe the physical artifacts (screenshots) per job in S3/MinIO
          await Promise.all(reports.map((r) => deleteJobArtifacts(r.job_id)));
          // 3) wipe the relational data (cascades to steps + violations)
          await prisma.auditReport.deleteMany({ where: { user_id: userId } });
          // (No UserAccount table in this schema — user_id is a plain column.)
          logger.success(
            `Clerk user.deleted: purged ${reports.length} report(s) + artifacts for user ${userId}`,
          );
        } catch (err) {
          logger.error(`Failed to purge data for user ${userId}: ${(err as Error).message}`);
          // 5xx -> Clerk retries; the purge is idempotent.
          return res.status(500).json({ error: "Purge failed" });
        }
      }

      return res.status(200).json({ received: true });
    },
  );

  app.use(express.json({ limit: "1mb" }));
  // Attach Clerk auth context to every request (reads CLERK_* from env).
  app.use(clerkMiddleware());

  // Liveness + Redis readiness (public).
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", redis: isRedisReady() ? "ready" : "down" });
  });

  // Enqueue an audit job — returns 202 immediately, does not wait for completion.
  app.post("/api/audit", async (req: Request, res: Response) => {
    const userId = getAuth(req).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = auditRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid payload",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    if (!isRedisReady()) {
      return res.status(503).json({ error: "Queue unavailable — is Redis running?" });
    }

    try {
      // Thread the authenticated owner into the job payload; the worker persists it.
      const job = await auditQueue.add("audit", { ...parsed.data, user_id: userId });
      return res.status(202).json({ job_id: job.id, status: "queued" });
    } catch (error) {
      logger.error(`Failed to enqueue job: ${(error as Error).message}`);
      return res.status(503).json({ error: "Failed to enqueue job — is Redis running?" });
    }
  });

  // List recent audits (DB only) — lean projection for the history view.
  app.get("/api/audit", async (req: Request, res: Response) => {
    const userId = getAuth(req).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const history = await prisma.auditReport.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
        select: {
          job_id: true,
          target_url: true,
          created_at: true,
          total_violations: true,
        },
      });
      return res.json(history);
    } catch (error) {
      logger.error(`Failed to list audits: ${(error as Error).message}`);
      return res.status(503).json({ error: "Failed to list audit history" });
    }
  });

  // Status by job id. The BullMQ job is the source of truth for STATE; the
  // persisted Prisma report is the source of truth for completed RESULTS.
  app.get("/api/audit/:id", async (req: Request, res: Response) => {
    const userId = getAuth(req).userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ error: "Missing job id" });
    }
    if (!isRedisReady()) {
      return res.status(503).json({ error: "Queue unavailable — is Redis running?" });
    }

    try {
      const job = await auditQueue.getJob(id);
      if (!job) {
        // Completed jobs are evicted from the queue after a while — fall back to
        // the persisted report so the history view can still open old audits.
        const report = await prisma.auditReport.findFirst({
          where: { job_id: id, user_id: userId },
          include: { steps: { include: { violations: true } } },
        });
        if (report) {
          await presignReportScreenshots(report.steps);
          return res.json(report);
        }
        return res.status(404).json({ error: `Job ${id} not found` });
      }

      // Ownership: a job that exists but isn't the caller's is treated as not-found
      // (prevents leaking state / failedReason across tenants for in-flight jobs).
      if (job.data.user_id !== userId) {
        return res.status(404).json({ error: `Job ${id} not found` });
      }
      const state = await job.getState();

      if (state === "completed") {
        // Pull the structured report from the DB (NOT from the BullMQ return value).
        const report = await prisma.auditReport.findFirst({
          where: { job_id: id, user_id: userId },
          include: { steps: { include: { violations: true } } },
        });
        if (!report) {
          return res.status(404).json({ status: "completed", error: "Report not found in database" });
        }
        await presignReportScreenshots(report.steps);
        return res.json(report);
      }

      if (state === "failed") {
        return res.json({ status: "failed", reason: job.failedReason });
      }

      // waiting | active | delayed | prioritized | ... -> still in flight.
      return res.json({ status: "processing" });
    } catch (error) {
      logger.error(`Failed to read job ${id}: ${(error as Error).message}`);
      return res.status(503).json({ error: "Failed to read job" });
    }
  });

  app.use((_req: Request, res: Response) => res.status(404).json({ error: "Not found" }));

  // Error middleware: malformed JSON body -> 400, everything else -> 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Malformed JSON body" });
    }
    logger.error(`Unhandled error: ${(err as Error).message}`);
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

const server = createServer().listen(PORT, () => {
  logger.success(`API listening on http://localhost:${PORT}`);
  logger.info("POST /api/audit  ·  GET /api/audit  ·  GET /api/audit/:id  ·  GET /health");
});

// Graceful shutdown: stop accepting connections, drain in-flight requests, then
// release the Prisma pool — symmetric to the worker.
async function shutdown(signal: string): Promise<void> {
  logger.warn(`Received ${signal} — closing HTTP server...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

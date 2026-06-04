import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { auditQueue } from "./queue";
import { auditRequestSchema } from "./schema";
import { REDIS_URL, isRedisReady } from "./connection";
import { logger } from "../logger";

const PORT = Number(process.env.PORT ?? 3000);

// Read side queries the DB (the worker is the write side).
const prisma = new PrismaClient();

/** Builds the Express app (exported for testing without binding a port). */
export function createServer() {
  const app = express();
  app.use(express.json());

  // Liveness + Redis readiness.
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", redis: isRedisReady() ? "ready" : "down", redis_url: REDIS_URL });
  });

  // Enqueue an audit job — returns 202 immediately, does not wait for completion.
  app.post("/api/audit", async (req: Request, res: Response) => {
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
      const job = await auditQueue.add("audit", parsed.data);
      return res.status(202).json({ job_id: job.id, status: "queued" });
    } catch (error) {
      logger.error(`Failed to enqueue job: ${(error as Error).message}`);
      return res.status(503).json({ error: "Failed to enqueue job — is Redis running?" });
    }
  });

  // Status by job id. The BullMQ job is the source of truth for STATE; the
  // persisted Prisma report is the source of truth for completed RESULTS.
  app.get("/api/audit/:id", async (req: Request, res: Response) => {
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
        return res.status(404).json({ error: `Job ${id} not found` });
      }
      const state = await job.getState();

      if (state === "completed") {
        // Pull the structured report from the DB (NOT from the BullMQ return value).
        const report = await prisma.auditReport.findUnique({
          where: { job_id: id },
          include: { steps: { include: { violations: true } } },
        });
        if (!report) {
          return res.status(404).json({ status: "completed", error: "Report not found in database" });
        }
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

createServer().listen(PORT, () => {
  logger.success(`API listening on http://localhost:${PORT}`);
  logger.info("POST /api/audit  ·  GET /api/audit/:id  ·  GET /health");
});

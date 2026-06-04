import { resolve } from "node:path";
import { Command } from "commander";
import { loadConfig, ConfigError } from "./config/loader";
import { createOutputDir } from "./output/paths";
import { AuditEngine } from "./engine/browser";
import { readManifest, ManifestError } from "./evaluator/manifest";
import { createClient, MissingApiKeyError } from "./evaluator/client";
import { Evaluator, runAnalysis, AUDIT_MODEL } from "./evaluator/evaluator";
import { AgentSdkEvaluator } from "./evaluator/agentEngine";
import { writeReport, printSummary } from "./evaluator/report";
import { writeDashboard, DashboardError } from "./dashboard/generator";
import { logger } from "./logger";

/** Builds the commander program with the `run` command wired up. */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("ux-audit")
    .description(
      "Heuristic UI QA & audit CLI — capture page state per step (run) and audit it with a multimodal LLM (analyze).",
    )
    .version("0.2.0")
    .showHelpAfterError();

  program
    .command("run")
    .description("Run a YAML-defined flow and capture artifacts after every step")
    .requiredOption("-c, --config <path>", "Path to the YAML flow configuration file")
    .option("-o, --out <dir>", "Root output directory", ".ux-audit-reports")
    .action(async (opts: { config: string; out: string }) => {
      try {
        const config = loadConfig(opts.config);
        const outputDir = createOutputDir(config.target_url, opts.out);
        logger.info(`Session output: ${outputDir}`);

        const result = await new AuditEngine(config, outputDir).run();

        if (result.failed) {
          logger.error(
            `Audit stopped at step ${result.failedAt?.step}/${result.totalSteps}. ` +
              `Captured ${result.completedSteps} step(s).`,
          );
          logger.info(`Partial manifest: ${outputDir}\\session-manifest.json`);
          process.exitCode = 1;
          return;
        }

        logger.success(
          `Audit complete. Captured ${result.completedSteps}/${result.totalSteps} step(s).`,
        );
        logger.info(`Manifest: ${outputDir}\\session-manifest.json`);
      } catch (error) {
        if (error instanceof ConfigError) {
          logger.error(error.message);
        } else {
          logger.error(`Unexpected error: ${(error as Error).message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command("analyze")
    .description("Analyze a captured session with a multimodal LLM and emit a heuristic audit report (Phase 2)")
    .requiredOption("-r, --report-dir <dir>", "Path to a session report directory containing session-manifest.json")
    .option(
      "-e, --engine <engine>",
      "LLM engine: 'agent-sdk' (uses your Claude plan; requires Claude Code login) or 'api' (pay-per-token, needs AI_API_KEY)",
      "agent-sdk",
    )
    .option("-m, --model <id>", "Model id (e.g. claude-sonnet-4-6, claude-opus-4-8)", AUDIT_MODEL)
    .action(async (opts: { reportDir: string; engine: string; model: string }) => {
      const engine = opts.engine;
      if (engine !== "api" && engine !== "agent-sdk") {
        logger.error(`Unknown engine '${engine}'. Use 'agent-sdk' or 'api'.`);
        process.exitCode = 1;
        return;
      }
      try {
        const reportDir = resolve(process.cwd(), opts.reportDir);
        const entries = readManifest(reportDir);
        if (entries.length === 0) {
          logger.warn("Manifest is empty — nothing to analyze.");
          return;
        }
        logger.info(
          `Analyzing ${entries.length} step(s) from ${reportDir} [engine: ${engine}, model: ${opts.model}]`,
        );

        const analyzer =
          engine === "agent-sdk"
            ? new AgentSdkEvaluator(reportDir, opts.model)
            : new Evaluator(createClient(), reportDir, opts.model);
        const results = await runAnalysis(analyzer, entries);

        const reportPath = writeReport(reportDir, results, opts.model);
        printSummary(results);

        const failed = results.filter((r) => r.error).length;
        const totalViolations = results.reduce((n, r) => n + (r.audit?.violations.length ?? 0), 0);
        logger.success(
          `Analysis complete: ${results.length - failed}/${results.length} step(s) analyzed, ${totalViolations} violation(s).`,
        );
        logger.info(`Report: ${reportPath}`);

        if (failed > 0) {
          logger.error(`${failed} step(s) failed to analyze.`);
          process.exitCode = 1;
        }
      } catch (error) {
        if (error instanceof ManifestError || error instanceof MissingApiKeyError) {
          logger.error(error.message);
        } else {
          logger.error(`Unexpected error: ${(error as Error).message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command("report")
    .description("Generate a single-file interactive HTML dashboard from an audit report (Phase 3)")
    .requiredOption("-r, --report-dir <dir>", "Path to a session report directory")
    .action((opts: { reportDir: string }) => {
      try {
        const reportDir = resolve(process.cwd(), opts.reportDir);
        const dashboardPath = writeDashboard(reportDir);
        logger.success(`Dashboard written: ${dashboardPath}`);
        logger.info("Open it in a browser — screenshots load relatively from the same folder.");
      } catch (error) {
        if (error instanceof DashboardError || error instanceof ManifestError) {
          logger.error(error.message);
        } else {
          logger.error(`Unexpected error: ${(error as Error).message}`);
        }
        process.exitCode = 1;
      }
    });

  program
    .command("pipeline")
    .description("Run capture → analyze → dashboard end-to-end from a YAML config (Phases 1→2→3)")
    .requiredOption("-c, --config <path>", "Path to the YAML flow configuration file")
    .option("-o, --out <dir>", "Root output directory", ".ux-audit-reports")
    .option(
      "-e, --engine <engine>",
      "Analyze engine: 'agent-sdk' (Claude plan) or 'api' (pay-per-token, needs AI_API_KEY)",
      "agent-sdk",
    )
    .option("-m, --model <id>", "Analyze model id", AUDIT_MODEL)
    .action(async (opts: { config: string; out: string; engine: string; model: string }) => {
      const engine = opts.engine;
      if (engine !== "api" && engine !== "agent-sdk") {
        logger.error(`Unknown engine '${engine}'. Use 'agent-sdk' or 'api'.`);
        process.exitCode = 1;
        return;
      }
      try {
        // --- Phase 1: capture (abort immediately if Playwright fails) ---
        const config = loadConfig(opts.config);
        const reportDir = createOutputDir(config.target_url, opts.out);
        logger.info(`[1/3] Capture -> ${reportDir}`);
        const capture = await new AuditEngine(config, reportDir).run();
        if (capture.failed) {
          logger.error(
            `[1/3] Capture failed at step ${capture.failedAt?.step}/${capture.totalSteps}: ` +
              `${capture.failedAt?.error ?? "unknown"}. Aborting pipeline.`,
          );
          process.exitCode = 1;
          return;
        }
        logger.success(`[1/3] Captured ${capture.completedSteps}/${capture.totalSteps} step(s).`);

        // --- Phase 2: analyze (abort if the LLM fails/times out on any step) ---
        const entries = readManifest(reportDir);
        if (entries.length === 0) {
          logger.error("[2/3] No steps captured — nothing to analyze. Aborting pipeline.");
          process.exitCode = 1;
          return;
        }
        logger.info(`[2/3] Analyze ${entries.length} step(s) [engine: ${engine}, model: ${opts.model}]`);
        const analyzer =
          engine === "agent-sdk"
            ? new AgentSdkEvaluator(reportDir, opts.model)
            : new Evaluator(createClient(), reportDir, opts.model);
        const results = await runAnalysis(analyzer, entries);
        const reportPath = writeReport(reportDir, results, opts.model);
        const failed = results.filter((r) => r.error).length;
        if (failed > 0) {
          logger.error(
            `[2/3] ${failed}/${results.length} step(s) failed during analysis. ` +
              `Aborting before dashboard (partial report: ${reportPath}).`,
          );
          process.exitCode = 1;
          return;
        }
        const totalViolations = results.reduce((n, r) => n + (r.audit?.violations.length ?? 0), 0);
        logger.success(`[2/3] Analyzed ${results.length} step(s), ${totalViolations} violation(s).`);

        // --- Phase 3: dashboard ---
        logger.info("[3/3] Dashboard");
        const dashboardPath = writeDashboard(reportDir);
        logger.success(`[3/3] Dashboard: ${dashboardPath}`);
        logger.success(`Pipeline complete -> ${reportDir}`);
      } catch (error) {
        if (
          error instanceof ConfigError ||
          error instanceof ManifestError ||
          error instanceof MissingApiKeyError ||
          error instanceof DashboardError
        ) {
          logger.error(error.message);
        } else {
          logger.error(`Unexpected error: ${(error as Error).message}`);
        }
        process.exitCode = 1;
      }
    });

  return program;
}

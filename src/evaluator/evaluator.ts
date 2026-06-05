import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { stepAuditSchema, type StepAudit } from "./auditSchema";
import { SYSTEM_PROMPT } from "./prompt";
import { buildStepContent, stepName } from "./payload";
import type { ManifestEntry } from "./manifest";
import { logger } from "../logger";

// Default model: Sonnet 4.6. The user explicitly chose it so audits run on the
// Claude plan and draw from the separate "Weekly Sonnet" allowance rather than
// the general weekly limit. Override per run with `analyze --model <id>`.
export const AUDIT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16_000;

export interface StepResult {
  step: number;
  step_name: string;
  audit?: StepAudit;
  error?: string;
}

/** Anything that can audit one captured step. Implemented by both engines. */
export interface StepAnalyzer {
  analyzeStep(entry: ManifestEntry): Promise<StepResult>;
}

// Max concurrent step analyses. Each is an independent LLM request, so a few run
// in parallel to cut wall-clock on long flows. Lower to 1 if the agent-sdk engine
// stalls under load (AI_CONCURRENCY env).
const AI_CONCURRENCY = Number(process.env.AI_CONCURRENCY ?? 3);

/** Runs an analyzer over every step with bounded concurrency, logging progress. Shared by both engines. */
export async function runAnalysis(
  analyzer: StepAnalyzer,
  entries: ManifestEntry[],
): Promise<StepResult[]> {
  const total = entries.length;
  const results: StepResult[] = new Array(total);
  let next = 0;

  async function consume(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= total) return;
      const entry = entries[i]!;
      logger.step(i + 1, total, `analyze:${entry.action}`, { step: entry.step });
      const result = await analyzer.analyzeStep(entry); // analyzeStep never throws
      if (result.error) {
        logger.error(`Step ${entry.step} analysis failed: ${result.error}`);
      } else {
        logger.success(`Step ${entry.step}: ${result.audit!.violations.length} violation(s) found`);
      }
      results[i] = result;
    }
  }

  const lanes = Math.max(1, Math.min(AI_CONCURRENCY, total || 1));
  await Promise.all(Array.from({ length: lanes }, () => consume()));
  return results;
}

/**
 * Consumes Phase 1 artifacts and produces a structured heuristic audit per step
 * by sending the screenshot + DOM + ARIA tree to a multimodal LLM, forcing the
 * response into {@link stepAuditSchema} via structured outputs.
 */
export class Evaluator implements StepAnalyzer {
  constructor(
    private readonly client: Anthropic,
    private readonly reportDir: string,
    private readonly model: string = AUDIT_MODEL,
  ) {}

  /** Analyzes a single step. Never throws — failures are returned as `error`. */
  async analyzeStep(entry: ManifestEntry): Promise<StepResult> {
    const name = stepName(entry);
    try {
      const content = buildStepContent(this.reportDir, entry);

      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        // `effort` tunes thinking depth; `format` forces the JSON schema.
        output_config: { effort: "high", format: zodOutputFormat(stepAuditSchema) },
        // Frozen system prompt with a cache breakpoint → reused across steps.
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
      });

      if (response.stop_reason === "refusal") {
        return { step: entry.step, step_name: name, error: "Model refused to analyze this step." };
      }

      const audit = response.parsed_output;
      if (!audit) {
        return {
          step: entry.step,
          step_name: name,
          error: `No structured output returned (stop_reason=${response.stop_reason}).`,
        };
      }

      // Trust the manifest's identity for the step name.
      return { step: entry.step, step_name: name, audit: { ...audit, step_name: name } };
    } catch (error) {
      return { step: entry.step, step_name: name, error: normalizeError(error) };
    }
  }

  /** Analyzes every step sequentially. */
  analyze(entries: ManifestEntry[]): Promise<StepResult[]> {
    return runAnalysis(this, entries);
  }
}

function normalizeError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `API error${error.status ? ` ${error.status}` : ""}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

import { query, type SDKUserMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { stepAuditSchema } from "./auditSchema";
import { SYSTEM_PROMPT } from "./prompt";
import { buildStepContent, stepName } from "./payload";
import type { ManifestEntry } from "./manifest";
import { AUDIT_MODEL, type StepAnalyzer, type StepResult, runAnalysis } from "./evaluator";

// Raw JSON Schema for the Agent SDK's `outputFormat` (reuse the one zod generates).
const AUDIT_JSON_SCHEMA = (zodOutputFormat(stepAuditSchema) as unknown as { schema: Record<string, unknown> })
  .schema;

/**
 * Phase 2 engine that routes the audit through the **Claude Agent SDK**
 * (`query()`), so model usage is billed to the user's Claude plan (Agent SDK
 * credit) instead of the pay-per-token API. Requires the machine to be logged
 * into Claude Code; no AI_API_KEY is used.
 *
 * The screenshot + DOM + ARIA are passed inline as a streaming user message
 * (`SDKUserMessage.message` is a standard `MessageParam`), and the response is
 * forced to {@link stepAuditSchema} via `outputFormat` + client-side validation.
 */
export class AgentSdkEvaluator implements StepAnalyzer {
  constructor(
    private readonly reportDir: string,
    private readonly model: string = AUDIT_MODEL,
  ) {}

  async analyzeStep(entry: ManifestEntry): Promise<StepResult> {
    const name = stepName(entry);
    try {
      const content = buildStepContent(this.reportDir, entry);
      const userMessage: SDKUserMessage = {
        type: "user",
        message: { role: "user", content },
        parent_tool_use_id: null,
      };
      async function* promptStream(): AsyncGenerator<SDKUserMessage> {
        yield userMessage;
      }

      const q = query({
        prompt: promptStream(),
        options: {
          model: this.model,
          systemPrompt: SYSTEM_PROMPT,
          thinking: { type: "adaptive" },
          effort: "high",
          outputFormat: { type: "json_schema", schema: AUDIT_JSON_SCHEMA },
          tools: [], // everything is provided inline; the agent needs no tools
          // A few turns of headroom: adaptive thinking + structured-output
          // formatting can span more than one turn even with no tools.
          maxTurns: 8,
          cwd: this.reportDir,
        },
      });

      let result: SDKResultMessage | undefined;
      try {
        for await (const message of q) {
          if (message.type === "result") {
            result = message;
            break;
          }
        }
      } finally {
        q.close();
      }

      if (!result) {
        return { step: entry.step, step_name: name, error: "Agent SDK returned no result message." };
      }
      if (result.subtype !== "success") {
        return { step: entry.step, step_name: name, error: `Agent SDK error: ${result.subtype}` };
      }
      if (result.structured_output == null) {
        return { step: entry.step, step_name: name, error: "Agent SDK returned no structured output." };
      }

      const parsed = stepAuditSchema.safeParse(result.structured_output);
      if (!parsed.success) {
        return {
          step: entry.step,
          step_name: name,
          error: `Structured output failed schema: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        };
      }

      return { step: entry.step, step_name: name, audit: { ...parsed.data, step_name: name } };
    } catch (error) {
      return { step: entry.step, step_name: name, error: error instanceof Error ? error.message : String(error) };
    }
  }

  analyze(entries: ManifestEntry[]): Promise<StepResult[]> {
    return runAnalysis(this, entries);
  }
}

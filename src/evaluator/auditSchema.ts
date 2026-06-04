// Authored with zod/v4 because @anthropic-ai/sdk's `zodOutputFormat` helper
// targets zod v4 internals. Phase 1 schemas remain on the default (v3) import;
// the two are independent and coexist (zod 3.25+ ships both).
import * as z from "zod/v4";

/**
 * The 10 canonical Nielsen usability heuristics, by their exact names.
 * Modeled as an enum so the LLM is structurally forced to return an exact name
 * (satisfying "Nome exato da Heurística de Nielsen violada").
 */
export const NIELSEN_HEURISTICS = [
  "Visibility of system status",
  "Match between the system and the real world",
  "User control and freedom",
  "Consistency and standards",
  "Error prevention",
  "Recognition rather than recall",
  "Flexibility and efficiency of use",
  "Aesthetic and minimalist design",
  "Help users recognize, diagnose, and recover from errors",
  "Help and documentation",
] as const;

export const violationSchema = z.object({
  heuristic: z
    .enum(NIELSEN_HEURISTICS)
    .describe("The exact name of the violated Nielsen heuristic (one of the 10 canonical heuristics)."),
  severity: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .describe("Nielsen severity rating: 1 = cosmetic, 2 = minor, 3 = major, 4 = catastrophe."),
  issue_description: z
    .string()
    .describe(
      "Concise, technical description of the problem. When the issue is accessibility-related, cite the specific WCAG 2.1 success criterion (e.g. 'WCAG 2.1 SC 1.1.1 Non-text Content').",
    ),
  element_selector: z
    .string()
    .nullable()
    .describe("CSS selector of the offending element, or null when it does not apply to a single element."),
  suggested_code_fix: z
    .string()
    .describe("A corrected HTML/CSS snippet or ARIA attribute that resolves the issue."),
});

export const stepAuditSchema = z.object({
  step_name: z.string().describe("The identifier of the analyzed step (echo the value provided in the prompt)."),
  violations: z
    .array(violationSchema)
    .describe("Every violation found in this step. Use an empty array when there are none."),
});

export type Violation = z.infer<typeof violationSchema>;
export type StepAudit = z.infer<typeof stepAuditSchema>;

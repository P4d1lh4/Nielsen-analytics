import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { ManifestEntry } from "./manifest";

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

function mediaTypeFor(file: string): ImageMediaType {
  switch (extname(file).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

/** Stable, human-readable identifier for a step (matches Phase 1 artifact basenames). */
export function stepName(entry: ManifestEntry): string {
  return `step_${String(entry.step).padStart(2, "0")}_${entry.action}`;
}

/**
 * Reads a step's three artifacts and assembles the multimodal user content:
 * a framing instruction, the screenshot (base64 image), the cleaned DOM, and
 * the ARIA accessibility tree. Volatile per-step content only — the stable
 * system prompt is supplied separately so it can be cached.
 */
export function buildStepContent(
  reportDir: string,
  entry: ManifestEntry,
): Anthropic.ContentBlockParam[] {
  const screenshotB64 = readFileSync(join(reportDir, entry.artifacts.screenshot)).toString("base64");
  const dom = readFileSync(join(reportDir, entry.artifacts.dom), "utf8");
  const aria = readFileSync(join(reportDir, entry.artifacts.accessibility), "utf8");
  const name = stepName(entry);

  return [
    {
      type: "text",
      text:
        `Audit the UI state captured after step ${entry.step} ` +
        `(action: "${entry.action}", params: ${JSON.stringify(entry.params)}).\n` +
        `Set "step_name" in your response to exactly: ${name}`,
    },
    {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaTypeFor(entry.artifacts.screenshot),
        data: screenshotB64,
      },
    },
    { type: "text", text: `## Cleaned DOM (HTML)\n\n\`\`\`html\n${dom}\n\`\`\`` },
    { type: "text", text: `## Accessibility Tree (ARIA snapshot, YAML)\n\n\`\`\`yaml\n${aria}\n\`\`\`` },
  ];
}

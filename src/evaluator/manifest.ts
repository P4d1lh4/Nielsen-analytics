import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

/** Raised for any problem reading or validating a Phase 1 session manifest. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

const artifactSchema = z.object({
  screenshot: z.string(),
  accessibility: z.string(),
  dom: z.string(),
});

const manifestEntrySchema = z.object({
  step: z.number().int(),
  action: z.string(),
  params: z.record(z.unknown()),
  status: z.string(),
  timestamp: z.string(),
  artifacts: artifactSchema,
});

export const manifestSchema = z.array(manifestEntrySchema);
export type ManifestEntry = z.infer<typeof manifestEntrySchema>;

/** Reads and strictly validates `session-manifest.json` from a report directory. */
export function readManifest(reportDir: string): ManifestEntry[] {
  const path = join(reportDir, "session-manifest.json");

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new ManifestError(`Could not read manifest: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ManifestError(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }

  const result = manifestSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new ManifestError(`Manifest validation failed for ${path}:\n${issues}`);
  }

  return result.data;
}

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactPaths } from "../capture/artifacts";

/** One successfully executed-and-captured flow step. */
export interface ManifestEntry {
  step: number;
  action: string;
  params: Record<string, unknown>;
  status: "success";
  timestamp: string;
  artifacts: ArtifactPaths;
}

/**
 * Accumulates manifest entries and persists them as `session-manifest.json` at
 * the root of the session folder. The serialized file is a plain JSON ARRAY of
 * executed steps (each with relative artifact paths), ready for a future parser.
 */
export class Manifest {
  private readonly entries: ManifestEntry[] = [];

  constructor(private readonly outputDir: string) {}

  add(entry: ManifestEntry): void {
    this.entries.push(entry);
  }

  get count(): number {
    return this.entries.length;
  }

  /** Writes the manifest array to disk. Safe to call multiple times. */
  write(): void {
    writeFileSync(
      join(this.outputDir, "session-manifest.json"),
      JSON.stringify(this.entries, null, 2),
      "utf8",
    );
  }
}

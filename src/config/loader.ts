import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { configSchema, type AuditConfig } from "./schema";

/** Raised for any user-facing configuration problem (missing file, bad YAML, validation). */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Reads, parses and strictly validates a YAML audit config.
 * Throws {@link ConfigError} with a human-readable message on any failure.
 */
export function loadConfig(configPath: string): AuditConfig {
  const absolutePath = resolve(process.cwd(), configPath);

  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch {
    throw new ConfigError(`Could not read config file: ${absolutePath}`);
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (error) {
    throw new ConfigError(`Invalid YAML in ${absolutePath}: ${(error as Error).message}`);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Config validation failed for ${absolutePath}:\n${issues}`);
  }

  return result.data;
}

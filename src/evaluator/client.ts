import Anthropic from "@anthropic-ai/sdk";

/** Raised when the API key environment variable is missing. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("Environment variable AI_API_KEY is not set. Export your Anthropic API key as AI_API_KEY before running `analyze`.");
    this.name = "MissingApiKeyError";
  }
}

/**
 * Builds the Anthropic client, reading the key from `AI_API_KEY`
 * (rather than the SDK's default `ANTHROPIC_API_KEY`).
 */
export function createClient(): Anthropic {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  return new Anthropic({ apiKey });
}

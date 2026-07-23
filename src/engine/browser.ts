import { chromium, type Browser, type Page } from "playwright";
import type { AuditConfig } from "../config/schema";
import { Manifest } from "../output/manifest";
import { captureArtifacts } from "../capture/artifacts";
import { executeAction, describeAction } from "./actions";
import { assertPublicUrl } from "./urlGuard";
import { logger } from "../logger";

/** Max time a selector-based action may wait before it is treated as a failure. */
const SELECTOR_TIMEOUT_MS = 5_000;
/** Navigation budget for `goto` (page loads legitimately take longer than 5s). */
const NAVIGATION_TIMEOUT_MS = 30_000;

export interface AuditResult {
  outputDir: string;
  completedSteps: number;
  totalSteps: number;
  failed: boolean;
  failedAt?: { step: number; action: string; error: string };
}

/**
 * Drives a headless Chromium session: navigates to `target_url`, runs the flow
 * sequentially, and captures artifacts after each successful step. On any step
 * failure (e.g. a selector not found within {@link SELECTOR_TIMEOUT_MS}) it
 * stops gracefully, persists the partial manifest, and reports the failure.
 */
export class AuditEngine {
  private browser?: Browser;
  private page?: Page;

  constructor(
    private readonly config: AuditConfig,
    private readonly outputDir: string,
  ) {}

  async run(): Promise<AuditResult> {
    const manifest = new Manifest(this.outputDir);
    let failed = false;
    let failedAt: AuditResult["failedAt"];

    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      viewport: { width: this.config.viewport.width, height: this.config.viewport.height },
    });
    this.page = await context.newPage();
    this.page.setDefaultTimeout(SELECTOR_TIMEOUT_MS);
    this.page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    try {
      // Initial load of the application under test.
      logger.info(`Navigating to target: ${this.config.target_url}`);
      await assertPublicUrl(this.config.target_url); // SSRF guard
      await this.page.goto(this.config.target_url, { waitUntil: "domcontentloaded" });

      const total = this.config.flow.length;
      for (let i = 0; i < total; i++) {
        const action = this.config.flow[i]!;
        const step = i + 1;
        const { name, params } = describeAction(action);
        logger.step(step, total, name, params);

        try {
          await executeAction(this.page, action);

          // Capture happens AFTER each step; a capture error is also a failure.
          const basename = `step_${String(step).padStart(2, "0")}_${name}`;
          const artifacts = await captureArtifacts(this.page, this.outputDir, basename);

          manifest.add({
            step,
            action: name,
            params,
            status: "success",
            timestamp: new Date().toISOString(),
            artifacts,
          });
          logger.success(`Step ${step} captured -> ${basename}.{png,a11y.yaml,dom.html}`);
        } catch (error) {
          failed = true;
          failedAt = { step, action: name, error: normalizeError(error) };
          logger.error(`Step ${step} (${name}) failed: ${failedAt.error}`);
          break;
        }
      }
    } finally {
      // Always persist the manifest up to the point reached, then tear down.
      manifest.write();
      await this.close();
    }

    return {
      outputDir: this.outputDir,
      completedSteps: manifest.count,
      totalSteps: this.config.flow.length,
      failed,
      failedAt,
    };
  }

  private async close(): Promise<void> {
    await this.page?.context().close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }
}

/** Trims Playwright's verbose multi-line timeout messages to the first line. */
function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0]!.trim();
}

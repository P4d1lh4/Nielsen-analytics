import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { cleanDomInPage } from "./domCleaner";

/** Relative paths (from the session folder) of the three artifacts per step. */
export interface ArtifactPaths {
  screenshot: string;
  accessibility: string;
  dom: string;
}

/**
 * Captures the full state of the page after a flow step:
 *  1. viewport screenshot (`.png`)
 *  2. accessibility tree (Playwright native `ariaSnapshot`, `.a11y.yaml`)
 *  3. cleaned DOM HTML (`.dom.html`)
 *
 * Returns the relative filenames so they can be recorded in the manifest.
 */
export async function captureArtifacts(
  page: Page,
  outputDir: string,
  basename: string,
): Promise<ArtifactPaths> {
  const screenshot = `${basename}.png`;
  const accessibility = `${basename}.a11y.yaml`;
  const dom = `${basename}.dom.html`;

  // 1. Viewport screenshot (not full-page).
  await page.screenshot({ path: join(outputDir, screenshot), fullPage: false });

  // 2. Accessibility tree — Playwright's native page-level aria snapshot (YAML).
  const ariaSnapshot = await page.ariaSnapshot();
  writeFileSync(join(outputDir, accessibility), `${ariaSnapshot}\n`, "utf8");

  // 3. Cleaned DOM (script/style/link/comments removed) computed in-page.
  const cleanedHtml = await page.evaluate(cleanDomInPage);
  writeFileSync(join(outputDir, dom), cleanedHtml, "utf8");

  return { screenshot, accessibility, dom };
}

import type { Page } from "playwright";
import type { FlowAction } from "../config/schema";

/**
 * Executes a single flow action against the page.
 *
 * Selector-based actions (`click`, `type`) rely on Playwright auto-waiting and
 * are bounded by the page's default timeout (configured in the engine to 5s).
 * `goto` uses the navigation timeout.
 */
export async function executeAction(page: Page, action: FlowAction): Promise<void> {
  switch (action.action) {
    case "goto":
      await page.goto(action.url, { waitUntil: "domcontentloaded" });
      return;
    case "click":
      await page.click(action.selector);
      return;
    case "type":
      // `fill` waits for an editable element, clears it, then sets the value.
      await page.fill(action.selector, action.text);
      return;
    case "wait":
      await page.waitForTimeout(action.ms);
      return;
  }
}

/** Produces a stable name + serializable params for logging and the manifest. */
export function describeAction(action: FlowAction): {
  name: string;
  params: Record<string, unknown>;
} {
  switch (action.action) {
    case "goto":
      return { name: "goto", params: { url: action.url } };
    case "click":
      return { name: "click", params: { selector: action.selector } };
    case "type":
      return { name: "type", params: { selector: action.selector, text: action.text } };
    case "wait":
      return { name: "wait", params: { ms: action.ms } };
  }
}

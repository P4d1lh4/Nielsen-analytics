/**
 * DOM cleaner — executed INSIDE the browser context via `page.evaluate`.
 *
 * Works on a detached deep clone of the live document so the running page is
 * never mutated (subsequent flow steps stay intact). Strips `<script>`,
 * `<style>`, `<link>` elements and all comment nodes, then serializes the
 * result with a leading doctype.
 *
 * NOTE: This function must be fully self-contained (no closures over Node-side
 * variables) because Playwright serializes it and runs it in Chromium.
 */
export function cleanDomInPage(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;

  // Remove noise elements that pollute a downstream HTML parser.
  clone.querySelectorAll("script, style, link").forEach((el) => el.remove());

  // Remove comment nodes via a TreeWalker (works on the detached clone).
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  let current = walker.nextNode();
  while (current) {
    comments.push(current as Comment);
    current = walker.nextNode();
  }
  for (const comment of comments) {
    comment.parentNode?.removeChild(comment);
  }

  return `<!DOCTYPE html>\n${clone.outerHTML}`;
}

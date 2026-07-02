import { test } from "node:test";
import assert from "node:assert/strict";
import { auditRequestSchema } from "./schema";

// Contract of POST /api/audit. Pure schema (no side effects on import),
// so it doubles as the harness smoke test.

test("accepts a minimal valid payload", () => {
  const r = auditRequestSchema.safeParse({
    target_url: "https://example.com",
    flow: [{ action: "goto", url: "https://example.com" }],
  });
  assert.equal(r.success, true);
});

test("rejects a non-URL target_url", () => {
  const r = auditRequestSchema.safeParse({
    target_url: "not-a-url",
    flow: [{ action: "goto", url: "https://example.com" }],
  });
  assert.equal(r.success, false);
});

test("rejects an empty flow", () => {
  const r = auditRequestSchema.safeParse({
    target_url: "https://example.com",
    flow: [],
  });
  assert.equal(r.success, false);
});

test("rejects an unknown flow action", () => {
  const r = auditRequestSchema.safeParse({
    target_url: "https://example.com",
    flow: [{ action: "teleport", url: "https://example.com" }],
  });
  assert.equal(r.success, false);
});

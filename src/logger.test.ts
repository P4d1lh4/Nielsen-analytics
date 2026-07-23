import { test } from "node:test";
import assert from "node:assert/strict";
import { formatJson } from "./logger";

test("formatJson emits parseable JSON with level, msg, ts and extra fields", () => {
  const o = JSON.parse(formatJson("step", "goto", { index: 1, total: 3 }));
  assert.equal(o.level, "step");
  assert.equal(o.msg, "goto");
  assert.equal(o.index, 1);
  assert.equal(o.total, 3);
  assert.ok(typeof o.ts === "string" && o.ts.length > 0);
});

test("formatJson works without extra fields", () => {
  const o = JSON.parse(formatJson("error", "boom"));
  assert.equal(o.level, "error");
  assert.equal(o.msg, "boom");
});

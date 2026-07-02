import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "./report";
import type { StepResult } from "./evaluator";

const results: StepResult[] = [
  { step: 1, step_name: "s1", audit: { step_name: "s1", violations: [{}, {}] } as never },
  { step: 2, step_name: "s2", audit: { step_name: "s2", violations: [{}] } as never },
  { step: 3, step_name: "s3", error: "boom" },
];

test("buildReport counts analyzed, failed and total violations", () => {
  const r = buildReport(results, "model-x");
  assert.equal(r.model, "model-x");
  assert.equal(r.total_steps, 3);
  assert.equal(r.analyzed_steps, 2);
  assert.equal(r.failed_steps, 1);
  assert.equal(r.total_violations, 3);
  assert.equal(r.results.length, 2);
  assert.deepEqual(r.errors, [{ step_name: "s3", error: "boom" }]);
});

test("buildReport handles an all-failed set", () => {
  const r = buildReport([{ step: 1, step_name: "s1", error: "x" }], "m");
  assert.equal(r.analyzed_steps, 0);
  assert.equal(r.total_violations, 0);
});

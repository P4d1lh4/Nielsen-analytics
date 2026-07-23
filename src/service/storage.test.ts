import { test } from "node:test";
import assert from "node:assert/strict";
import { presignReportScreenshots } from "./storage";

test("presignReportScreenshots replaces each stored key with a presigned URL", async () => {
  const steps = [
    { screenshot_url: "reports/job_1/step_01.png" },
    { screenshot_url: "reports/job_1/step_02.png" },
  ];
  await presignReportScreenshots(steps, async (k) => `https://signed.example/${k}?sig=x`);
  assert.equal(steps[0]!.screenshot_url, "https://signed.example/reports/job_1/step_01.png?sig=x");
  assert.equal(steps[1]!.screenshot_url, "https://signed.example/reports/job_1/step_02.png?sig=x");
});

test("presignReportScreenshots is a no-op on empty steps", async () => {
  const steps: { screenshot_url: string }[] = [];
  await presignReportScreenshots(steps, async (k) => k);
  assert.equal(steps.length, 0);
});

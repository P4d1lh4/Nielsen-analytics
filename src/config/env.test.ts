import { test } from "node:test";
import assert from "node:assert/strict";
import { requireEnv } from "./env";

test("requireEnv passes when all vars are present", () => {
  assert.doesNotThrow(() => requireEnv(["A", "B"], { A: "1", B: "2" } as NodeJS.ProcessEnv));
});

test("requireEnv throws listing every missing var", () => {
  assert.throws(
    () => requireEnv(["A", "B", "C"], { A: "1" } as NodeJS.ProcessEnv),
    /B, C/,
  );
});

test("requireEnv treats empty string as missing", () => {
  assert.throws(() => requireEnv(["A"], { A: "" } as NodeJS.ProcessEnv), /A/);
});

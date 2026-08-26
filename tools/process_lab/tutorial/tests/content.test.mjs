import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "src/main.jsx"), "utf8");

test("beginner tour covers the native Prefect sections and safety boundary", () => {
  for (const label of ["Variables", "Blocks", "Work Pools", "Concurrency", "Automations", "Event Feed"]) {
    assert.match(source, new RegExp(`\\[\\"${label}\\"`));
  }
  assert.match(source, /react-joyride/);
  assert.match(source, /does not create accounts/);
  assert.match(source, /pytorch-fit-process-lab demo/);
});

test("fresh run id is converted only into a local Prefect flow-run URL", () => {
  assert.match(source, /encodeURIComponent\(runId\)/);
  assert.match(source, /127\.0\.0\.1:4200/);
});

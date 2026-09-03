import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import test from "node:test";
import { assertDevelopmentRuntime, assertLocalUrl, developmentBrowserOptions } from "../../development/local-access/policy.mjs";

const root = resolve(import.meta.dirname, "../..");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".next")) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx", ".mjs"].includes(extname(path)) ? [path] : [];
  });
}

function importsFrom(directory, forbidden) {
  return sourceFiles(directory).flatMap((path) => {
    const content = readFileSync(path, "utf8");
    return forbidden.some((value) => content.includes(value))
      ? [relative(root, path)]
      : [];
  });
}

test("client and protocol packages never import server implementation", () => {
  assert.deepEqual(importsFrom(join(root, "domains/client"), ["@pytorch-fit/domain-server"]), []);
  assert.deepEqual(importsFrom(join(root, "domains/protocol"), ["@pytorch-fit/domain-server", "@pytorch-fit/domain-client"]), []);
});

test("browser domain code uses Supabase only for authentication", () => {
  const offenders = importsFrom(join(root, "domains/client"), ["@supabase/"])
    .filter((path) => path !== "domains/client/identity/session/create-browser-client.ts");
  assert.deepEqual(offenders, []);
});

test("production packages never import development tooling or dummy identities", () => {
  const production = ["apps/portal", "domains", "design-system"].flatMap((path) => sourceFiles(join(root, path)));
  const offenders = production.filter((path) => {
    const content = readFileSync(path, "utf8");
    return content.includes("development/") || content.includes("demo.owner@fit.edu.ph") || content.includes("demo-password");
  });
  assert.deepEqual(offenders.map((path) => relative(root, path)), []);
});

test("workspace packages expose concepts, not implementation filenames", () => {
  for (const directory of ["domains/client", "domains/server", "domains/protocol"]) {
    const manifest = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
    assert.ok(Object.keys(manifest.exports).every((name) => name.split("/").length <= 3 && !/\.(?:ts|tsx|js|mjs)$/.test(name)));
  }
});

test("local automatic access accepts only loopback HTTP origins", () => {
  assert.equal(assertLocalUrl("http://members.localhost:3000", "portal", ["localhost"]).hostname, "members.localhost");
  assert.equal(assertLocalUrl("http://127.0.0.1:54321", "Supabase", ["localhost", "127.0.0.1"]).hostname, "127.0.0.1");
  assert.throws(() => assertLocalUrl("https://members.localhost:3000", "portal", ["localhost"]), /loopback/);
  assert.throws(() => assertLocalUrl("http://example.com", "portal", ["localhost"]), /loopback/);
  assert.throws(() => assertLocalUrl("http://preview.127.0.0.1:3000", "portal", ["127.0.0.1"]), /loopback/);
});

test("local automatic access refuses production, Vercel, and CI", () => {
  assert.doesNotThrow(() => assertDevelopmentRuntime({}));
  assert.throws(() => assertDevelopmentRuntime({ NODE_ENV: "production" }), /unavailable/);
  assert.throws(() => assertDevelopmentRuntime({ VERCEL: "1" }), /unavailable/);
  assert.throws(() => assertDevelopmentRuntime({ CI: "true" }), /unavailable/);
});

test("local automatic access uses the native maximized browser viewport", () => {
  const options = developmentBrowserOptions("/browser");
  assert.equal(options.executablePath, "/browser");
  assert.equal(options.headless, false);
  assert.equal(options.viewport, null);
  assert.ok(options.args.includes("--start-maximized"));
});

test("integrated development always uses local synthetic product data", () => {
  const launcher = readFileSync(join(root, "development/local-workspace/start.mjs"), "utf8");
  assert.match(launcher, /PYTORCH_FIT_DATA_PROVIDER:\s*["']local["']/);
  assert.doesNotMatch(launcher, /PYTORCH_FIT_DATA_PROVIDER:\s*["']supabase["']/);
});

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3100";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const title = `Persistent evidence ${Date.now()}`;
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem("pytorch-fit:tour:/career/evidence:v1", "seen");
    localStorage.setItem("pytorch-fit:tour:/career/resumes:v1", "seen");
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/career/evidence`);
  await page.waitForTimeout(1_000);

  const manual = page.getByRole("button", { name: "Manual entry", exact: true });
  await manual.waitFor();
  await manual.click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Achievement title").fill(title);
  await editor.getByLabel("Organization").fill("Owner verified organization");
  await editor.getByLabel("Role").fill("Developer");
  await editor.getByLabel("Date").fill("August 2026");
  await editor.getByLabel("Description").fill("Saved through the authenticated product command gateway.");
  await editor.getByLabel("Skills").fill("Python, FastAPI");
  await editor.getByRole("button", { name: "Save & approve" }).click();
  await editor.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: new RegExp(title) }).waitFor();

  await page.reload();
  await page.getByRole("button", { name: new RegExp(title) }).waitFor();

  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles(path.join(root, "public/demo/evidence/ml-showcase.webp"));
  const uploadEditor = page.getByRole("dialog");
  await uploadEditor.getByRole("heading", { name: "ml-showcase" }).waitFor();
  assert.equal(await uploadEditor.locator('img[src*="/api/product/evidence/media/"]').count(), 1);
  await uploadEditor.getByRole("button", { name: "Cancel" }).click();
  await page.reload();
  await page.getByRole("button", { name: /ml-showcase/ }).waitFor();

  await page.getByRole("button", { name: /Generic website/ }).click();
  const sourceDialog = page.getByRole("dialog");
  await sourceDialog.getByLabel("Portfolio URL").fill("https://example.test/portfolio");
  await sourceDialog.getByRole("button", { name: "Connect source" }).click();
  await sourceDialog.getByText("Source connection saved.").waitFor();
  await sourceDialog.getByRole("button", { name: "Close", exact: true }).click();
  const sourceState = await page.evaluate(async () => {
    const response = await fetch("/api/product/career-evidence", { cache: "no-store" });
    const payload = await response.json();
    return payload.evidence.sources.find((source) => source.id === "website");
  });
  assert.equal(sourceState.connectionStatus, "connected");
  assert.equal(sourceState.configuredUrl, "https://example.test/portfolio");
  assert.equal(sourceState.lastSyncedAt, null);

  const unavailableSync = await page.evaluate(async () => {
    const response = await fetch("/api/product/sources/website", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
    return { status: response.status, payload: await response.json() };
  });
  assert.equal(unavailableSync.status, 400);
  assert.match(unavailableSync.payload.error, /No deterministic collection adapter/);

  const handoff = await page.evaluate(async () => {
    const response = await fetch("/api/product/sources/twitter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect" }) });
    return { status: response.status, payload: await response.json() };
  });
  assert.equal(handoff.status, 409);
  assert.equal(handoff.payload.code, "HUMAN_HANDOFF_REQUIRED");

  await page.goto(`${baseUrl}/career/resumes`);
  await page.getByRole("button", { name: /Classic/ }).click();
  const resumeDialog = page.getByRole("dialog");
  await resumeDialog.getByText(/\d+-page PDF generated/).waitFor();
  for (const [label, extension] of [["HTML", ".html"], ["Editable DOCX", ".docx"], ["PDF", ".pdf"]]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      resumeDialog.getByRole("button", { name: label, exact: true }).click(),
    ]);
    assert.ok(download.suggestedFilename().endsWith(extension), `${label} export filename is incorrect`);
  }
  assert.deepEqual(pageErrors, []);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/career/evidence`);
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.client, `mobile overflow: ${dimensions.scroll} > ${dimensions.client}`);
  await context.close();
  console.log("Career Evidence persistence, upload, handoff, resume-fit, and mobile checks passed.");
} finally {
  await browser.close();
}

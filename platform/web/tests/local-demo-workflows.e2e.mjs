import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    for (const route of ["/dashboard", "/jobs/opportunities", "/jobs/automation", "/events", "/leaderboards"]) {
      localStorage.setItem(`pytorch-fit:tour:${route}:v1`, "seen");
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${baseUrl}/jobs/opportunities`);
  await page.getByText("Local demo · Synthetic data · External actions disabled").waitFor();
  const beforeOpportunity = await page.evaluate(async () => (await fetch("/api/product/opportunities", { cache: "no-store" })).json());
  const beforeStage = beforeOpportunity.opportunities.find((item) => item.id === "opp-3").stage;
  const opportunity = page.getByRole("heading", { name: "Data Automation Associate" }).locator("..");
  await opportunity.getByRole("button", { name: /Move to/i }).click();
  await page.waitForLoadState("networkidle");
  await page.getByText("Data Automation Associate").waitFor();
  const stored = await page.evaluate(async () => (await fetch("/api/product/opportunities", { cache: "no-store" })).json());
  assert.notEqual(stored.opportunities.find((item) => item.id === "opp-3").stage, beforeStage);

  await page.goto(`${baseUrl}/jobs/automation`);
  const gateLabels = page.getByText(/Explicit human approval required/);
  await gateLabels.first().waitFor();
  const before = await gateLabels.count();
  await page.getByRole("button", { name: "Approve this demo gate" }).first().click();
  await page.waitForLoadState("networkidle");
  const after = await page.getByText(/Explicit human approval required/).count();
  assert.equal(after, before - 1);

  await page.goto(`${baseUrl}/events`);
  const join = page.getByRole("button", { name: "Join synthetic event" }).first();
  await join.click();
  await page.getByRole("button", { name: "Leave synthetic event" }).first().waitFor();

  await page.goto(`${baseUrl}/leaderboards`);
  await page.getByText("Alex Rivera").waitFor();
  assert.deepEqual(errors, []);
  await context.close();
  console.log("Local opportunity, approval, event, and cohort workflows passed.");
} finally {
  await browser.close();
}

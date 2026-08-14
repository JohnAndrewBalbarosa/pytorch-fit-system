import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildCapabilityManifest } from "../lib/capabilities";
import { demoProductView } from "../lib/product/demo";
import { productViews } from "../lib/product/contracts";

test("every product view has a complete, labeled visual demo contract", () => {
  for (const view of productViews) {
    const data = demoProductView(view);
    assert.equal(data.meta.source, "demo");
    assert.equal(data.meta.label, "Prototype data");
    assert.ok(data.heading.title);
    assert.equal(data.stats.length, 4);
    assert.ok(Array.isArray(data.evidence?.sources));
    assert.ok(Array.isArray(data.resumes));
    assert.ok(Array.isArray(data.opportunities));
    assert.ok(Array.isArray(data.connections));
  }
});

test("visual demo unlocks previews but never execution capabilities", () => {
  const manifest = buildCapabilityManifest({
    developmentOwner: true,
    identityConnected: false,
    socialConnected: false,
    jobSiteConnected: false,
    evidenceReady: false,
    normalizedProfileReady: false,
    resumeArtifactsReady: false,
    visualDemo: true,
  });
  assert.equal(manifest.capabilities.evidence_read.state, "read_only");
  assert.equal(manifest.capabilities.resume_read.state, "read_only");
  assert.equal(manifest.capabilities.job_discovery.state, "read_only");
  assert.equal(manifest.capabilities.evidence_scrape.state, "locked");
  assert.equal(manifest.capabilities.resume_generate.state, "locked");
  assert.equal(manifest.capabilities.application_draft.state, "locked");
  assert.equal(manifest.capabilities.analytics_write.state, "locked");
});

test("Supabase career product policies are owner-scoped and browser read-only", () => {
  const migration = readFileSync("../../supabase/migrations/0006_career_product_gateway.sql", "utf8");
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /owner_select/g);
  assert.doesNotMatch(migration, /owner_all/);
  assert.doesNotMatch(migration, /FOR (INSERT|UPDATE|DELETE) TO authenticated/);
  assert.match(migration, /requested_user_id IS DISTINCT FROM \(SELECT auth\.uid\(\)\)/);
});

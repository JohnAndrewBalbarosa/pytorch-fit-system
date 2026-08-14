import assert from "node:assert/strict";
import test from "node:test";
import { buildCapabilityManifest } from "../lib/capabilities";

const base = {
  developmentOwner: true,
  identityConnected: false,
  socialConnected: true,
  jobSiteConnected: true,
  evidenceReady: true,
  normalizedProfileReady: true,
  resumeArtifactsReady: true,
};

test("development owner receives only prerequisite-backed capabilities", () => {
  const manifest = buildCapabilityManifest(base);
  assert.equal(manifest.capabilities.evidence_scrape.state, "available");
  assert.equal(manifest.capabilities.resume_generate.state, "available");
  assert.equal(manifest.capabilities.job_discovery.state, "available");
  assert.equal(manifest.capabilities.application_draft.state, "available");
  assert.equal(manifest.capabilities.analytics_read.state, "read_only");
  assert.equal(manifest.capabilities.analytics_write.state, "locked");
});

test("development ownership never substitutes missing external prerequisites", () => {
  const manifest = buildCapabilityManifest({
    ...base,
    jobSiteConnected: false,
    normalizedProfileReady: false,
    resumeArtifactsReady: false,
  });
  assert.equal(manifest.capabilities.job_discovery.state, "locked");
  assert.equal(manifest.capabilities.application_draft.state, "locked");
  assert.equal(manifest.capabilities.resume_generate.state, "locked");
  assert.equal(manifest.capabilities.resume_read.state, "locked");
});

test("non-owner state fails closed while analytics remains read-only", () => {
  const manifest = buildCapabilityManifest({ ...base, developmentOwner: false });
  assert.equal(manifest.capabilities.connections.state, "locked");
  assert.equal(manifest.capabilities.evidence_scrape.state, "locked");
  assert.equal(manifest.capabilities.job_discovery.state, "locked");
  assert.equal(manifest.capabilities.application_draft.state, "locked");
  assert.equal(manifest.capabilities.analytics_read.state, "read_only");
  assert.equal(manifest.capabilities.analytics_write.state, "locked");
});

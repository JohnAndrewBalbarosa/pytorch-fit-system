import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildCapabilityManifest } from "../lib/capabilities";
import { loginSchema, registerSchema } from "../lib/auth-schema";
import { evidenceFormSchema } from "../lib/product/evidence-schema";
import { demoPersonas, demoProductView } from "../lib/product/demo";
import { productViews, unavailableDashboardAnalytics } from "../lib/product/contracts";
import { resumeHtml, resumePdfBytes, resumePdfPageCount, resumeTemplates } from "../lib/product/resume-exports";
import { resumePreviewQuerySchema, resumeTemplateSchema } from "../lib/product/resume-schema";
import { jobMarketFilterSchema } from "../lib/job-market-schema";
import { parseEvidenceProposalResponse } from "../lib/product/evidence-ai";
import { overlayLocalCareerState, readLocalMedia, saveLocalEvidence, saveLocalMedia, saveLocalSourceState } from "../lib/product/local-career-store";
import { ensureLocalDemo, readLocalDemoState, updateLocalDemoState } from "../lib/product/local-demo-state";
import { localDemoStatus, resetLocalDemo } from "../lib/product/local-demo-admin";
import { configuredProductProvider } from "../lib/product/repository";
import { developerDiagnostics, isOfficerOnlyProductView, memberSafeProductData } from "../lib/product/diagnostics";
import { isOfficerOnlyPath, memberDestination } from "../lib/portal";

test("every product view has a complete, labeled visual demo contract", () => {
  for (const view of productViews) {
    const data = demoProductView(view);
    assert.equal(data.meta.source, "demo");
    assert.equal(data.meta.label, "Local synthetic demo");
    assert.equal(data.meta.mode, "local_demo");
    assert.equal(data.meta.synthetic, true);
    assert.ok(data.heading.title);
    assert.equal(data.stats.length, 4);
    assert.ok(Array.isArray(data.evidence?.sources));
    assert.ok(Array.isArray(data.resumes));
    assert.ok(Array.isArray(data.opportunities));
    assert.ok(Array.isArray(data.connections));
    assert.ok(data.analytics);
    assert.equal(data.analytics?.activity.state, "demo");
  }
});

test("member responses remove officer analytics and all diagnostics", () => {
  const dashboard = demoProductView("dashboard");
  const safe = memberSafeProductData("dashboard", {
    ...dashboard,
    diagnostics: developerDiagnostics(
      "dashboard",
      dashboard,
      {
        userId: "officer-1",
        audience: "officer",
        role: "admin",
        isOfficer: true,
        isAdmin: true,
        canViewDiagnostics: true,
        userTier: "admin",
        localDevelopment: true,
      },
      4.2,
    ),
  });
  assert.equal(safe.analytics, undefined);
  assert.equal(safe.connections, undefined);
  assert.equal(safe.operations, undefined);
  assert.equal(safe.recommendations, undefined);
  assert.equal(safe.diagnostics, undefined);
  assert.ok(safe.events?.length);
  assert.ok(safe.opportunities?.length);
});

test("officer routes, views, and diagnostics are explicit allowlists", () => {
  assert.equal(isOfficerOnlyPath("/admin"), true);
  assert.equal(isOfficerOnlyPath("/jobs/automation/run"), true);
  assert.equal(isOfficerOnlyPath("/jobs/opportunities"), false);
  assert.equal(memberDestination("/career/advisor"), "/dashboard");
  assert.equal(memberDestination("/career/evidence"), "/career/evidence");
  assert.equal(isOfficerOnlyProductView("advisor"), true);
  assert.equal(isOfficerOnlyProductView("opportunities"), false);
  const dashboard = demoProductView("dashboard");
  const diagnostics = developerDiagnostics(
    "dashboard",
    dashboard,
    {
      userId: "officer-1",
      audience: "officer",
      role: "admin",
      isOfficer: true,
      isAdmin: true,
      canViewDiagnostics: true,
      userTier: "admin",
      localDevelopment: false,
    },
    3.6,
  );
  assert.equal(diagnostics.authorization.diagnostics, true);
  assert.equal(diagnostics.performance.repositoryReadMs, 4);
  assert.deepEqual(Object.keys(diagnostics.data).sort(), [
    "generatedAt", "mode", "provider", "source", "synthetic",
  ]);
});

test("unavailable analytics preserve every dashboard module without fixture values", () => {
  const analytics = unavailableDashboardAnalytics();
  assert.deepEqual(Object.keys(analytics).sort(), ["activity", "approvals", "departments", "events", "leaderboard", "metrics", "skills", "trust"]);
  for (const module of Object.values(analytics)) assert.equal(module.state, "unavailable");
  assert.deepEqual(analytics.activity.data, []);
  assert.deepEqual(analytics.events.data, { planning: [], approved: [], live: [], concluded: [] });
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
    aiConfigured: false,
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

test("career demo exposes clickable source metadata and photo-backed evidence", () => {
  const data = demoProductView("career-evidence");
  assert.ok(data.evidence?.sources.some((source) => source.id === "website" && source.maturity === "experimental"));
  assert.ok(data.evidence?.sources.some((source) => source.id === "twitter" && source.maturity === "beta"));
  assert.equal(data.evidence?.items?.length, 6);
  assert.ok(data.evidence?.items?.every((item) => item.mediaUrl.startsWith("/demo/evidence/")));
  assert.ok(data.evidence?.items?.some((item) => item.verificationState === "ai_proposed"));
});

test("local demo has one primary and four supporting lifecycle personas", () => {
  assert.equal(demoPersonas.length, 5);
  assert.equal(demoPersonas.filter((persona) => persona.id === "demo-primary").length, 1);
  assert.deepEqual(new Set(demoPersonas.map((persona) => persona.state)).size, 5);
  const data = demoProductView("dashboard");
  assert.equal(data.events?.length, 5);
  assert.equal(data.leaderboard?.length, 5);
  assert.equal(data.opportunities?.length, 6);
  assert.equal(data.operations?.reviews.length, 4);
});

test("production rejects the local provider instead of falling back to synthetic data", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.PYTORCH_FIT_DATA_PROVIDER;
  try {
    Object.defineProperty(process.env, "NODE_ENV", { configurable: true, enumerable: true, value: "production", writable: true });
    process.env.PYTORCH_FIT_DATA_PROVIDER = "local";
    assert.throws(() => configuredProductProvider(), /requires PYTORCH_FIT_DATA_PROVIDER=supabase/);
    process.env.PYTORCH_FIT_DATA_PROVIDER = "supabase";
    assert.equal(configuredProductProvider(), "supabase");
  } finally {
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.defineProperty(process.env, "NODE_ENV", { configurable: true, enumerable: true, value: previousNodeEnv, writable: true });
    if (previousProvider === undefined) delete process.env.PYTORCH_FIT_DATA_PROVIDER;
    else process.env.PYTORCH_FIT_DATA_PROVIDER = previousProvider;
  }
});

test("local demo runtime persists mutations and reset restores the seed", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pytorch-fit-demo-"));
  const previous = process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH;
  process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH = path.join(directory, "demo.sqlite3");
  try {
    ensureLocalDemo("demo-owner");
    updateLocalDemoState("demo-owner", (state) => ({ ...state, opportunityStages: { "opp-3": "drafted" }, approvedReviewIds: ["review-1"] }));
    assert.equal(readLocalDemoState("demo-owner").opportunityStages["opp-3"], "drafted");
    assert.equal(localDemoStatus("demo-owner").seeded, true);
    const result = resetLocalDemo("demo-owner");
    assert.ok(result.backup);
    assert.deepEqual(readLocalDemoState("demo-owner").opportunityStages, {});
    assert.deepEqual(readLocalDemoState("demo-owner").approvedReviewIds, []);
  } finally {
    if (previous === undefined) delete process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH;
    else process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("all resume templates render and measure the same ATS-readable normalized snapshot", async () => {
  const profile = demoProductView("resumes").resumeProfile;
  assert.ok(profile);
  assert.equal(resumeTemplates.length, 3);
  for (const template of resumeTemplates) {
    const html = resumeHtml(profile!, template.id);
    assert.match(html, /Professional summary/);
    assert.match(html, /Campus Vision Demo/);
    assert.match(html, /PyTorch/);
    assert.doesNotMatch(html, /grid-template-columns|<table|<img/);
    assert.ok(await resumePdfPageCount(profile!, template.id) >= 1);
    const bytes = await resumePdfBytes(profile!, template.id);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  }
});

test("document and filter schemas reject unsupported or unbounded viewer input", () => {
  assert.equal(resumeTemplateSchema.safeParse("classic").success, true);
  assert.equal(resumeTemplateSchema.safeParse("https://remote.example/resume.pdf").success, false);
  assert.deepEqual(resumePreviewQuerySchema.parse({ template: "modern" }), { template: "modern", disposition: "inline" });
  assert.equal(resumePreviewQuerySchema.safeParse({ template: "classic", disposition: "popup" }).success, false);
  assert.equal(jobMarketFilterSchema.safeParse({ country: "Philippines", compareCountry: "", role: "software", mode: "remote" }).success, true);
  assert.equal(jobMarketFilterSchema.safeParse({ country: "P", compareCountry: "", role: "", mode: "worldwide" }).success, false);
});

test("user-facing forms share strict schemas for authentication and evidence", () => {
  assert.equal(loginSchema.safeParse({ email: "owner@fit.edu.ph", password: "valid-passphrase", remember: false }).success, true);
  assert.equal(loginSchema.safeParse({ email: "not-an-email", password: "short", remember: false }).success, false);
  assert.equal(registerSchema.safeParse({ name: "Demo Owner", username: "demo_owner", email: "owner@fit.edu.ph", password: "valid-passphrase", confirm: "different-passphrase", terms: true }).success, false);
  assert.equal(evidenceFormSchema.safeParse({ title: "Hackathon winner", organization: "FEU Tech", role: "Lead", dateLabel: "2026", description: "Built a measured working prototype.", skillsText: "PyTorch, FastAPI" }).success, true);
  assert.equal(evidenceFormSchema.safeParse({ title: "", organization: "", role: "", dateLabel: "", description: "guessed", skillsText: "" }).success, false);
});

test("local career commands survive a new repository read", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pytorch-fit-product-"));
  const previous = process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH;
  process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH = path.join(directory, "career.sqlite3");
  try {
    const demo = demoProductView("career-evidence");
    const original = demo.evidence!.items![0];
    const updated = { ...original, title: "Persisted owner edit", verificationState: "user_verified" as const };
    saveLocalEvidence("owner-1", updated);
    saveLocalSourceState("owner-1", { id: "website", connectionStatus: "connected", lastSyncedAt: null, configuredUrl: "https://example.test/portfolio" });
    saveLocalMedia("owner-1", updated.id, new Uint8Array([1, 2, 3]), "image/webp");
    const reloaded = overlayLocalCareerState(demoProductView("career-evidence"), "owner-1");
    assert.equal(reloaded.evidence?.items?.find((item) => item.id === updated.id)?.title, "Persisted owner edit");
    assert.equal(reloaded.evidence?.sources.find((source) => source.id === "website")?.connectionStatus, "connected");
    assert.equal(reloaded.evidence?.sources.find((source) => source.id === "website")?.configuredUrl, "https://example.test/portfolio");
    assert.equal(reloaded.evidence?.sources.find((source) => source.id === "website")?.lastSyncedAt, null);
    assert.deepEqual([...readLocalMedia("owner-1", updated.id)!.bytes], [1, 2, 3]);
  } finally {
    if (previous === undefined) delete process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH;
    else process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("local source storage upgrades databases created before configured URLs", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "pytorch-fit-product-upgrade-"));
  const previous = process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH;
  process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH = path.join(directory, "career.sqlite3");
  try {
    const legacy = new DatabaseSync(process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH);
    legacy.exec(`CREATE TABLE product_source_states (
      user_id TEXT NOT NULL, id TEXT NOT NULL, connection_status TEXT NOT NULL,
      last_synced_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, id)
    ) STRICT;`);
    legacy.close();
    saveLocalSourceState("owner-1", { id: "website", connectionStatus: "connected", lastSyncedAt: null, configuredUrl: "https://example.test/legacy" });
    const reloaded = overlayLocalCareerState(demoProductView("career-evidence"), "owner-1");
    assert.equal(reloaded.evidence?.sources.find((source) => source.id === "website")?.configuredUrl, "https://example.test/legacy");
  } finally {
    if (previous === undefined) delete process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH;
    else process.env.PYTORCH_FIT_LOCAL_DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("provider-neutral AI parser accepts Responses HTTP output and rejects loose data", () => {
  const proposal = { summary: "Grounded", changes: [{ field: "Description", before: "A", after: "B" }], warnings: ["Review"] };
  assert.deepEqual(parseEvidenceProposalResponse({ output: [{ content: [{ type: "output_text", text: JSON.stringify(proposal) }] }] }), proposal);
  assert.throws(() => parseEvidenceProposalResponse({ output_text: JSON.stringify({ summary: "bad", changes: [{ field: 4 }], warnings: [] }) }), /invalid field changes/);
});

test("SQL demo seed is deterministic, synthetic, and production-guarded", () => {
  const seed = readFileSync("../../supabase/seed.sql", "utf8");
  const migration = readFileSync("../../supabase/migrations/0007_career_evidence_studio.sql", "utf8");
  const storageScript = readFileSync("scripts/seed-demo-storage.mjs", "utf8");
  assert.match(seed, /synthetic showcase data/i);
  assert.match(seed, /ON CONFLICT/g);
  assert.match(seed, /REFRESH MATERIALIZED VIEW leaderboard/);
  assert.match(storageScript, /PYTORCH_FIT_ENV !== "showcase"/);
  assert.match(storageScript, /NODE_ENV === "production"/);
  assert.match(migration, /connection_state connection_state/);
  assert.match(migration, /career_evidence_revisions_owner_select/);
  assert.match(migration, /career_evidence_storage_owner_select/);
  assert.match(migration, /requested_user_id IS DISTINCT FROM \(SELECT auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /FOR (INSERT|UPDATE|DELETE) TO authenticated/);
});

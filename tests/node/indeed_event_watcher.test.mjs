import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  MicrotaskCoalescer,
  SubmissionStore,
  isExactIndeedConfirmation,
  normalizeExactIdentity,
} from "../../tools/job_finder/indeed_event_watcher_core.mjs";

test("confirmation requires exact route, text, and clear access", () => {
  const proof = {
    host: "smartapply.indeed.com",
    path: "/beta/indeedapply/form/post-apply",
    visibleText: "Your application has been submitted!",
    accessBlocked: false,
  };
  assert.equal(isExactIndeedConfirmation(proof), true);
  assert.equal(isExactIndeedConfirmation({ ...proof, path: "/review-module" }), false);
  assert.equal(isExactIndeedConfirmation({ ...proof, visibleText: "Thanks" }), false);
  assert.equal(isExactIndeedConfirmation({ ...proof, accessBlocked: true }), false);
});

test("microtask scheduler coalesces an event burst and preserves a rerun", async () => {
  const queue = new MicrotaskCoalescer();
  let calls = 0;
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const operation = async () => {
    calls += 1;
    if (calls === 1) await blocked;
  };
  queue.schedule("page", operation);
  queue.schedule("page", operation);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  queue.schedule("page", operation);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
});

test("event confirmation inserts once and remains idempotent", () => {
  const directory = mkdtempSync(join(tmpdir(), "indeed-watcher-"));
  const databasePath = join(directory, "applications.sqlite3");
  const store = new SubmissionStore(databasePath);
  const task = {
    task_id: "5bae6308f955f822",
    company: "Binance",
    job_title: "Applied Data Scientist",
  };
  const first = store.recordConfirmed(
    task,
    "https://smartapply.indeed.com/beta/indeedapply/form/post-apply?secret=removed",
    new Date("2026-07-24T12:00:00Z"),
  );
  const second = store.recordConfirmed(
    task,
    "https://smartapply.indeed.com/beta/indeedapply/form/post-apply",
    new Date("2026-07-24T12:01:00Z"),
  );
  store.close();

  assert.equal(first.status, "inserted");
  assert.equal(second.status, "matched_existing");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const rows = database.prepare("SELECT * FROM applications").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "submitted");
  const companies = database.prepare("SELECT * FROM companies").all();
  const postings = database.prepare("SELECT * FROM job_postings").all();
  assert.equal(companies.length, 1);
  assert.equal(companies[0].name, "Binance");
  assert.equal(postings.length, 1);
  assert.equal(postings[0].company_id, companies[0].id);
  assert.equal(postings[0].provider, "indeed");
  assert.equal(postings[0].provider_job_id, "5bae6308f955f822");
  assert.equal(
    rows[0].source_url,
    "https://smartapply.indeed.com/beta/indeedapply/form/post-apply",
  );
  assert.equal(normalizeExactIdentity("  Applied   Data Scientist "), "applied data scientist");
  database.close();
});

test("event confirmation resolves an exact unknown submission attempt", () => {
  const directory = mkdtempSync(join(tmpdir(), "indeed-watcher-"));
  const databasePath = join(directory, "applications.sqlite3");
  const store = new SubmissionStore(databasePath);
  const database = new DatabaseSync(databasePath);
  const inserted = database
    .prepare(
      `INSERT INTO applications (
         company, job_title, company_key, job_title_key, state, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "Binance",
      "Applied Data Scientist",
      "binance",
      "applied data scientist",
      "submission_unknown",
      "2026-07-24T11:59:00.000Z",
    );
  database.close();

  const result = store.recordConfirmed(
    { company: "Binance", job_title: "Applied Data Scientist" },
    "https://smartapply.indeed.com/beta/indeedapply/form/post-apply",
    new Date("2026-07-24T12:00:00Z"),
  );
  store.close();

  assert.equal(result.status, "resolved_unconfirmed_attempt");
  assert.equal(result.applicationId, Number(inserted.lastInsertRowid));
  const verified = new DatabaseSync(databasePath, { readOnly: true });
  const row = verified
    .prepare("SELECT state, confirmation_source FROM applications WHERE id = ?")
    .get(result.applicationId);
  assert.equal(row.state, "submitted");
  assert.equal(row.confirmation_source, "browser");
  verified.close();
});

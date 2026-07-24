import { DatabaseSync } from "node:sqlite";

const SUBMITTED = "submitted";
const UNRESOLVED = new Set(["submitting", "submission_unknown"]);
const DUPLICATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeExactIdentity(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function sanitizeSourceUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}${url.pathname}`;
}

export function isExactIndeedConfirmation(snapshot) {
  return (
    snapshot.host === "smartapply.indeed.com" &&
    snapshot.path.endsWith("/post-apply") &&
    snapshot.accessBlocked === false &&
    snapshot.visibleText.toLowerCase().includes("your application has been submitted")
  );
}

export class MicrotaskCoalescer {
  #states = new Map();

  schedule(key, operation) {
    const state = this.#states.get(key) ?? {
      queued: false,
      running: false,
      rerun: false,
      operation,
    };
    state.operation = operation;
    if (state.running) {
      state.rerun = true;
      this.#states.set(key, state);
      return;
    }
    if (state.queued) return;
    state.queued = true;
    this.#states.set(key, state);
    queueMicrotask(async () => {
      state.queued = false;
      state.running = true;
      try {
        await state.operation();
      } finally {
        state.running = false;
        if (state.rerun) {
          state.rerun = false;
          this.schedule(key, state.operation);
        } else if (!state.queued) {
          this.#states.delete(key);
        }
      }
    });
  }
}

export class SubmissionStore {
  constructor(databasePath) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.#initialize();
  }

  close() {
    this.database.close();
  }

  recordConfirmed(task, sourceUrl, observedAt = new Date()) {
    const company = String(task.company ?? "").trim().replace(/\s+/g, " ");
    const jobTitle = String(task.job_title ?? "").trim().replace(/\s+/g, " ");
    if (!company || !jobTitle) throw new Error("exact company and job title are required");
    const companyKey = normalizeExactIdentity(company);
    const titleKey = normalizeExactIdentity(jobTitle);
    const now = observedAt.toISOString();
    const cutoff = new Date(observedAt.getTime() - DUPLICATE_WINDOW_MS).toISOString();
    const safeUrl = sanitizeSourceUrl(sourceUrl);
    const domain = new URL(safeUrl).hostname.toLowerCase();
    const confirmation = "observable Indeed post-apply page reached by event watcher";
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.database
        .prepare(
          `SELECT id FROM applications
           WHERE company_key = ? AND job_title_key = ? AND state = ? AND applied_at >= ?
           ORDER BY applied_at DESC LIMIT 1`,
        )
        .get(companyKey, titleKey, SUBMITTED, cutoff);
      if (existing) {
        this.database.exec("COMMIT");
        return { status: "matched_existing", applicationId: Number(existing.id) };
      }
      const unresolved = this.database
        .prepare(
          `SELECT id, state FROM applications
           WHERE company_key = ? AND job_title_key = ? AND state IN (?, ?)
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(companyKey, titleKey, ...UNRESOLVED);
      let applicationId;
      if (unresolved) {
        applicationId = Number(unresolved.id);
        this.database
          .prepare(
            `UPDATE applications
             SET state = ?, applied_at = ?, updated_at = ?, confirmation = ?,
                 confirmation_source = ?, source_domain = ?, source_url = ?
             WHERE id = ?`,
          )
          .run(
            SUBMITTED,
            now,
            now,
            confirmation,
            "browser",
            domain,
            safeUrl,
            applicationId,
          );
      } else {
        const inserted = this.database
          .prepare(
            `INSERT INTO applications (
               company, job_title, company_key, job_title_key, state,
               applied_at, updated_at, confirmation, confirmation_source,
               source_domain, source_url
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            company,
            jobTitle,
            companyKey,
            titleKey,
            SUBMITTED,
            now,
            now,
            confirmation,
            "browser",
            domain,
            safeUrl,
          );
        applicationId = Number(inserted.lastInsertRowid);
      }
      this.database
        .prepare(
          `INSERT INTO submission_audit (
             application_id, event_at, company, job_title, action, decision, details
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          applicationId,
          now,
          company,
          jobTitle,
          "submission_confirmed",
          SUBMITTED,
          confirmation,
        );
      this.database.exec("COMMIT");
      return {
        status: unresolved ? "resolved_unconfirmed_attempt" : "inserted",
        applicationId,
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  #initialize() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT NOT NULL,
        job_title TEXT NOT NULL,
        company_key TEXT NOT NULL,
        job_title_key TEXT NOT NULL,
        state TEXT NOT NULL,
        applied_at TEXT,
        updated_at TEXT NOT NULL,
        confirmation TEXT NOT NULL DEFAULT '',
        source_domain TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        confirmation_source TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_applications_recent_exact
        ON applications(company_key, job_title_key, state, applied_at);
      CREATE INDEX IF NOT EXISTS idx_applications_unresolved_exact
        ON applications(company_key, job_title_key, state, updated_at);
      CREATE TABLE IF NOT EXISTS submission_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER,
        event_at TEXT NOT NULL,
        company TEXT NOT NULL,
        job_title TEXT NOT NULL,
        action TEXT NOT NULL,
        decision TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(application_id) REFERENCES applications(id)
      );
      CREATE INDEX IF NOT EXISTS idx_submission_audit_application
        ON submission_audit(application_id, event_at);
    `);
  }
}

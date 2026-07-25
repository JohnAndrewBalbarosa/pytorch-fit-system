# Indeed event watcher

`tools/job_finder/indeed_event_watcher.mjs` is a dependency-free Node.js daemon that attaches to
the normal user-approved Chrome CDP session. It does not poll page content. Chrome navigation,
click, input, change, and DOM-mutation events enqueue a coalesced microtask.

The daemon learns exact job identity from a visible `au.indeed.com/viewjob` or
`ca.indeed.com/viewjob` page and carries that identity across same-tab navigation or a popup.
It reads visible labels (not raw descendant text) and rejects oversized or CSS-contaminated
company/title snapshots, waiting for a clean rendered identity before binding the task.
When the user clicks or focuses that exact tab, the watcher inspects only that tab. If it finds one
visible, enabled `Apply with Indeed`, `Apply now`, or `Apply on company site` control, it clicks the
control once. Indeed controls route into the active Indeed automation flow; company-site controls
open the external tab for the `human_intervention` workflow. Mutation/input events still refresh
confirmation state but never trigger Apply by themselves.

Apply triggering is bounded by `--max-tabs` (default `6`). When the attached page count reaches the
limit, the watcher logs `apply_deferred_resource_limit` and does not open another application tab.
The decision queries Chrome's current page targets instead of trusting cached attachment events, so
closed search tabs release capacity immediately.
The per-target URL/control key prevents repeated clicks during event bursts.

## Automatic continuation after human verification

The watcher can bridge a clear Smart Apply page into the deterministic Python form runner. Enable
the bridge with `--resume-runner`, `--artifact-dir`, and explicit phone-country arguments. The
mapped manifest job must contain `target_country`, `work_mode`, and `resume_file`; live title text
alone is intentionally insufficient.

On a clear `smartapply.indeed.com` module, the watcher writes a one-job manifest and starts one
bounded worker. Other verified targets queue behind the active worker, preserving the global
resource limit even when several pages clear together. Event bursts cannot start a second worker
for the same target and route. If a later module becomes blocked, the watcher clears that route
latch; completing the human verification causes the blocked-to-clear event to resume the worker.
Post-apply routes never launch a worker.

Final Submit remains a separate domain-scoped permission. Add `--autonomous-submit` only when the
runtime user has explicitly approved autonomous submission on Indeed. Without it, the bridge fills
the validated draft and stops at the final gate.

Example:

```bash
node --no-warnings tools/job_finder/indeed_event_watcher.mjs \
  --manifest out/indeed-unattended/candidate-manifest-latest.json \
  --resume-runner .venv/bin/python \
  --artifact-dir /path/to/reviewed/resume-artifacts \
  --phone-country-calling-code +63 \
  --phone-country-iso PH \
  --saved-phone-original-calling-code +63 \
  --autonomous-submit
```

An optional single-job manifest supplies identity once after a watcher restart when the application
page was already open. That fallback is persisted as consumed so it cannot label a later unrelated
application. It writes SQLite only when all three conditions hold:

1. the page host is `smartapply.indeed.com`;
2. the route ends in `/post-apply`;
3. visible text contains `Your application has been submitted` and no access blocker is present.

Cookie values, storage state, credentials, form values, and URL query values are never logged or
stored. The SQL operation is idempotent and retains the exact company/title duplicate policy.

Submission identity is normalized without collapsing distinct openings:

- `companies` stores one normalized company identity.
- `job_postings` stores many postings for that company and uses Indeed's non-secret `jk` job ID
  when the rendered Applied page exposes it.
- `job_title_aliases` preserves earlier or expanded titles for the same posting.
- `applications` remains the confirmation ledger and points to both the company and posting.

This means one company can own many jobs, while a renamed posting such as a title with an added
technology suffix reconciles in place instead of creating a second application. Query parameters
are still removed from stored source URLs; only the validated alphanumeric Indeed job ID is retained
as provider identity.

Run in the foreground:

```bash
node --no-warnings tools/job_finder/indeed_event_watcher.mjs \
  --manifest .cache/binance-current-manifest.json \
  --max-tabs 6
```

The checked-in user-service unit keeps the process alive and reconnects when the visible Chrome
CDP session becomes available. Install it with:

```bash
mkdir -p ~/.config/systemd/user
cp config/systemd/indeed-event-watcher.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now indeed-event-watcher.service
```

The watcher state contains only task identity, Chrome target IDs, and consumed manifest task IDs:
`.cache/indeed-event-watcher-state.json`.

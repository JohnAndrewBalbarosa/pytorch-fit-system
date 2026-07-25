# Indeed event watcher

`tools/job_finder/indeed_event_watcher.mjs` is a dependency-free Node.js daemon that attaches to
the normal user-approved Chrome CDP session. It does not poll page content. Chrome navigation,
click, input, change, and DOM-mutation events enqueue a coalesced microtask.

The daemon learns exact job identity from a visible `au.indeed.com/viewjob` or
`ca.indeed.com/viewjob` page and carries that identity across same-tab navigation or a popup.
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
  --manifest .cache/binance-current-manifest.json
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

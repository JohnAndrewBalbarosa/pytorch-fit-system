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

# Prefect operations for PyTorch FIT

This guide explains the local-only Prefect workspace created by the Process Lab. Prefect and every
resource below are developer tooling; none is included in the production Next.js or Python build.

## First setup and normal use

Start the Prefect server and product services, then configure the workspace:

```bash
export PREFECT_API_URL=http://127.0.0.1:4200/api
pytorch-fit-process-lab configure
pytorch-fit-process-lab open
```

`configure` is idempotent. It updates only resources named or tagged `pytorch-fit` and never deletes
unrelated Prefect resources. `up` performs the same configuration automatically, starts the local
Process worker, and opens the workflow chooser.

## What the Prefect sections contain

### Variables

Variables contain visible, non-secret scalar defaults: selected workflow, sandbox execution mode,
artifact retention, scraper page limit, and the disabled-by-default live read-only switch. Never put
passwords, tokens, cookies, email addresses, or browser state here; every user of the local Prefect
server can read them.

### Blocks

`pytorch-fit-local-services` groups the localhost service endpoints. `pytorch-fit-safety-policy`
shows which sensitive writes remain disabled. These use a typed Prefect Block schema, so Prefect's
native Blocks page renders the fields without a custom web UI. Neither block contains credentials.

### Work Pools and queues

`pytorch-fit-local-process` runs deployments as local subprocesses and allows at most two flow runs
at once. Its queues separate resource profiles:

| Queue | Limit | Purpose |
|---|---:|---|
| `interactive` | 1 | Member route and attached-browser journeys |
| `pipeline` | 1 | Scraping, evidence compilation, and resume artifacts |
| `diagnostics` | 1 | FastAPI health and OpenAPI verification |

The launcher starts `pytorch-fit-local-worker`. If runs remain `Late` or `Scheduled`, confirm that
this worker is online and polling `pytorch-fit-local-process`.

### Deployments

Deployments expose the fixed flows to Prefect's Run button, API, workers, and automations. They are
unscheduled by default: a developer or a failure automation must request a run. Required scraper,
evidence, and resume parameters must still be supplied when those deployments are launched.

### Concurrency

Global limits protect shared local resources: one CDP browser user, one live scraper, one model
planning call, one PDF/artifact build, and four read-only API checks. The corresponding tasks acquire
and release slots through Prefect. Do not raise a limit merely to clear a stuck run; inspect the run
and worker first.

### Automations

Each non-diagnostic deployment has a failure automation. `Failed`, `Crashed`, or `TimedOut` starts
the `api-contracts` diagnostic deployment. The diagnostic deployment has no failure automation, so
this cannot recurse. No email, Discord message, approval, points award, or external write occurs.

### Event Feed

No custom dashboard is involved. The Process Lab emits bounded events for route success/failure,
human gates, access blockers, cache
decisions, artifacts, and workflow outcomes. Events contain only safe paths, statuses, timings, and
artifact references. They never contain credentials, cookies, contact data, or raw evidence.

## Troubleshooting

- **Prefect pages are empty:** export `PREFECT_API_URL`, run `configure`, then refresh the UI.
- **A deployment stays scheduled:** restart `up` or run `prefect worker start --pool
  pytorch-fit-local-process --limit 2`.
- **A task waits for concurrency:** inspect the Concurrency page and the active run holding the slot;
  cancel the stale run instead of disabling safety globally.
- **The graph is hard to read:** open the exact flow run from `open` and press `F` for Prefect's
  built-in fullscreen graph.
- **Docker/Supabase is unavailable:** read-only local-demo route flows may still run, but real auth
  and RLS browser journeys must wait for the local Supabase stack.
- **Configuration changed unexpectedly:** rerun `configure`; managed values return to the documented
  defaults while unrelated Prefect data remains untouched.

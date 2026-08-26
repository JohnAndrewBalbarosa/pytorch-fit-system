# Process Lab beginner tutorial

You only need one command for a normal UI and DAG walkthrough. Run it from the repository root:

```bash
.cache/process-lab/venv/bin/pytorch-fit-process-lab demo
```

The first run installs the isolated tutorial's Node packages. Later runs reuse them. Keep the
terminal open while using the lab; press `Ctrl+C` once to stop its managed services.

## What `demo` does for you

1. Checks only Node/npm and Prefect. Docker is not required.
2. Starts the member app, officer app, FastAPI, and Prefect server.
3. Creates or updates the Variables, Blocks, work pool, queues, concurrency limits, deployments,
   and failure automations.
4. Runs a fresh `member-experience` workflow against safe synthetic local data.
5. Opens the React Joyride **Start Here** tutorial and the member dashboard.

The tutorial's **Open fresh DAG** button points to that startup's exact flow run. In Prefect, click
a node to inspect its state, logs, inputs, and result. Press `F` while viewing the graph to toggle
fullscreen.

## The only two modes

| Command | Use it for | Docker |
|---|---|---|
| `pytorch-fit-process-lab demo` | Learning, UI review, DAG review, synthetic data | Not needed |
| `pytorch-fit-process-lab up` | Local Supabase Auth/RLS and browser verification | Required |

Both modes are local-only. `demo` keeps external writes disabled. `up` still preserves the Process
Lab's human gates and does not bypass login, CAPTCHA, verification, rate limits, or final submit.
The lab keeps its Prefect database under `.cache/process-lab/prefect`, separate from other Prefect
projects on the machine.
Demo creates its fresh overview DAG directly, so it does not start the queued Process worker. The
Work Pool and queues remain visible for learning. Full `up` mode activates the worker when you need
Prefect's Deployment Run buttons.

## What the Prefect sections mean

- **Runs:** past and current workflow executions. Start here after the tutorial.
- **Deployments:** reusable workflow entrypoints and their Run buttons.
- **Variables:** visible non-secret defaults. Beginners normally read but do not edit them.
- **Blocks:** grouped local service URLs and the safety policy.
- **Work Pools:** the local worker and its interactive, pipeline, and diagnostics queues.
- **Concurrency:** collision protection for the browser, scraper, model planning, builds, and API.
- **Automations:** failure-to-diagnostics rules; they perform no notification or external write.
- **Event Feed:** a safe timeline of route checks, artifacts, gates, and workflow outcomes.

You do not need to configure those sections by hand. Every startup runs the same idempotent
configuration, so rerunning the command repairs missing or changed Process Lab resources.

## Restarting after a shutdown

Run the same `demo` command again. If you specifically need full mode, start Docker Desktop first,
wait until `docker info` succeeds, then run `up`.

Useful checks:

```bash
.cache/process-lab/venv/bin/pytorch-fit-process-lab doctor --demo
.cache/process-lab/venv/bin/pytorch-fit-process-lab doctor
```

The first checks beginner-demo requirements. The second also checks Docker and Supabase prerequisites
for full mode.

## Troubleshooting

- **Port already in use:** stop the older lab terminal with `Ctrl+C`, then retry.
- **Tutorial packages are downloading:** the first run can take longer; later runs use the local
  `node_modules` cache.
- **Full mode waits on image downloads:** use `demo` for UI/DAG review, or let Docker finish pulling
  the official Supabase images before retrying `up`.
- **Prefect looks crowded:** return to the Start Here page at `http://127.0.0.1:4173`; ordinary use
  needs only the fresh DAG and node details.
- **A workflow shows an orange human gate:** this is expected. The lab stopped before a sensitive
  write and is waiting for a person, not reporting a failure.

# PyTorch FIT Process Lab

This is a separate, local-only developer tool. Product code never imports it and production
packages must exclude the entire `tools/process_lab` tree.

It uses maintained frameworks instead of product-side test hooks:

- Prefect UI for flow graphs, task states, retries, parameters, logs, and artifacts.
- Playwright for black-box attachment to the normal loopback Chrome/Brave CDP browser.
- Schemathesis for FastAPI/OpenAPI contract verification.

Schemathesis is intentionally restricted to deterministic GET checks. Write workflows use explicit
product commands and keep their existing permission and human-review gates.

The lab does not hide browser automation or bypass access controls. A CAPTCHA, verification page,
login wall, 403/429, or layout drift stops the relevant external-site workflow.

## Install and run

```bash
python -m venv .cache/process-lab/venv
.cache/process-lab/venv/bin/pip install -e . -e tools/process_lab
.cache/process-lab/venv/bin/pytorch-fit-process-lab doctor
.cache/process-lab/venv/bin/pytorch-fit-process-lab up
```

`doctor` accepts an installed Supabase CLI or the maintained CLI through `npx`; Docker must be
running before `up` starts the local Supabase stack.

In another terminal, attach to the existing browser and run a workflow:

```bash
RESUME_BUILD_PLAYWRIGHT_CDP_URL=http://127.0.0.1:9222 \
  .cache/process-lab/venv/bin/pytorch-fit-process-lab run browser-lifecycle
```

Open Prefect at `http://127.0.0.1:4200`. Browser traces are written under
`out/process-lab/` and can be opened with Playwright Trace Viewer.

Login checks require `PROCESS_LAB_EMAIL` and `PROCESS_LAB_PASSWORD`. Keep them in the shell or an
ignored local environment file; the lab sanitizes results and never persists either value.
The local Supabase seed provides synthetic FIT-domain accounts with password `demo-password`;
for example, `mika@fit.edu.ph`. These accounts exist only in the local seed and are never deployed.

Available fixed workflows:

```bash
pytorch-fit-process-lab list
pytorch-fit-process-lab run api-contracts --property-checks
pytorch-fit-process-lab run scraper-economy --seed-url https://example.com
pytorch-fit-process-lab run evidence-compilation --crawl-artifact out/process-lab/.../latest-run.json
pytorch-fit-process-lab run resume-build --gh-user USER --role ROLE_ID
pytorch-fit-process-lab run end-to-end --seed-url URL --gh-user USER --role ROLE_ID
```

## Release boundary

Check an assembled release directory with:

```bash
pytorch-fit-process-lab guard-artifact PATH_TO_PRODUCTION_ARTIFACT
```

The guard rejects Process Lab modules, Prefect/Schemathesis files, browser traces, and test specs.

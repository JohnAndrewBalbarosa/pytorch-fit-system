# Canonical PyTorch FIT frontend

`platform/web` is the source of truth for all product-facing UI. It uses Next.js, the shared
obsidian/off-white/PyTorch-orange design system, and a provider-neutral server data gateway.
Do not add new product pages to the legacy Jinja templates.

## Local development

From the repository root:

```bash
python scripts/dev_frontend.py
```

The launcher first ensures the versioned synthetic scenario in `.cache/demo/product.sqlite3`, then
starts FastAPI on `127.0.0.1:8000`, Next.js on `127.0.0.1:3000`, creates a temporary server-to-server
developer token, and enables the passwordless local workspace. The bypass is
rejected when `NODE_ENV=production`; it does not grant any job-application permission.

Local mode is an editable demo with one primary synthetic student and four supporting lifecycle
personas. Supabase mode is production and never falls back to demo records. Inspect or restore the
local scenario with `npm run demo:status` and `npm run demo:reset`; reset creates a timestamped
backup under `.cache/demo/backups/` before restoring the canonical seed.

Copy `.env.example` to `.env.local` only when running the services separately. Keep API keys and
the developer token server-side.

## Frontend boundaries

- Product routes live in `app/` and use `AppShell` plus shared UI components.
- Next.js route handlers proxy only allowlisted FastAPI endpoints to a fixed loopback base URL.
- `scripts/dev_frontend.py` enables the explicit development-only sign-in bypass and opens the
  dashboard directly. The bypass requires both `PYTORCH_FIT_DEV_ACCESS=1` and
  `PYTORCH_FIT_DEV_BYPASS_SIGN_IN=1`, and is always disabled when `NODE_ENV=production`.
- FastAPI owns ingestion, persistent snapshots, job automation, and permission enforcement.
- `PYTORCH_FIT_DATA_PROVIDER=local|supabase` selects exactly one provider. Local mode normalizes
  the existing FastAPI/SQLite services; production mode uses the authenticated Supabase RPC.
- React never queries storage tables directly. `/api/product/*` returns stable visual view models.
- `PYTORCH_FIT_DATA_PROVIDER=local` selects the labeled, synthetic, external-write-disabled demo.
  `supabase` selects production data and never falls back to fixtures.
- Command Center analytics keep fixed chart/card dimensions when a series is missing and render a
  centered `Data unavailable` watermark; unavailable data is never replaced with fixture values.
- Supabase Auth uses cookie-backed server sessions. Production ignores the local sign-in bypass.
- The canonical browser UI reads a sanitized development capability manifest. Missing provider
  sessions or artifacts stay visible but locked; analytics filters read existing snapshots only.
- Career evidence enters resume and analytics processing through `RetrievalMiddleman`; analytics
  reads its normalized `user_profile.json`, never a generated resume as source evidence.
- `/developer/*` visualizers remain separate development aids and are never embedded as product UI.
- Job analytics labels live, cached, and synthetic data distinctly and always exposes provenance,
  geography, freshness, unknown coverage, and sample size.

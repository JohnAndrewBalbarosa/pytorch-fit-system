---
logic_id: development.local-auto-access
code_paths:
  - development/local-access
  - development/prefect-dashboard/build-dashboard.mjs
  - development/local-workspace/processes.mjs
  - development/local-workspace/setup.mjs
  - development/local-workspace/start.mjs
tests:
  - tests/node/workspace-boundaries.test.mjs
feedback_events:
  - local_access.role_ready
  - local_access.failed
related_logic: []
---
# Local Automatic Access

The local workspace may open separate visible member and officer browser profiles and authenticate
only the deterministic synthetic accounts against loopback Supabase. This convenience is unavailable
in production, Vercel, and CI and never bypasses the normal Supabase password/session boundary.

## States and contract

Each role moves through `launching -> authenticating -> ready` or `failed`. Inputs are an approved
loopback portal origin, the local Supabase URL and anonymous key, a synthetic account, a persistent
role-specific browser profile, and an installed browser executable. A ready role produces a visible
browser on its role destination and logs the final URL; a failure throws with a bounded local error
and leaves the other production boundaries unchanged.

## Invariants

- The visible browser uses the native window viewport (`viewport: null`); it must not retain
  Playwright's fixed `1280x720` emulation after the window is maximized.
- Launch requests a maximized window while remaining usable when the window manager ignores that
  hint. Resizing the visible browser must resize the page viewport, keep the page scrollbar at the
  browser content edge, and avoid an unused black strip.
- Member and officer sessions use separate persistent profiles and cookies scoped to their exact
  loopback origins. Hostname selection never grants officer authority.
- After both roles are ready, the watcher retains an active event-loop handle until `SIGINT` or
  `SIGTERM`; it must not rely on an unresolved top-level promise that Node may terminate as an
  unsettled module evaluation.
- Missing local auth state, an unavailable browser, or a non-loopback/production runtime fails
  closed. Credentials, cookies, and tokens are never written to feedback output.
- The integrated development launcher always selects the `local` product-data provider. Loopback
  Supabase remains available for normal authentication, while product views use deterministic
  synthetic data; production continues to require the `supabase` provider.
- `npm run dev` defaults to the local synthetic product provider. Supabase-backed product reads are
  opt-in only with `npm run dev -- --supabase`; both modes still authenticate against the local
  loopback Supabase instance.
- Local workspace child processes resolve Node package-manager launchers for the host platform.
  Windows invokes npm's JavaScript entry points through Node, avoiding unsupported direct batch-file
  spawning; POSIX hosts retain `npm`/`npx`.
- Supabase startup output is not copied to local logs because its status payload contains keys;
  bounded lifecycle messages and stderr remain available for diagnosis.

## Feedback and failure modes

`local_access.role_ready` is represented by the existing bounded `<role> ready: <url> (<email>)`
local console line. Authentication, browser launch, and navigation failures surface as
`local_access.failed` through the thrown local launcher error; they must never silently disappear or
fall back to a production identity or URL.

## Acceptance tests

- The browser option contract sets `headless: false`, `viewport: null`, and includes
  `--start-maximized` without weakening the local-runtime and loopback gates.
- A maximized headed-browser probe reports a page `innerWidth` that follows the browser content
  width instead of remaining at Playwright's default `1280px`.
- Existing workspace-boundary tests continue to reject production, Vercel, CI, HTTPS, and
  non-loopback automatic access.
- The auto-login watcher uses a referenced keepalive handle and closes both browser contexts when
  the process receives a stop signal.
- The integrated development launcher pins `PYTORCH_FIT_DATA_PROVIDER` to `local`.
- The default launcher mode is local, and the Supabase product provider requires an explicit flag.
- Workspace setup and startup resolve npm-family commands to executable Windows Node entry points.
- Prefect dashboard build commands follow the same cross-platform npm launcher contract.

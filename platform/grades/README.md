# FEU Tech grades integration

Deterministic TypeScript port of `JohnAndrewBalbarosa/GradesFeu` for the PyTorch FIT platform.

- `scraper.ts`: fixed FEU SOLAR selectors, stored-session reuse, headless by default.
- `logic.ts`: weighted CGPA, term ordering, and honors reachability.
- `resume-injection.ts`: private grade data to optional provenance-bearing resume highlights.
- No LLM or DOM-learning planner is used because FEU SOLAR is a known integration.

If authentication expires, the headless scraper stops with `FeuSessionRequiredError`. Refresh the
legitimate Playwright storage state visibly, then rerun headlessly. Verification is never bypassed.

`session-login.ts` attaches to a user-visible Chrome/Chromium instance through Chrome DevTools
Protocol (`CHROME_CDP_URL`, default `http://127.0.0.1:9222`) and saves storage state after the
legitimate Microsoft/FEU login completes.

Run the `tsx` entry points through the root workspace scripts, which resolve dependencies from
`apps/portal`. `run.ts` performs the normal headless scrape
and writes a normalized academic snapshot JSON.

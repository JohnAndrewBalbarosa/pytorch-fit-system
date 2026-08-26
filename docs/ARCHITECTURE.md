# Repository architecture

The repository is feature-first at the domain level and boundary-first inside `domains/`.

```text
apps/portal/            Next.js and Vercel entry points
domains/client/         browser-visible feature components and interactions
domains/server/         Vercel-only feature operations
domains/protocol/       shared request, response, event, and validation shapes
design-system/          reusable visual primitives
supabase/               database migrations, RLS, and deterministic local seed
development/            local access, Process Lab, and patched Prefect dashboard
tests/                  cross-package verification
docs/                   architecture and operating guidance
src/                    existing Python reference pending TypeScript parity ports
```

## Naming

Folders provide context; filenames state the action or artifact without repeating their parents:

```text
domains/client/events/registration/collect-input.tsx
domains/server/events/registration/validate-request.ts
domains/protocol/events/registration/request-shape.ts
```

Formal names are used only when the behavior fits: `status-transitions`, `dependency-graph`,
`questionnaire-tree`, `capability-set`, and `confirmation-ledger`.

## Dependency direction

```text
apps/portal  -> client + server + protocol + design-system
client       -> protocol + design-system
server       -> protocol
protocol     -> no client/server implementation
production   -X-> development
```

The three domain branches are private npm workspace packages. Their exports expose feature names,
not implementation files. This is a build boundary, not three deployments.

## Web topology

One Next.js build serves two hostnames. The hostname selects the presentation; the authenticated
Supabase profile decides permission. A member cannot gain officer access by opening the officer
hostname. Unknown hosts default to member behavior.

Browser code uses Supabase directly only for Auth with the public anon key. Application database
reads and writes use same-origin Vercel route handlers; privileged keys remain server-only and RLS
remains mandatory.

The existing Python package stays in place until all feature-by-feature TypeScript replacements pass
parity tests. Prefect Python is a development-only exception and never enters the Vercel artifact.

# WUWF.org — the public site

The public website and CMS of WUWF Public Media, replacing the Grove platform. One Next.js app: Payload CMS
(admin, content model, API) and the public frontend live together. Built on Payload's Website template at
the **v3.92.1 release tag**.

Read first: `CLAUDE.md` (rules and decisions), `ROADMAP.md` (what is done, what is next, what went wrong
before), `ARCHITECTURE.md` (how it fits together), `ANALYTICS.md` (the event spec). Repository-wide rules
are in the root `CLAUDE.md`.

## Status

Milestone 1 is in progress. See `ROADMAP.md` for the exact state. In short: the content model, staff roles,
underwriting resolution and the shared packages are built and tested; the public pages, listening flow,
sign-in with the Portal, public accounts and analytics are not yet.

## Requirements

- **Node ^22.23.4 or >=24.22.1** (Payload 3.92's own requirement; pnpm warns on anything older).
- **pnpm 10** (the version is pinned in the root `package.json`; use Corepack).
- **PostgreSQL 16** — via Docker (`pnpm db:up`) or any local server.

## Run it locally

From the repository root:

```bash
pnpm install
cd apps/site
cp .env.example .env.local     # then set PAYLOAD_SECRET (openssl rand -hex 32)
pnpm db:up                     # Postgres 16 on localhost:5433 (docker compose)
pnpm dev                       # http://localhost:3000, admin at /admin
```

The first user you create at `/admin` becomes the **local break-glass administrator** and is given every role.
Everyone else is provisioned from the Portal (not built yet; see `ROADMAP.md`).

No production credentials are needed. Without Docker, point `DATABASE_URL` at any local Postgres.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | This app's own Postgres. Locally the compose database; hosted, the site's **own** Supabase project (use the pooled connection on Vercel). Never the Portal's projects. |
| `PAYLOAD_SECRET` | Encrypts Payload sessions. At least 32 random characters. |
| `NEXT_PUBLIC_SERVER_URL` | Public origin, no trailing slash. Used for links, CORS and previews. |
| `CRON_SECRET` | Authenticates scheduled-job requests. |
| `PREVIEW_SECRET` | Validates draft preview requests. |
| `TEST_DATABASE_URL` | Optional. Integration tests default to `wuwf_site_test` on localhost and **refuse any non-local host**. |

Variables for the Portal contracts (signing secrets, one per channel and direction, each at least 32
characters), Supabase Auth and object storage are specified in `ARCHITECTURE.md` and added as each is built.

## Commands

| Command | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm lint` | ESLint (5 known errors in starter components; see `ROADMAP.md`) |
| `pnpm test:int` | Vitest: unit tests in `src/**/*.test.ts` and integration tests in `tests/int` |
| `pnpm test:e2e` | Playwright (the starter's tests; ours are not written yet) |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` after changing a collection |
| `pnpm generate:importmap` | Regenerate the admin import map after adding a custom component |
| `pnpm payload migrate:create <name>` | Create a migration from the current config |
| `pnpm payload migrate` | Apply committed migrations |
| `pnpm db:up` / `pnpm db:down` | Start / stop the local Postgres |

After changing a collection: `generate:types`, `generate:importmap`, `migrate:create`, and commit all three.

## Database

PostgreSQL through `@payloadcms/db-postgres`. In development Payload **pushes** schema changes to the local
database. In production it runs **only committed migrations** in `src/migrations`. A migration is not done
until it has been applied to an empty database and the result compared with the push (the initial one was:
671 columns, 379 indexes, 127 foreign keys, identical). Never run a destructive operation without being asked.

## Tests

- **Unit** (pure logic, no database): underwriting resolution, the Payload-to-resolver mapper, slug helpers.
- **Integration** (`tests/int`): Payload's Local API against a real Postgres, covering the Coastal Futures /
  Example Foundation scenario and access control (the public cannot read agreements, sponsors or users;
  drafts stay hidden; nobody can grant themselves a role). They create and delete their own rows.
- The shared packages under `packages/` carry their own tests (`pnpm test:packages` from the root).

## Deployment

Its own Vercel project with **Root Directory `apps/site`**, its own Supabase project, and Node pinned to a
version Payload supports. Production runs committed migrations before the new build takes traffic. This has
not been deployed yet. Do not deploy to production, create paid services or send live communications without
authorization.

# WUWF Tools Portal

Internal tools portal for WUWF Public Media — shared authentication, navigation, user
approval/invitation, and access control for a small set of purpose-built internal tools
(Editorial Planning, and later Remote Interview, Shared Clip Library, Audience Listening).

This repository is the **portal foundation** milestone: application shell, auth, the tool
registry, and admin screens. It is not, and is not meant to become, a general-purpose
newsroom platform — see `CLAUDE.md` for the scope and architecture rules this project
follows.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · Supabase (Postgres, Auth,
Row Level Security) · Vercel · Vitest

## Local development

Requires Node 20+, the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
and Docker (for the local Supabase stack).

```bash
npm install
supabase start          # starts local Postgres/Auth/Storage; prints the local publishable key + URL
cp .env.example .env.local
# paste the URL/publishable key `supabase start` printed into .env.local
npm run dev
```

Visit `http://localhost:3000`. The seed data (`supabase/seed.sql`, applied automatically
by `supabase start`/`supabase db reset`) creates six sample profiles covering every
account status (active, invited, pending, disabled) — see the comments in that file for
emails. Local Supabase Auth emails land in Inbucket at `http://127.0.0.1:54324`; magic
links and invite emails show up there instead of a real inbox.

To reset the local database to a clean seeded state at any point:

```bash
supabase db reset
```

### Common commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run format` | Prettier, write mode |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from a running local Supabase instance |

## Database workflow

Schema, RLS policies, and Postgres functions all live in `supabase/migrations/*.sql` and
are tracked in source control — there is no schema drift that isn't in git. To make a
schema change:

1. `supabase migration new <name>` (or add a new timestamped file by hand)
2. Write the SQL, including any RLS policy changes the new table/column needs
3. `supabase db reset` locally to verify it applies cleanly against a fresh database
4. Regenerate types: `npm run db:types`
5. Apply to the non-production project first, verify, then apply to production

Never edit an already-applied migration file; add a new one.

## Environments

Three environments, two Supabase projects (WUWF org):

| Environment | Vercel | Supabase project |
| --- | --- | --- |
| Local | `next dev` | Local `supabase start` stack |
| Preview | Vercel preview deployments (per branch/PR) | `wuwf-tools-portal-preview` — seeded with sample data, safe to reset |
| Production | Production Vercel deployment (`tools.wuwf.org`) | `wuwf-tools-portal` — real data only |

Preview deployments must never hold production secret-key credentials or point at the
production database — set preview env vars against the `-preview` project only.

### One-time setup still needed in each dashboard

Both Supabase projects and this repository already exist; two things aren't reachable
through automation and need a human in each dashboard once:

**Vercel** (`vercel.com` → WUWF team):
1. Import this GitHub repository as a project (enables automatic preview deployments per
   PR and a production deployment on pushes to `main`).
2. Set environment variables — Production env pointing at `wuwf-tools-portal`, Preview env
   pointing at `wuwf-tools-portal-preview`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — from that
     Supabase project's Settings → API (publishable key — safe to paste in, not secret)
   - `SUPABASE_SECRET_KEY` — same page, secret key (**sensitive** — mark it as an
     encrypted env var)
   - `NEXT_PUBLIC_SITE_URL` — the deployment's own URL (`https://tools.wuwf.org` in
     Production)
3. Point the `tools.wuwf.org` domain at the Production environment.

**Supabase Auth** (each project's dashboard → Authentication → URL Configuration):
- Site URL = that environment's `NEXT_PUBLIC_SITE_URL`
- Redirect URLs include `<site-url>/auth/callback`

Everything else — schema, RLS, seed data, the tool registry — is already applied to both
Supabase projects via migrations.

## Authorization model

See `CLAUDE.md` for the full explanation. In short: Supabase Auth (magic link only, no
public self-signup) + Postgres Row Level Security as the enforcement boundary on every
table, plus server-only checks (`src/lib/auth/authz.ts`) in front of every privileged
page/action. Privileged writes are logged to `audit_events` (viewable at
`/admin/audit`).

## Testing

`npm test` runs Vitest against the pure logic modules (`src/lib/**/*.test.ts`) —
authorization predicates, tool-card state derivation, and email validation. These are
unit tests of business logic, not a substitute for testing the real Supabase RLS
policies; do that by exercising the app against the local Supabase stack.

# WUWF Tools Portal

Internal tools portal for WUWF Public Media — shared authentication, navigation, user
approval/invitation, and access control for a small set of purpose-built internal tools
(Editorial Planning, Sourcework, Remote Interview, Audience Listening, Roadmap, and
Academic Partnerships).

This repository contains the **portal foundation** (application shell, auth, the tool
registry, and admin screens) plus the tools built on it:

- **Editorial Planning** — a pitch backlog, a configurable submission form and scoring
  rubric, and weekly planning meetings with independent reviewer scoring, ranked agendas,
  and recorded decisions (`docs/editorial-planning-design.md`).
- **Sourcework** — upload, transcribe, correct, excerpt, and search interview audio
  (`docs/transcription-workspace-design.md`, `docs/sourcework-design.md`).
- **Remote Interview** — record a remote guest at full quality from their own browser
  (`docs/remote-interview-design.md`, `docs/remote-interview-technical-assessment.md`).
- **Audience Listening** — publish a short set of questions as a public page or a Grove
  embed, collect recorded answers from listeners, review them, and hand individual
  answers to Sourcework (`docs/audience-listening-design.md`). One of two tools with a
  public, account-less write surface; that document's §6 explains the security model it
  needs as a result.
- **Roadmap** — file a request, vote and comment on other people's, and follow a
  curator-managed status through to shipped (`docs/roadmap-design.md`).
- **Academic Partnerships** — a public inquiry form for the WUWF Applied Media Partnership
  Program (`/partner`, also embeddable in Grove) feeding a staff-run kanban pipeline from
  New through Active to Completed (`docs/academic-partnerships-design.md`). The other
  tool with a public, account-less write surface — a narrower one than Audience
  Listening's, with no session at all, not even an anonymous one; that document's §3
  explains why.

It is not, and is not meant to become, a general-purpose newsroom platform — see
`CLAUDE.md` for the scope and architecture rules this project follows.

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

| Command              | What it does                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`        | Start the Next.js dev server                                                  |
| `npm run build`      | Production build                                                              |
| `npm run lint`       | ESLint                                                                        |
| `npm run typecheck`  | `tsc --noEmit`                                                                |
| `npm test`           | Run the Vitest suite once                                                     |
| `npm run test:watch` | Vitest in watch mode                                                          |
| `npm run format`     | Prettier, write mode                                                          |
| `npm run db:types`   | Regenerate `src/lib/database.types.ts` from a running local Supabase instance |
| `npm run db:check`   | Verify every migration is recorded as applied to both Supabase projects      |

## Database workflow

Schema, RLS policies, and Postgres functions all live in `supabase/migrations/*.sql` and
are tracked in source control — there is no schema drift that isn't in git. To make a
schema change:

1. `supabase migration new <name>` (or add a new timestamped file by hand)
2. Write the SQL, including any RLS policy changes the new table/column needs
3. `supabase db reset` locally to verify it applies cleanly against a fresh database
4. Regenerate types: `npm run db:types`
5. Apply to `wuwf-tools-portal-preview`, and verify there
6. Apply to `wuwf-tools-portal`, and verify there
7. Record both dates in [`supabase/migrations/APPLIED.md`](supabase/migrations/APPLIED.md)
8. `npm run db:check`

Never edit an already-applied migration file; add a new one.

**Steps 5–8 are the ones that get skipped, and skipping them is invisible.** Nothing in
`npm run build`, the test suite, or a Vercel deploy applies a migration — so a merged
migration that was never run ships a feature whose tables don't exist, which looks like a
UI bug rather than a missing deploy step. `APPLIED.md` is the record of what has actually
been applied where, and `npm run db:check` fails on a migration with no row, a row naming
a file that doesn't exist, or a row where either environment isn't a date. It needs no
credentials and no network: it checks that a human did the work and wrote it down, not
that the database agrees. Reconciling the ledger against a project's live history is a
manual step, described in `APPLIED.md`.

## Environments

Three environments, two Supabase projects (WUWF org):

| Environment | Vercel                                          | Supabase project                                                     |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Local       | `next dev`                                      | Local `supabase start` stack                                         |
| Preview     | Vercel preview deployments (per branch/PR)      | `wuwf-tools-portal-preview` — seeded with sample data, safe to reset |
| Production  | Production Vercel deployment (`tools.wuwf.org`) | `wuwf-tools-portal` — real data only                                 |

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
   - `ASSEMBLYAI_API_KEY` and `TRANSCRIPTION_WEBHOOK_SECRET` — Sourcework's ASR provider
     (**sensitive** — mark both encrypted); see `.env.example` for details
   - `MISTRAL_API_KEY` — Sourcework's document OCR fallback for PDFs whose own embedded
     text isn't adequate (**sensitive** — mark encrypted); native PDF text extraction needs
     no key and handles most PDFs without it — see `.env.example` and
     `docs/sourcework-design.md` §8.6
   - `DAILY_API_KEY` — Remote Interview's call provider (**sensitive** — mark encrypted).
     Required for the studio and guest call to work at all; without it, room creation and
     meeting tokens fail outright. Get it from the Daily dashboard for the account this
     deployment should use.
   - `DAILY_RECORDINGS_BUCKET_NAME`, `DAILY_RECORDINGS_BUCKET_REGION`,
     `DAILY_RECORDINGS_ASSUME_ROLE_ARN` — optional. Configures the raw-tracks cloud-backup
     recording's destination bucket; unset, cloud backup is simply skipped with a visible
     "not configured" status. See `.env.example` for the caveat about whether Supabase
     Storage's S3-compatible endpoint actually works as this destination — unverified, and
     the first thing to test once Daily access exists.
   - `RESEND_API_KEY` and `RESEND_FROM_EMAIL` — the portal's transactional email sender
     (`src/lib/email.ts`), currently used only by Academic Partnerships' email actions
     (**sensitive** — mark `RESEND_API_KEY` encrypted). Optional: unset, sending fails
     clearly and the tool falls back to its mailto:/copy-to-clipboard draft, the same as
     before this was added. `RESEND_FROM_EMAIL` must be a verified sender/domain in the
     Resend account this deployment uses.
3. Point the `tools.wuwf.org` domain at the Production environment.

**Supabase Auth** (each project's dashboard → Authentication):

- URL Configuration: Site URL = that environment's `NEXT_PUBLIC_SITE_URL`; Redirect URLs
  include `<site-url>/auth/callback`
- Sign In / Providers: enable **Anonymous sign-ins**. Two tools need it, and neither
  works at all without it:
  - Remote Interview's guest join flow (`/join/[token]`) — a guest has no portal
    account, so that route binds an anonymous Supabase user to their `ri_participants`
    row instead (`docs/remote-interview-design.md`, "Guest identity"). Unset, opening a
    guest link fails at the sign-in step.
  - Audience Listening's public participation page (`/listen/[publicId]`) — a
    participant's anonymous session is what owns their submission and permits their
    direct-to-storage upload (`docs/audience-listening-design.md` §6). Unset, pressing
    Begin fails; reading the questions still works, since that is the one thing `anon`
    may do.

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

# CLAUDE.md

Guidance for Claude Code (and future human developers) working in this repository.

## Product scope

WUWF Tools Portal (`tools.wuwf.org`) is a shared access/administration layer for a small,
fixed set of internal WUWF tools — not a general-purpose newsroom platform. It provides:
authentication, invitation/approval-based access, role-based authorization, a tool
registry, a dashboard, and admin screens for user/tool management.

Each tool (Editorial Planning, Transcription Workspace, Remote Interview, Audience
Listening) is its own focused application area with its own schema. The portal's job ends
at "Open Tool" — do not build cross-tool abstractions, a plugin framework, or speculative
integrations. When in doubt, keep scope narrow.

The registry once also carried a **Shared Clip Library** row. It has been retired: the
Transcription Workspace absorbed it, since its cross-project clip and search views _are_
the clip library (see `docs/transcription-workspace-design.md` §3F). Don't reintroduce it.

## Current milestone: portal foundation + Editorial Planning

This repo implements the portal foundation (app shell, auth, profiles, platform roles,
tool registry, dashboard, admin, RLS) plus the first real tool: **Editorial Planning**
(pitch backlog, configurable submission form and rubric, weekly meetings with
independent scoring, ranked agendas, and recorded decisions). Its design rationale
lives in `docs/editorial-planning-design.md` — read it before changing editorial
workflow or schema. **Do not build the Audience Listening tool** without an explicit
instruction to start that phase — a separate milestone with its own schema under its own
route group. (Remote Interview's guardrail has been lifted — see below.)

**Remote Interview: design is done, Phase 3 (prototype) is done, Phase 4 slices 1-4
(Foundation; Preflight and guest join; the studio; completion, recovery, and delivery)
are done, and slice 5 (handoff — creating a `tw_projects` row from a track) is
next — proceed with it without asking again.**
Two design documents: `docs/remote-interview-design.md` (the product — capture only:
local lossless per-participant recording, a cloud backup of the call via Daily's
raw-tracks recording, chunked upload with recovery, and handoff to the Transcription
Workspace) and `docs/remote-interview-technical-assessment.md` (the existing-system
inventory, building-block evaluation, deployment, and risks — including a vendor reversal
from an earlier LiveKit recommendation to Daily, and Phase 3's results). Where they
conflict, the assessment is newer. Read both before touching any of it — and note two
findings there that contradict older docs: **there is no canonical audio-file table** in
this database (media metadata is columns on `tw_projects`), and **there is no resumable
upload infrastructure** (the Transcription Workspace uses a single-request `.upload()`,
despite its design doc saying TUS). Neither tool has a job queue, notification layer, or
error reporting.

Phase 3's throwaway prototype (`prototype/remote-interview-poc/` — not product code, its
own `package.json`, see its README) ran for real (Chromium's fake-audio-device flags let a
headless browser record without hardware) and validated the two riskiest assumptions:
chunked WAV assembly reassembles correctly, and the OPFS-buffer-then-upload-then-delete-
on-ack sequence survives a crash/reload with neither data loss nor duplication. Full
results, and what's still open (Daily's raw-tracks integration itself, a live two-person
call, real network flakiness, and cross-machine clock alignment — the last of which needs
two physical machines and can't be done in a sandboxed session), are in the assessment
doc's "Phase 3 results" section.

**Phase 4 slice 1 (Foundation) has landed** (`docs/remote-interview-design.md` §7): the
`ri_*` migration + RLS + `private.has_remote_interview_access` (mirroring
`private.has_transcription_access`), the `remote-interview-media` storage bucket +
policies, the registry row narrowed per that doc's §2, the route segment
(`src/app/(portal)/remote-interview/`) gated by `requireToolAccess("remote-interview")`,
and the session list / create-session / join-link screens (`lib/remote-interview/`).
The migration has been written but — like every migration in this repo — is not
self-applying; confirm it's been applied to both Supabase projects before relying on the
tables existing. Before touching the migration again, read the assessment doc's Finding 4
(a real, already-characterized, non-blocking gap in this repo's own migration history,
discovered during Phase 4 prep) so it isn't mistaken for something new or accidentally
reapplied.

**Phase 4 slice 2 (Preflight and guest join) has landed**: the `/join/[token]` guest
route (`src/app/join/[token]/`, outside both `(portal)` and `(auth)` — see the design
doc's "Fit with portal conventions"), anonymous-auth binding to
`ri_participants.guest_user_id` via the security-definer `ri_bind_guest_participant()` and
`ri_guest_join_waiting_room()` functions (added in
`20260729180000_remote_interview_waiting_room.sql` — a plain RLS update policy on a
guest's own row would also let them set their own `admitted_at`, which is exactly the
self-admission bypass the design doc rules out), the preflight screen (device pick, level
meter, test recording, and the warning set from §3B — pure derivation logic in
`lib/remote-interview/preflight.ts`), the waiting room (short client-side poll for
admission — there's still no notification layer), and host admission
(`admitParticipant` in the portal route's `actions.ts`). **Anonymous sign-ins must be
enabled in both Supabase projects' dashboards** (see README.md's one-time setup list) —
without it, `signInAnonymously()` fails and no guest can join.

**Phase 4 slice 3 (the studio) has landed**: `lib/remote-interview/daily.ts`, a thin
server-only client for Daily's REST API (room creation, meeting tokens — recording
start/stop deliberately goes through the client SDK instead, see below); the host's live
screen (`src/app/(portal)/remote-interview/[id]/studio/`, host-only — no second staff
member can join a session's Daily room in this slice); the guest's in-call view
(`src/app/join/[token]/call.tsx`, replacing slice 2's "you're in" placeholder — a
deliberately smaller version of the studio per §3D, no record button); and the local
lossless capture pipeline (`lib/remote-interview/capture.ts` — `extendable-media-recorder`

- OPFS, product code following Phase 3's validated prototype pattern, `write → upload →
delete-on-ack`) shared between both via `lib/remote-interview/use-local-capture.ts`. The
  call carries **audio only** — recorded video was deliberately dropped from this slice's
  scope, consistent with §6's "must never be allowed to compromise audio reliability. If it
  threatens to, it is deferred." Recording start/stop, mint by `studio/actions.ts`, drives
  three things in lockstep: the database (session status, the reference clock, cloud-backup
  `ri_tracks` rows — `20260729190000_remote_interview_studio_rls.sql` broadens `ri_tracks`
  RLS so the host can write a guest's cloud-track row), Daily's raw-tracks recording via
  `callObject.startRecording()`/`stopRecording()` **on the client**, not a guessed REST
  endpoint (`docs.daily.co` returns 403 to automated fetches, confirmed again while building
  this slice — the REST surface used here is limited to room/token creation, which could be
  verified against the installed `@daily-co/daily-js` type definitions), and every
  participant's local capture, via a `sendAppMessage` broadcast so a guest's browser starts
  and stops in lockstep without its own record button (§3D: "Guests cannot start or stop
  recording"). Cloud backup is opt-in via three `DAILY_RECORDINGS_BUCKET_*`/
  `DAILY_RECORDINGS_ASSUME_ROLE_ARN` env vars (`.env.example`) — unset, it's skipped with a
  visible "not configured" status rather than failing recording start; **this repo still has
  no Daily account**, so the REST/SDK integration is unverified against a live one, and the
  raw-tracks S3-destination question from the assessment doc remains open. Per-participant
  status (`lib/remote-interview/call-status.ts`, pure and tested) derives from Daily
  participant/recording events plus each guest's periodic status broadcast — deliberately
  **not** connection status (§3D): a flaky network alone never marks a participant unsafe,
  only a failed local recording with no working cloud backup does. This slice's OPFS
  buffering retried a stalled upload with backoff for as long as the page stayed open, but
  did not reconstruct an in-flight track from a fresh page load after a crash or navigation
  away — slice 4 below closed that gap.

**Phase 4 slice 4 (completion, recovery, and delivery) has landed**: assembly
(`lib/remote-interview/assembly.ts`, server-only) concatenates a local track's uploaded
parts via `ffmpeg-static`'s concat demuxer, rewrites the WAV header, verifies the result is
readable (`lib/remote-interview/wav.ts`, pure and tested), and records size/duration/
checksum — host-triggered from the session detail screen's "Assemble"/"Retry assembly"
button (`assembleTrack` in the portal route's `actions.ts`), never automatic, since there's
still no job queue. Cloud-backup tracks are **not** assembled here — Daily writes those
straight to the S3 destination and this repo still has no webhook confirming delivery, so
that half of the design doc's "raw-tracks S3-destination question" remains open; only local
masters get the assemble/retry/download treatment. Resume-on-reopen
(`resumeIncompleteTracks` in `capture.ts`) runs on every mount of `useLocalCapture`: it
finds OPFS directories left over from a crash or reload, verifies each belongs to the
current participant, and drains whatever wasn't acknowledged before the interruption using
the same upload-with-retry path live capture uses — logged as a `local_track_resumed`
session event so the detail screen can label the result "recovered" rather than a plain
"complete" (`lib/remote-interview/track-status.ts`, pure and tested, also derives the
session-level `ready`/`needs_recovery`/`failed` rollup and the guest completion screen's
four exact messages from §3E). The session detail screen (`[id]/page.tsx`) now lists every
track per participant with provenance, size, duration, a per-track download (signed URL)
and a "Download all" zip (`/api/remote-interview/sessions/[id]/tracks.zip`, a route handler
for the same file-vs-data reason as the Transcription Workspace's `clips.zip`, reusing its
generic zip writer directly). One RLS migration
(`20260730160000_remote_interview_assembly_rls.sql`, applied to both projects) was needed
alongside this: assembly is host-triggered but writes into *the participant's* storage
prefix, so `ri_media_insert`/`update` needed the same host-of-session broadening slice 3
already gave `ri_tracks`.

**Phase 5 (cloud-backup video) is planned but not authorized — same guardrail as Audience
Listening: do not start it without an explicit instruction.** The design is recorded in
`docs/remote-interview-design.md` §7: video would ride the existing Daily call and cloud
backup only — deliberately **no local video capture**, which is a different and much larger
engineering problem than the WAV pipeline slice 3 built. Slice 5 (handoff) above is still
next.

**Exception: the Transcription Workspace** (`src/app/(portal)/transcription/`,
`tw_*` tables) is an explicitly-approved, in-progress milestone on top of the portal
foundation — not a placeholder. See `docs/transcription-workspace-design.md` for the
product design and phased plan before extending it; check that plan's phase
boundaries before building ahead of the current phase.

**AssemblyAI (`src/lib/transcription/providers/assemblyai.ts` and its ASR usage
elsewhere):** the API changes over time — do not rely on memorized parameter names
or model identifiers. Before writing or changing AssemblyAI-related code, check current
behavior via the `assemblyai-docs` MCP server (project-scoped in `.mcp.json` — approve
it once when prompted) or by fetching `https://www.assemblyai.com/docs/llms-full.txt`.
Prefer the official `assemblyai` SDK over hand-rolled HTTP calls.

**Search (`tw_search`, `tw_chunks`, `lib/transcription/{search,indexing,chunking,embeddings}.ts`):**
hybrid keyword + semantic search lives entirely in Postgres — FTS and pgvector merged
by reciprocal rank fusion in one `security invoker` RPC, so RLS is still the boundary.
Two rules when touching it: the embeddings key (`OPENAI_API_KEY`) is **optional** and
every path must keep working without it (chunks still build, keyword search still runs
— never make an unset key an error), and embedding failures are never fatal to the
write that triggered them. The `stale` / `embedding_stale` flags are maintained by
database triggers, so a re-embed pass is always safe to re-run.

## Architecture

- **Modular monolith.** One Next.js app, one repository. Route groups
  (`src/app/(auth)`, `src/app/(portal)`) separate concerns; individual tools get their own
  route segment and, eventually, their own schema/migrations — not a separate service.
- **Supabase is the backend.** Postgres + Auth + (later) Storage. No custom API layer —
  Server Components/Server Actions talk to Supabase directly. The handful of route
  handlers under `src/app/api/` are the deliberate exceptions, for requests an action
  can't serve: an external webhook with no user session, or a response that is a _file_
  rather than data (the transcription clip archive streams; an action would have to
  base64 it through the RSC payload). Reach for a Server Action first.
- **Row Level Security is not optional.** Every table has RLS enabled and is the real
  enforcement boundary, not a convenience layer behind app-level checks. See
  `supabase/migrations/20260722120001_rls_policies.sql`. The predicates those policies
  call (`private.is_administrator`, `private.ep_*`) live in the `private` schema so they
  are not reachable as REST endpoints — see "Authorization expectations".
- **Two Supabase clients, used deliberately:**
  - `src/lib/supabase/server.ts` — publishable key + the signed-in user's session. RLS
    applies. Use this for essentially everything.
  - `src/lib/supabase/admin.ts` — secret key, bypasses RLS. `import "server-only"`
    guards it. Use it **only** for `auth.admin.*` calls (inviting users) and verified
    external webhook handlers with no signed-in user session to act as (e.g. the
    transcription ASR webhook — see that file's comment) — nothing else. Never import it
    into a Client Component.
- **Authorization is centralized.** `src/lib/auth/authz.ts` (`requireActiveProfile`,
  `requireAdministrator`, `assertAdministrator`, `hasToolAccess`) is the only place
  platform-role/account-status checks should be written. Don't re-implement these checks
  inline in a page or action.
- **Privileged writes are server-only and audited.** Every admin action (invite, disable,
  grant/revoke tool access, edit the tool registry) is a Server Action that calls
  `logAuditEvent()` (`src/lib/audit.ts`) after it succeeds. If you add a new privileged
  action, log it the same way.

## Directory conventions

```
src/app/(auth)/            sign-in, request-access, /auth/callback — public routes
src/app/(portal)/          everything behind requireActiveProfile() (portal shell + nav)
src/app/(portal)/admin/    everything behind requireAdministrator()
src/app/(portal)/editorial/  the Editorial Planning tool (backlog, meetings, settings),
                           gated by requireEditorialAccess() from lib/editorial/access.ts
src/app/(portal)/tools/[slug]/   generic "coming soon" placeholder driven by the tools table
src/app/(portal)/transcription/  Transcription Workspace — its own route segment, gated by
                            requireToolAccess("transcription")
src/app/(portal)/remote-interview/  Remote Interview — its own route segment, gated by
                            requireToolAccess("remote-interview")
src/app/join/[token]/      Remote Interview's guest-facing join link — deliberately
                            outside both (portal) and (auth), since a guest has no
                            profile — see docs/remote-interview-design.md, "Fit with
                            portal conventions"
src/components/ui/         small shared primitives (Button, Badge, Input/Select/Textarea, Card,
                           Alert, Table) — keep generic; use these rather than re-typing
                           control/table class strings inline
src/components/            portal-specific components (nav, tool card, etc.)
src/components/editorial/  Editorial Planning display components
src/lib/supabase/          the two Supabase client factories — see above
src/lib/auth/              session lookup + authorization checks
src/lib/transcription/     Transcription Workspace's data access + pure logic (not portal-schema)
src/lib/remote-interview/  Remote Interview's data access + pure logic (tokens, storage
                           prefixes) — not portal-schema
src/lib/editorial/         Editorial Planning logic: access gates (server-only), data reads
                           (data.ts), the action failure helper (action-result.ts), plus pure,
                           tested modules (roles, scoring, staleness, form validation)
src/lib/*.test.ts          pure-logic unit tests, colocated with the module they test
supabase/migrations/       schema + RLS + functions, source of truth, never edit in place
supabase/seed.sql          local/preview-only sample data — never run against production
```

A future tool follows the Editorial Planning pattern: its own route segment, its own
migration(s) for tool-specific tables (prefixed, e.g. `ep_`), and it reuses
`tool_access`/`profiles` for authorization — it should not need portal-schema changes
beyond narrowly-scoped additive RLS policies like the ones at the end of the editorial
migration.

## Common commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` ·
`npm run format` · `npm run db:types`. Run lint, typecheck, and test before considering a
change done.

## Database workflow

New migration file per schema change (`supabase/migrations/<timestamp>_<name>.sql`),
never edit a migration that's already been applied. Include RLS policies for any new
table in the same or an immediately-following migration — a table without RLS enabled is
a bug, not an oversight to fix later. Regenerate `src/lib/database.types.ts` after schema
changes (`npm run db:types` against a local instance, or hand-update it consistently with
the migration if no local instance is running — see the note at the top of that file).

## Authorization expectations

- New pages: gate with `requireActiveProfile()` or `requireAdministrator()` from
  `lib/auth/authz.ts`, not a hand-rolled check.
- New Server Actions: call `assertAdministrator()` (or the relevant check) as the first
  line, before touching any data.
- New tables: RLS enabled, policies scoped to `auth.uid()` /
  `private.is_administrator(auth.uid())` — follow the existing pattern in
  `20260722120001_rls_policies.sql` rather than inventing a new one.
- Authorization helper functions live in the `private` schema, never `public`. They are
  `security definer` (they read `profiles`/`tool_access` past RLS) and must stay
  `execute`-able by `authenticated`, because a policy expression runs as the querying
  user — revoking that permission makes every policy calling it fail outright. `private`
  is not in PostgREST's exposed schemas, so placement, not permission, is what keeps them
  off the API. See `20260724120000_private_authz_functions.sql`.
- Tool-specific roles (e.g. "Editor" for Editorial Planning) are free-text on
  `tool_access.tool_role` and interpreted by that tool alone — the portal does not
  understand or enforce them.

## Security requirements

- Never expose `SUPABASE_SECRET_KEY` to client code. It's only ever read inside
  `lib/supabase/admin.ts`.
- Never bypass RLS for convenience — if a query needs data RLS is blocking, that's a sign
  the policy is wrong or the check belongs in a Server Action, not a reason to reach for
  the admin client.
- Don't rely on hiding a button/link as the only access control — the RLS policy or
  server-side check is the actual boundary; UI hiding is a courtesy on top of it.
- Disabling a user sets `account_status = 'disabled'`; nothing about access ever deletes
  a `profiles` row.

## Testing expectations

Pure logic (authorization predicates, validation, state-derivation helpers like
`getToolCardState`) gets a colocated `*.test.ts` and should stay dependency-free enough to
run under Vitest without mocking Supabase. Don't add heavier test infrastructure
(Playwright, a test Supabase container, etc.) without a concrete need — that's a call to
make explicitly, not by default.

## Rules for making changes

- Inspect the relevant existing file(s) before editing; match existing patterns rather
  than introducing a new one for the same problem.
- Keep changes narrowly scoped to what was asked. Don't refactor unrelated code, rename
  things "while you're in there," or add abstractions for a single current use.
- Never discard a Supabase `error`. A read that falls back to `[]` and a write that
  redirects as though it succeeded both render exactly like a healthy screen, so a real
  outage looks like a UI bug — that is how an unapplied migration once passed for "the
  settings aren't configurable". Reads go through `unwrapRead()` (throws, caught by the
  route's `error.tsx`); writes go through `failIfError()` / `failWith()` from
  `lib/editorial/action-result.ts`, which bounce back with `?error=` for the screen to show.
- Migrations in `supabase/migrations/` are not self-applying. After adding one, apply it to
  the Supabase projects (preview first, then production) and confirm the tables exist —
  a migration that only lives in the repo ships a tool that silently does nothing.
- Run `npm run lint`, `npm run typecheck`, and `npm test` before calling a change done.
- Update this file and/or README.md when you change architecture, directory conventions,
  or the local/deploy workflow — not for routine feature work.
- Don't add a major dependency without a specific reason it's needed (and note that
  reason in the commit/PR description) — this project deliberately runs on a small
  dependency set.
- End each implementation task with a short summary of what changed and anything left
  unresolved.

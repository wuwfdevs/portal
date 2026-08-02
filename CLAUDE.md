# CLAUDE.md

Guidance for Claude Code (and future human developers) working in this repository.

## Product scope

WUWF Tools Portal (`tools.wuwf.org`) is a shared access/administration layer for a small,
fixed set of internal WUWF tools — not a general-purpose newsroom platform. It provides:
authentication, invitation/approval-based access, role-based authorization, a tool
registry, a dashboard, and admin screens for user/tool management.

Each tool (Editorial Planning, Sourcework, Remote Interview, Audience
Listening, Roadmap) is its own focused application area with its own schema. The portal's
job ends at "Open Tool" — do not build cross-tool abstractions, a plugin framework, or
speculative integrations. When in doubt, keep scope narrow.

The registry also carries rows for tools that don't exist: `status = 'proposed'` means an
idea somebody filed on the Roadmap, so requests can gather under it. That is **not** a
plugin system or a way to register a tool without writing one — a proposed row has no
route, no schema, and no access to grant. Real registry rows still come from a migration
alongside the code that implements them.

The registry once also carried a **Shared Clip Library** row. It has been retired: the
Transcription Workspace absorbed it, since its cross-project clip and search views _are_
the clip library (see `docs/transcription-workspace-design.md` §3F). Don't reintroduce it.

## Current milestone: portal foundation + Editorial Planning

This repo implements the portal foundation (app shell, auth, profiles, platform roles,
tool registry, dashboard, admin, RLS) plus the first real tool: **Editorial Planning**
(pitch backlog, configurable submission form and rubric, weekly meetings with
independent scoring, ranked agendas, and recorded decisions). Its design rationale
lives in `docs/editorial-planning-design.md` — read it before changing editorial
workflow or schema. (The guardrails against Remote Interview and Audience Listening have
both been lifted — see below.)

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
alongside this: assembly is host-triggered but writes into _the participant's_ storage
prefix, so `ri_media_insert`/`update` needed the same host-of-session broadening slice 3
already gave `ri_tracks`.

**Phase 5 (cloud-backup video) is planned but not authorized — do not start it without an
explicit instruction.** The design is recorded in
`docs/remote-interview-design.md` §7: video would ride the existing Daily call and cloud
backup only — deliberately **no local video capture**, which is a different and much larger
engineering problem than the WAV pipeline slice 3 built. Slice 5 (handoff) above is still
next.

**Audience Listening: milestone 1 has landed** — the guardrail against building it is
lifted. Read `docs/audience-listening-design.md` before touching any of it. A reporter
creates a **query** (a public listening initiative), gives it one to five ordered
questions, publishes it as a standalone page or a Grove iframe embed, and reviews the
grouped **submissions** and their individual audio **answers** here; each answer can be
handed individually to the Transcription Workspace. Tables are `al_*`
(`20260730170000_audience_listening.sql`), the internal route segment is
`src/app/(portal)/audience-listening/` gated by `requireToolAccess("audience-listening")`,
and the public route is `src/app/listen/[publicId]/` (plus `/embed`), outside both
`(portal)` and `(auth)` for the same reason `/join/[token]` is.

Three things about it are load-bearing and easy to break by accident:

1. **`al_*` table RLS is staff-only, and the public surface is seven `security definer`
   functions** (`al_public_query`, `al_start_submission`, `al_participant_progress`,
   `al_reserve_answer`, `al_complete_answer`, `al_save_participant_details`,
   `al_finalize_submission`). RLS is row-level and these rows are half public, half
   internal — the same `al_queries` row holds the public title and the internal notes, and
   column-level grants can't help because an anonymous participant and a staff reporter are
   both `authenticated`. Do **not** add a participant-facing RLS policy to an `al_*` table;
   extend the function list instead. Storage is the one deliberate exception (uploads go
   browser → Storage directly), scoped to the object prefix of an in-progress submission
   the caller owns. That exception has to include `select`, not just `insert`/`update`:
   this tool's upload always passes `upsert: true` (a redo overwrites the same fixed
   object key rather than orphaning the first attempt), and `storage-js` requires `select`
   on `storage.objects` to upsert at all — a staff-only `select` policy broke every
   participant upload, including first-time ones, with "new row violates row-level
   security policy for table 'objects'" (fixed by `al_media_select_own` in
   `20260730180000_audience_listening_media_select.sql`).
2. **Answers snapshot their question.** `question_prompt`/`question_position`/
   `question_required` are copied onto `al_answers` by `al_reserve_answer()` from
   `al_questions` — never supplied by the client. Wording stays editable after submissions
   exist; removal and reordering do not.
3. **"Automatic" transcription is automatic _eligibility_, not background processing.**
   There is still no job queue in this repo, so finalizing a submission on an `automatic`
   query marks its answers `queued` and a staff member drains them in one click. Don't
   describe it as unattended.
4. **The public flow's session lives in `localStorage`, not a cookie — deliberately, not
   an oversight.** `lib/audience-listening/public-client.ts` and `participant-client.ts`
   exist because a cookie set inside this route's cross-origin Grove iframe embed is a
   third-party cookie and does not survive the round trip back to the server (confirmed in
   production: the first authenticated call after `signInAnonymously()` succeeded, the next
   one — a separate request — came back "permission denied" because the browser never sent
   the cookie). Every write in the public flow goes through the browser directly with this
   dedicated client; do not route a new one through a Server Action using the normal
   cookie-based `lib/supabase/server.ts`/`client.ts` pair, or it will silently work in local
   dev and preview (same-origin, no third-party cookie problem) and fail only in a real
   embed.

The handoff reuses `startTranscriptionForProject()`, which moved out of
`src/app/(portal)/sourcework/actions.ts` into `src/lib/transcription/ingest.ts` so both
tools call one place — there is no second ASR pipeline, webhook, or transcript table.
Anonymous sign-ins must be enabled in both Supabase projects (already required by Remote
Interview, now required by a second tool).

**Exception: Sourcework** (`src/app/(portal)/sourcework/`,
`tw_*`/`sw_*` tables) is an explicitly-approved, in-progress milestone on top of the portal
foundation — not a placeholder. See `docs/transcription-workspace-design.md` for the
product design and phased plan before extending it; check that plan's phase
boundaries before building ahead of the current phase.

**Sourcework (Phases 1–3b landed; Phases 4–6 are a roadmap, not authorized to
start without their own design doc first — see below):** the Transcription
Workspace's data model has been generalized underneath its unchanged UI. Read
`docs/sourcework-design.md` before touching any of `sw_*` or the transcription
tables it rekeyed. In short: **Source** (`sw_sources` — immutable original
media, one recording per row) and **Project** (`tw_projects` — the work that
references sources, many-to-many via `sw_project_sources`) are now different
objects with different lifetimes, closing a real gap the old 1:1
`tw_projects` model had (the same interview mattering to more than one story
over time). The transcript generalized into **Representation**
(`sw_representations`, kind=`transcript` today) — `tw_segments`/`tw_speakers`/
`tw_chunks` are keyed by `representation_id`, not `project_id`. `tw_clips`
was folded directly into `sw_source_excerpts` (adds `source_id`, nullable
`representation_id`) — not kept as a parallel legacy table. `tw_projects`
itself shrank to `title`/`description`/`created_by` — no `status` or
`media_*` columns; `lib/transcription/projects.ts`'s `computeProjectStatus()`
derives the same four UI states from a source's upload status and its
transcript representation's status instead. `interview_date` moved to
`sw_sources` (a fact about the recording, not the project). Two design calls
worth knowing before extending this: transformations (OCR, translation) are
**developer-authored pipelines a user invokes in sequence**, not a declarative
type-checked composable graph — don't build a pipeline planner without a
concrete need for one; and cross-tool project unification (Editorial
Planning, Audience Listening) is deliberately deferred to Phase 6, a security
review of those tools' RLS models, not a mechanical rename.

**Phase 3a (Source Library and multi-source Project UI) has landed** — the
design in `docs/sourcework-design.md` §7 is now built, not just proposed. A
**Source Library** tab at `/sourcework?tab=sources` (`lib/transcription/
projects.ts`'s `listSources()`, `components/transcription/source-library.tsx`)
browses every `sw_sources` row independent of any project, and **Source
Detail** (`/sourcework/sources/[id]`, `getSourceDetail()`) renders the same
working surface (player/transcript/clip rail, or — since Phase 3b — a PDF
viewer/text pane) the project workspace shows for that source, plus the
projects that reference it — the first place any of that was reachable
without going through a project. There is no representation-chain diagram;
see `docs/sourcework-design.md` §7.2's correction and §8.5. The
project workspace (`/sourcework/[id]`) gained a **source pill row**
(`[id]/source-pill-row.tsx`) above the transcript: one pill per attached
source (inert with the one source every project has today), a
"+ Reference another source" picker (`[id]/attach-source-modal.tsx`,
`[id]/source-actions.ts`'s `attachSourceToProject`/`listAttachableSources`,
no confirmation step — a deliberate product call, not an oversight), and
`?source=<id>` to switch which pill's transcript/media/excerpts the
workspace shows. `sw_project_sources`'s Phase 1 RLS policy (`for all` for
any tool member) already covered the new insert, so **no migration shipped
with this phase**. Two correctness fixes rode along, both about acting on
the _active_ source rather than always "the" project's primary one: clip
creation now takes an explicit `sourceId`/`representationId`
(`[id]/clip-actions.ts`'s `createClip`), and `startTranscriptionForProject`
(`lib/transcription/ingest.ts`) now takes a `representationId` directly
instead of re-deriving the primary source's — retrying a failed _second_
source used to silently re-kick the first one instead. Project-wide actions
that don't (yet) need per-source targeting — upload completion, reindex, the
clips.zip export, project deletion's cascade check — were deliberately left
on `getPrimarySourceForProject`, unchanged.

**Phase 3b (PDF documents and a document-processing pipeline) has landed** —
`docs/sourcework-design.md` §8 is the design, now built. A new source kind
`document` (`sw_sources.kind`) and representation kind `document_text`
(`sw_representations.kind` — deliberately not `ocr_text`, see §8.3) join the
existing audio/video ones; PDFs upload to the same `transcription-media`
bucket at the same `sourceObjectPath` convention as audio, no new bucket.
Processing (`lib/transcription/document-ingest.ts`'s
`startDocumentProcessing`) tries native PDF text extraction first
(`lib/transcription/providers/native-pdf.ts`, via `pdfjs-dist`'s
Node-compatible legacy build — no rendering, just the embedded text layer)
and falls back to Mistral OCR (`lib/transcription/providers/mistral-ocr.ts`,
via the official `@mistralai/mistralai` SDK) only when
`isNativeTextAdequate()` (`lib/transcription/document-normalization.ts`)
says the native text isn't usable prose — a reporter never picks between
the two. Both paths write into the same normalized
`sw_document_pages`/`sw_document_blocks` schema (one row per page, one
ordered/typed row per text block, fractional `bbox` so a viewer maps it at
any zoom — see §8.4), never the provider's raw response, which is retained
separately in `sw_document_processing_runs` (an attempt-by-attempt audit
log, not a job queue — its partial unique index is what makes a stuck
in-flight run recoverable via `isStaleProcessingRun` rather than
permanently blocking retry). **Mistral OCR runs inside Next's `after()`**
(`next/server`), not the request that kicked it off — Mistral's OCR
endpoint has no native webhook, so this is the closest equivalent to the
AssemblyAI kickoff-then-webhook pattern available; `maxDuration` is raised
to 300s on the three pages that can trigger it
(`sourcework/new/page.tsx`, `sourcework/[id]/page.tsx`,
`sourcework/sources/[id]/page.tsx`), **not** in `actions.ts` itself — a
bare `export const maxDuration` inside that `"use server"` file broke
Turbopack's Server Actions compilation outright, confirmed while building
this. Document excerpts (`sw_source_excerpts.locator_kind = 'document'`,
new `sw_excerpt_document_locations` table) exist alongside the unchanged
temporal ones — `start_ms`/`end_ms` are now nullable but a check constraint
still enforces exactly one locator shape per excerpt; `lib/transcription/
clips.ts`'s audio-only `ProjectClip`/`listExcerptsForSource` are unchanged
(now filtered to `locator_kind = 'temporal'`), and the document counterpart
lives in `lib/transcription/document-excerpts.ts`. Search
(`tw_search()`, fifth revision of that function) gained a `document`
hit-kind and a `page_number` column alongside the existing
`start_ms`/`end_ms`; `tw_chunks` gained nullable `page_start`/`page_end`/
`anchor_block_id` rather than a parallel document-chunk table, and
`lib/transcription/chunking.ts`'s `buildDocumentChunks()` windows blocks by
character count (documents have no time axis) the way `buildChunks()`
windows segments by duration. `computeProjectStatus()`/`processingLabel()`
moved to `lib/transcription/status.ts` (pure, no `"server-only"`) so client
components (source cards, project rows) can import the kind-aware
`processingLabel()` without pulling in `projects.ts`'s server-only data
access — that exact mistake broke the production build once, confirmed
while building this phase. Translation, bundled into the original single
Phase 3, is explicitly deferred — not part of 3b.

**The tool's user-facing name is now "Sourcework"** (as of 2026-07-31) — the
registry row's `name` (`supabase/migrations/20260731140000_sourcework_tool_rename.sql`)
and the "Clip" → "Excerpt" copy throughout the transcription UI were updated to match
the data model's framing, following mockups reviewed for a broader source/project UI
direction (see `docs/sourcework-design.md`'s Phase 3 entry for what shipped as
3a and what's still only scoped for 3b). **The route moved too** (as of the same date, once it was clear
no bookmarks or real users depended on the old one): `/transcription` →
`/sourcework`, meaning `src/app/(portal)/transcription/` is now
`src/app/(portal)/sourcework/` (`supabase/migrations/20260731150000_sourcework_route_
rename.sql` updated the registry row's `route`). The tool `key` (still `'transcription'`
— it's the authorization identifier `requireToolAccess`/`assertToolAccess`/RLS
predicates key off, not a URL) and every other directory/file/doc name deliberately did
not move — same precedent as `docs/transcription-workspace-design.md` keeping its name
through the Phase 1-2 data model rename. `src/lib/transcription/`, `src/components/
transcription/`, and their imports are untouched; so are internal identifiers
(`ClipRail`, `clip-actions.ts`, `listLibraryClips`, the `?tab=clips`/`?clip=` query
params, the `kind = 'clip'` search-result value) — only strings a user actually reads,
plus the URL they navigate to, changed.

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

**Roadmap: milestone 1 has landed** — the fifth tool, and the first one about the portal
itself. Read `docs/roadmap-design.md` before touching any of it. Any active staff member
files a **request** (rich text, one of four kinds), votes on other people's, and comments;
a **curator** moves a request through six statuses whose grouped view is the roadmap tab.
Tables are `rd_posts`/`rd_votes`/`rd_comments` (`20260801121000_roadmap.sql`), the route
segment is `src/app/(portal)/roadmap/` gated by `requireRoadmapAccess()` from
`lib/roadmap/access.ts`.

Five things about it are load-bearing and easy to break by accident:

1. **`tools.default_access = 'approved_staff'` now means something.** The column has
   documented it as "any active user may open it" since the platform schema was written
   with nothing enforcing it; Roadmap is the first row to use it, so
   `requireToolAccess`/`assertToolAccess` and `listToolsForCurrentUser` now read it
   through the pure `grantRequiredForTool()` in `src/lib/tool-access-rules.ts`, and
   `private.has_roadmap_access` reads the same column in SQL. Every other tool is
   `invite_only`, so nothing else changed. Don't hard-code "everyone" anywhere — reading
   the column is what lets an administrator tighten the tool from the registry screen.
2. **A `tool_access` grant on Roadmap is the _elevation_, not the ticket in.** Everyone
   is already a member; a grant carrying `tool_role = 'curator'` adds curation
   (`private.is_roadmap_curator`, `lib/roadmap/roles.ts`). Granting someone plain access
   does nothing.
3. **`tools.status = 'proposed'`** (`20260801120000_tool_status_proposed.sql`) is a
   registry row for something nobody has built, so a request has something to point at.
   It is excluded from the dashboard (`isListedOnDashboard()`), from the three admin
   grant pickers, and from `getToolCardState` (a `hidden` mode); it is visible to Roadmap
   members through one additive policy, `tools_select_proposed_for_roadmap`. Administrators
   create these at **`/admin/tools/new`** — the only screen in the portal that creates a
   `tools` row outside a migration, and it can only create proposed ones.
4. **`rd_posts` has a `before update` guard trigger, and it is the boundary.** The update
   policy admits the post's author so they can edit their own words; RLS is row-level and
   cannot stop them setting their own `status` through PostgREST. `rd_guard_post_curation()`
   raises unless a curator or administrator is the one changing `status`/`status_note`/
   `kind`/`tool_id`. Hiding the curator panel is a courtesy on top of it.
5. **Audit events are scoped to curation, and so is the policy.** `audit_events_insert_
roadmap_curator` admits curators only — "member" here is every active staff member, and
   a member-scoped policy would let anyone in the portal write audit rows. Filing a post
   and commenting are ordinary writes and are deliberately not audited.

Rich text (post and comment bodies) is this repository's first: Tiptap
(`@tiptap/react`/`starter-kit`/`pm`) writing **ProseMirror JSON into `jsonb`, never
HTML**. There is no sanitizer because there is no markup — `src/lib/roadmap/rich-text.ts`
holds the node/mark whitelist and validates on the way in, and
`src/components/ui/rich-text.tsx` walks the document into React elements on the way out.
Nothing in this codebase calls `dangerouslySetInnerHTML`; keep it that way. The editor
(`components/ui/rich-text-editor.tsx`) is reached only through
`components/ui/rich-text-field.tsx`'s `next/dynamic({ ssr: false })` wrapper so ProseMirror
stays out of the server bundle, and it posts its document through a hidden input so the
surrounding form stays the repo's ordinary `<form action={serverAction}>`. Screenshot/image
attachments are deliberately **not** in milestone 1 (no bucket, no upload path) — see the
design doc §7 before adding them.

**Capability layer and MCP server (Phases A–C landed; D–E not started — see
`docs/agent-capabilities-design.md`):** important write paths are being pulled out of
Server Actions into reusable `defineCapability()`s (`src/lib/capabilities/define.ts`),
aggregated in `src/lib/capabilities/registry.ts`, so they're callable identically from a
`<form action>` adapter, an MCP tool handler, or a test — never `redirect()`, never
`FormData`. Phase A extracted Editorial Planning's; Phase B added one capability per
remaining tool (`sourcework.project.search`, `remote-interview.session.create`,
`audience-listening.answer.sendToSourcework`) so the registry has real entries from all
four tools. **Phase C has landed**: `src/app/api/mcp/route.ts` stands up the official
`@modelcontextprotocol/sdk`'s Streamable HTTP transport over that registry
(`src/lib/mcp/server.ts` — one capability = one MCP tool, named after the capability's
own id), authenticated by the same cookie-based Supabase session every page/action
uses — this phase is the in-portal case only (design doc §7/§8), no external-client
token story yet. A `confirmation: "required"` capability's MCP tool gets an added
`confirmed` boolean field (`src/lib/mcp/tool-schema.ts`), not part of the capability's
own domain schema. Every MCP invocation — success or failure, gated or not — logs
exactly one `audit_events` row under the `mcp.<capability.id>` action namespace
(`src/lib/mcp/audit.ts`'s `buildMcpAuditEvent`), independent of whatever tool-specific
audit event the capability's own handler additionally logs, so agent-originated writes
stay distinguishable from UI-originated ones (design doc §11 risk 3). That required a
migration (`20260731160000_mcp_server_audit_rls.sql`, applied to both projects): the
existing `audit_events` insert policies are scoped to administrators, Editorial Planning
editors, and Audience Listening members only, and an MCP call from a Sourcework- or
Remote-Interview-only user would otherwise have its audit insert silently dropped by RLS
— the new `audit_events_insert_mcp` policy is scoped to the `mcp.` action prefix
specifically, so it doesn't become a general bypass of the per-tool policies. **Phase D
(the in-portal agent) is next — do not start it without an explicit instruction**, and
Phase E (external Claude/ChatGPT clients) needs its own auth design first (design doc §8).

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
src/app/(portal)/sourcework/  Sourcework (route: /sourcework) — its own route segment,
                            gated by requireToolAccess("transcription"); data access
                            lives in lib/transcription/ (name kept, see "Sourcework"
                            above) and components in components/transcription/
src/app/(portal)/remote-interview/  Remote Interview — its own route segment, gated by
                            requireToolAccess("remote-interview")
src/app/(portal)/audience-listening/  Audience Listening — its own route segment, gated by
                            requireToolAccess("audience-listening")
src/app/(portal)/roadmap/  Roadmap (wishlist + product roadmap) — its own route segment,
                            gated by requireRoadmapAccess() from lib/roadmap/access.ts.
                            Open to every active staff member, not to grant holders
                            (tools.default_access = 'approved_staff')
src/app/join/[token]/      Remote Interview's guest-facing join link — deliberately
                            outside both (portal) and (auth), since a guest has no
                            profile — see docs/remote-interview-design.md, "Fit with
                            portal conventions"
src/app/listen/[publicId]/ Audience Listening's public participation page, and /embed for
                            the Grove iframe. Outside (portal)/(auth) for the same reason
                            as /join, and listed in the middleware's PUBLIC_PATHS
src/app/api/mcp/           the internal MCP server's route handler (Phase C, see above) —
                            in middleware's default-gated set (not PUBLIC_PATHS), same
                            cookie session as everything else
src/components/ui/         small shared primitives (Button, Badge, Input/Select/Textarea, Card,
                           Alert, Table) — keep generic; use these rather than re-typing
                           control/table class strings inline. Also the rich-text trio:
                           rich-text.tsx (server renderer), rich-text-editor.tsx (Tiptap,
                           client), rich-text-field.tsx (the ssr:false wrapper every caller
                           uses) — see "Roadmap" above before importing the editor directly
src/components/            portal-specific components (nav, tool card, etc.)
src/components/editorial/  Editorial Planning display components
src/lib/supabase/          the two Supabase client factories — see above
src/lib/auth/              session lookup + authorization checks
src/lib/transcription/     Transcription Workspace's data access + pure logic (not portal-schema),
                           now also the home of Sourcework's sw_* data access (see
                           docs/sourcework-design.md) — Source/Representation/Excerpt
                           access lives alongside the transcript/clip code it generalized
src/lib/remote-interview/  Remote Interview's data access + pure logic (tokens, storage
                           prefixes) — not portal-schema
src/lib/audience-listening/  Audience Listening's data access + pure logic (public ids,
                           query/participation state, embed code, provenance).
                           participant.ts (server) and participant-client.ts +
                           public-client.ts (browser) are the only paths a member
                           of the public reaches — see public-client.ts's comment
                           for why the public flow gets its own, non-cookie
                           Supabase client
src/lib/roadmap/           Roadmap's access gate + role (access.ts, roles.ts), data reads
                           (queries.ts), capabilities.ts, plus pure, tested modules — the
                           status machine and validation (posts.ts) and the rich-text
                           whitelist (rich-text.ts), which is the security boundary for
                           every body stored by this tool
src/lib/editorial/         Editorial Planning logic: access gates (server-only), data reads
                           (data.ts), the action failure helper (action-result.ts), plus pure,
                           tested modules (roles, scoring, staleness, form validation)
src/lib/capabilities/      the capability layer: define.ts's defineCapability() shape,
                           registry.ts's cross-tool aggregation + invoke() (see above and
                           docs/agent-capabilities-design.md) — each tool's own
                           capabilities.ts lives beside its other lib/<tool>/ code, not here
src/lib/mcp/               the MCP server's tool-building logic (server.ts, "server-only"),
                           plus its pure, tested pieces (tool-schema.ts, audit.ts) — the
                           route handler at src/app/api/mcp/ is the thin part
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
`npm run format` · `npm run db:types` · `npm run db:check`. Run lint, typecheck, and test
before considering a change done — and `db:check` too if the change touched
`supabase/migrations/`.

## Database workflow

New migration file per schema change (`supabase/migrations/<timestamp>_<name>.sql`),
never edit a migration that's already been applied. Include RLS policies for any new
table in the same or an immediately-following migration — a table without RLS enabled is
a bug, not an oversight to fix later. Regenerate `src/lib/database.types.ts` after schema
changes (`npm run db:types` against a local instance, or hand-update it consistently with
the migration if no local instance is running — see the note at the top of that file).

**Writing the migration is not finishing it.** Nothing in a build, a test run, or a
Vercel deploy applies migrations, so a merged migration that was never run ships a tool
that silently does nothing — or half-does something, which is worse. That has already
happened here: Audience Listening's registry row was flipped to `available` while its
route still pointed at the generic placeholder, because the migration that repoints it
hadn't been run, and `/tools/audience-listening` redirected to itself forever.

So a schema change is done when, and only when:

1. It is applied to **`wuwf-tools-portal-preview`**, and verified there.
2. It is applied to **`wuwf-tools-portal`**, and verified there.
3. Its row is added to **`supabase/migrations/APPLIED.md`** with both dates.
4. **`npm run db:check`** passes.

`APPLIED.md` is the record of what has actually been applied where; `db:check` fails on
a migration file with no row, a row naming a missing file, or a row where either
environment isn't a date. Read that file before touching migration history — it also
records the one known discrepancy between this directory and the hosted projects
(`harden_functions`), so nobody tries to "fix" it by reapplying it.

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
- Any new focusable text surface (input, textarea, select, or a custom `contenteditable`/
  rich-text editor) must resolve to at least 16px font-size on mobile — iOS Safari
  auto-zooms the viewport on focus below that. Use `controlClasses` from
  `components/ui/input.tsx` for native `Input`/`Select`/`Textarea`; for anything else, use
  the exported `MOBILE_SAFE_TEXT_SIZE` constant from the same file — never hand-type
  `text-sm` on a focusable surface. This exact bug has recurred five times now, each time
  on a different _kind_ of control than the last fix covered (`30464b3`, `90747aa`,
  `af42f2b`, `f9fe609`, and `rich-text-editor.tsx`) — check this before adding any new one.
- Migrations in `supabase/migrations/` are not self-applying, and no build or deploy will
  apply them. Adding one is not the end of the job: apply it to preview, then production,
  confirm the tables exist, record both dates in `supabase/migrations/APPLIED.md`, and run
  `npm run db:check`. See "Database workflow" above — this is the step most often skipped,
  and skipping it ships a tool that silently does nothing.
- Run `npm run lint`, `npm run typecheck`, and `npm test` before calling a change done —
  plus `npm run db:check` when the change touched `supabase/migrations/`.
- Update this file and/or README.md when you change architecture, directory conventions,
  or the local/deploy workflow — not for routine feature work.
- Don't add a major dependency without a specific reason it's needed (and note that
  reason in the commit/PR description) — this project deliberately runs on a small
  dependency set.
- End each implementation task with a short summary of what changed and anything left
  unresolved.

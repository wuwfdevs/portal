# CLAUDE.md

Guidance for Claude Code (and future human developers) working in this repository.

## Product scope

WUWF Tools Portal (`tools.wuwf.org`) is a shared access/administration layer for a small,
fixed set of internal WUWF tools — not a general-purpose newsroom platform. It provides:
authentication, invitation/approval-based access, role-based authorization, a tool
registry, a dashboard, and admin screens for user/tool management.

Each tool (Editorial Planning, Sourcework, Remote Interview, Audience
Listening, Roadmap, Academic Partnerships) is its own focused application area with its
own schema. The portal's job ends at "Open Tool" — do not build cross-tool abstractions,
a plugin framework, or speculative integrations. When in doubt, keep scope narrow.

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

**Roadmap revision (2026-08-06):** the roadmap tab gained a real
drag-and-drop kanban board for curators
(`src/app/(portal)/roadmap/kanban-board.tsx`, `kanban-board-field.tsx`'s
`next/dynamic({ ssr: false })` wrapper) — `@dnd-kit/core`'s second use in
this repo, not a new dependency; see Academic Partnerships' kanban board
below for why it's the one library this codebase reaches for here. Its
columns are `KANBAN_STATUSES` — all six statuses, not just the four
"decided" ones `ROADMAP_STATUSES` groups for the static view everyone else
still sees: a curator is the one who moves a request out of `open` or
`under_review`, and a board that can't show a card can't be dragged from
(it briefly shipped scoped to the four decided statuses before this was
caught and it was widened the same day — see `docs/roadmap-design.md`'s
"Post-milestone-1 revision" for both steps). Unlike Academic Partnerships'
board, Roadmap's status changes follow a real state machine
(`availableStatusActions`), not free movement to any column, so dropping a
card is validated against it directly and is a no-op if the target isn't a
legal transition. Dropping onto Declined opens an inline reason prompt
instead of moving the card immediately, since `rd_posts` and
`validateStatusChange` both require one. `setPostStatus` (the detail
page's form action) now delegates to a new non-redirecting
`movePostStatus()`, mirroring `academic-partnerships/actions.ts`'s
`setSubmissionStage`/`setStageForm` split, so the board can update
optimistically and roll back on error. A non-curator still sees the
original static grouped list (still just the four decided statuses) — the
board and its drag affordances are curator-only, matching who
`assertRoadmapCurator()` already let write a status.

**Academic Partnerships: milestone 1 has landed.** Read
`docs/academic-partnerships-design.md` before touching any of it. A public inquiry form
at `/partner` (and `/partner/embed` for a Grove iframe) feeds a staff-run pipeline —
New → Reviewing → Meeting Requested → Scoping → Approved → Active → Completed — at
`src/app/(portal)/academic-partnerships/`, gated by
`requireToolAccess("academic-partnerships")`. Tables are `ap_*`
(`20260803140000_academic_partnerships.sql`).

Four things about it are load-bearing and easy to break by accident:

1. **The public form needs no session at all, not even an anonymous one** — the one real
   architectural difference from Audience Listening, whose public surface this one is
   otherwise modeled on. Because the whole interaction is a single page load and one
   submit (no multi-step recording flow, no row ever read back by the public), a plain
   `<form action={submitInquiry}>` Server Action calling the ordinary cookie-based
   `lib/supabase/server.ts` client is enough — there is no later request that needs to
   recover an earlier session from a cookie, which is specifically the failure mode that
   forced Audience Listening off that client. `signInAnonymously()` is not called
   anywhere in this tool, and it does not need "Anonymous sign-ins" enabled to work.
2. **`ap_submissions` table RLS is staff-only, full stop**, same as Audience Listening's
   `al_*` tables and for the same reason (design doc §3): the public surface is exactly
   two enumerable `security definer` functions, `ap_public_form_config()` (read) and
   `ap_submit_inquiry()` (the only way a row is ever written from outside the portal —
   validates required fields, the enabled-type list, email shape, and per-submitter rate
   limits in the same transaction as the insert). There is no participant-facing RLS
   policy on any `ap_*` table; extend those two functions instead.
3. **`stage` and `disposition` are separate columns, not one status enum.** Deferred /
   Declined / Withdrawn / Archived are dispositions that take a submission out of the
   active kanban board (`ap_submissions.disposition is null` is what the pipeline query
   filters on) without erasing which of the seven primary stages it had reached — the
   same shape `ep_pitches`' `archived_at`/`archived_reason`/`archived_by` uses, widened to
   four values and renamed to the brief's own vocabulary.
4. **`ap_submission_events` is this tool's own staff-visible activity log, not
   `audit_events`.** `audit_events` is select-restricted to administrators only
   (`audit_events_select_admin_only`), so it cannot serve as the per-submission timeline
   the detail screen shows every tool member. Privileged actions still also call
   `logAuditEvent()` per the usual convention (`ap.submission.stage_changed`, etc.), so
   administrators keep their portal-wide view — the two are complementary, not
   duplicative, and a new `audit_events_insert_academic_partnerships` policy admits this
   tool's members the same way every other tool's does.

The kanban board (`src/app/(portal)/academic-partnerships/kanban-board.tsx`) is the one
new dependency this module adds: `@dnd-kit/core`. Nothing else in this repository does
drag-and-drop — Editorial Planning's and Audience Listening's own reordering both use
plain up/down `<button>` forms — but a real kanban board is the one part of this tool's
UI a button-based alternative would make substantially worse, and `@dnd-kit/core` alone
(no `@dnd-kit/sortable`) is enough because cards move *between* columns, not to a
position within one. Every card also carries a plain "Move to…" `<select>`, always
present, never a fallback bolted on for compliance — it is how a keyboard or
screen-reader user, or anyone on a touch device, moves a card at all. A `tool_access`
grant carrying `tool_role = 'coordinator'` (mirroring Roadmap's `'curator'`) is the
elevation that unlocks Settings' write actions (copy, email templates, enabled
partnership types, open/closed, the Google Appointments URL); every other member can
view Settings read-only. There is no file/attachment upload in this milestone — "supporting
links or materials" on the research path is a plain text field — and no generic tagging
system, since none existed elsewhere in the portal to reuse and the brief's own
instruction was to skip tags rather than build a system for one tool's benefit. Email
actions (Invite to Meet plus six other templates) prepare a `mailto:` draft and a
copy-to-clipboard button — the manual fallback, still available today.

**Academic Partnerships revision (2026-08-05) — see
`docs/academic-partnerships-design.md` §9 for the full account:**
`partnership_type` (one enum) became `partnership_types` (a non-empty array, migration
`20260805120000_academic_partnerships_multi_track.sql`) so one inquiry can name more than
one collaboration track, with the research-fields requirement and the enabled-type check
in `ap_submit_inquiry()` updated to check array membership; `enrollment_estimate` was
renamed `estimated_students_reached`, asked once up front rather than per course. The
public form (`src/app/partner/partner-form.tsx`) became a guided multi-step wizard —
conditional steps per chosen track, each step's `<div>` shown/hidden via a single
conditional `className` (`cn("flex-col gap-4", stepId === "x" ? "flex" : "hidden")`, never
mounted/unmounted) so Back/Next never lose a value, with a plain-language description next
to each track's checkbox. **Never pair the native `hidden` attribute with a Tailwind
`display` utility (`flex`, etc.) on the same element** — author-stylesheet rules always
beat the UA stylesheet's `[hidden]{display:none}` regardless of specificity, so a step div
with both `hidden={...}` and a static `className="flex ..."` rendered every step at once
(confirmed with Playwright after a real bug report: the form showed every question,
extended past the viewport, and Next appeared to do nothing). **Its "Next"/"Submit" button
is deliberately always `type="button"`,
never a conditionally-rendered `type="submit"` at the same position** — mutating a
just-clicked, still-focused button's `type` live turned out to fire a real premature
submission that wiped the form, confirmed by a stray POST under Playwright; the final
step calls `formRef.current?.requestSubmit()` instead. The kanban board's cards are now
draggable from anywhere on the card (not just a small handle), and load via
`next/dynamic({ ssr: false })` (`kanban-board-field.tsx`, mirroring `rich-text-field.tsx`'s
reason: `@dnd-kit` generates ids from a counter that isn't SSR/client-synchronized,
producing a real hydration mismatch otherwise). `src/lib/email.ts` is this **portal's
first real transactional email sender** (Resend; `RESEND_API_KEY`/`RESEND_FROM_EMAIL`,
optional like `DAILY_API_KEY`/`MISTRAL_API_KEY` — unset, `sendEmail()` fails clearly
rather than silently no-op'ing), used by this tool's `sendInquiryEmail()` action; the
manual mailto:/copy path from milestone 1 stays available via an explicit toggle. A KPI
dashboard (`/academic-partnerships/dashboard`, `lib/academic-partnerships/dashboard.ts`)
aggregates `listAllSubmissions({})`'s existing read in application code — no new SQL
aggregate function, appropriate at this tool's current scale. A follow-up migration
(`20260805130000_academic_partnerships_field_trim.sql`) dropped four public-form fields
that turned out to duplicate another field once the wizard made the overlap visible:
`research_dates` (duplicated `relevant_dates`, now relabeled "Relevant dates, deadlines,
or embargoes" and asked once regardless of track), `learning_objectives` (duplicated
`student_experience`), `research_summary` (duplicated `description` — `research_topic`
alone is now what `ap_submit_inquiry()` requires for the `faculty_research` track), and
`research_links` (not duplicative, just lower-priority triage detail better collected
during Reviewing). See design doc §9.7.

**Academic Partnerships revision (2026-08-06) — inquiry deletion.** A
submission can now be permanently deleted, coordinator-only
(`assertAcademicPartnershipsCoordinator()`), from a "Danger zone" section on
the submission detail screen (`[id]/delete-submission-control.tsx`, a
two-step confirm mirroring Sourcework's `SourceActionsMenu`) — deliberately
not on the kanban card itself, since this is rarer and, unlike a
disposition, not reversible, so it stays off a surface built for quick
drags. `deleteSubmission()` in `actions.ts` needed a new migration,
`20260806120000_academic_partnerships_delete.sql`: `ap_submissions` had
`select`/`update` policies but no `delete` one, and the existing
member-level `assertAcademicPartnershipsAccess()` write actions (stage,
owner, disposition) don't need one. `ap_submission_events` cascades with
its parent row (`on delete cascade`), so a submission's activity log
disappears with it — the deletion itself is recorded in `audit_events`
instead (action `ap.submission.deleted`), the only durable trace once RLS
and the cascade have both finished.

**Log: milestone 1 slice 1 (Foundation) has landed — the guardrail against
building it is lifted.** Log is the first of three tools splitting the WUWF
Unified Broadcast Rundown and Traffic System spec; read
`docs/broadcast-operations-strategy.md` (the three-tool split and schema
ownership) and `docs/log-design.md` (this tool's own design, milestone 1 in
full) before touching any of it. Milestone 1 is large — ten tables, eight
user workflows, a live host console with offline resilience, a pure timing
engine — so it's being built in slices, the same way Remote Interview was.
**Slice 1 ships only what Workflows A (defining a clock) and B (scheduling
programs) need**: `log_programs`/`log_clock_templates`/`log_clock_versions`/
`log_clock_slots`/`log_schedule` (`20260806130000_log_foundation.sql`), the
route segment (`src/app/(portal)/log/`) gated by `requireToolAccess("log")`,
and producer-only create forms for templates/versions/slots/programs/
schedule entries. **Slices 2 (content library) and 3 (NPR + weather), rundown
generation with the timing engine, the host console with mid-broadcast
actions, and rundown submission plus the three MCP capabilities have since
landed too — see below.** That completes every workflow milestone 1 lists
(§7); see `docs/log-design.md` §7 for what's deferred past milestone 1
(Underwriting integration, the FCC taxonomy, automation-system confirmation,
multi-editor concurrency) — none of it authorized to start without its own
instruction.

Two things about this slice are load-bearing:

1. **Log is invite_only, like Academic Partnerships, not open like Roadmap.**
   A `tool_access` grant is the ticket in, not an elevation on top of open
   access. `private.has_log_access()` mirrors
   `private.has_academic_partnerships_access()` exactly (a non-revoked grant
   plus an active profile, no `default_access` branch). The elevation within
   the tool — `private.is_log_producer()` — is the same member/coordinator
   shape too: a grant carrying `tool_role = 'producer'`, OR'd with
   `private.is_administrator()`. An administrator with no grant on Log can
   therefore satisfy `is_log_producer()` but still can't open the tool at all
   (`requireToolAccess` checks for an actual `tool_access` row, not this
   predicate) — the same asymmetry Academic Partnerships already has, not a
   new inconsistency introduced here.
2. **`log_clock_versions` and `log_clock_slots` are insert-only, forever, by
   design — not a gap to fill in later.** The design doc calls a clock
   version immutable once created ("no update path on this table from the
   application... a correction is a new version"), the same reasoning
   Audience Listening's answers snapshot their question. RLS grants
   producers `select`+`insert` only on both tables, no `update` policy at
   all — confirmed directly against the preview database that an
   `update` from a producer session silently matches zero rows (correct
   Postgres RLS behavior for a command with no applicable policy), not a
   permission error and not a successful write. A correction is always a new
   version, never an edit to an old one.

**Log: seeded with the 13 real NPR-syndicated programs WUWF currently
carries** (`20260806140000_log_clock_slot_windows_and_schedule_times.sql` +
`20260806150000_log_seed_npr_clocks.sql`), transcribed from the station's own
NPR network clock diagrams and scheduled per the station's corrected weekly
schedule — read the second migration's header before touching any of this
seed data; it documents fidelity caveats (a few hour-internal junctions are
structurally-sound approximations, not exact transcriptions) and the
Fresh Air Weekend / TED Radio Hour / Here & Now / World Cafe schedule
quirks. Seeding this surfaced two real schema gaps, both closed by the first
migration before the second one could run: **`log_clock_slots` gained
`earliest_start_offset_seconds`/`latest_start_offset_seconds`/
`segment_label`** — a "floating break" (a local avail whose exact position
within a window is the station's call, not the network's) is a real,
current feature of five of these clocks, not a hypothetical one, and the
single-value `start_offset_seconds` couldn't express a range; and
**`log_schedule` gained `air_time` (not null) and `duration_minutes` (not
null)** — the original design doc listed `start_date`/`end_date`/
`days_of_week` but nothing saying what time of day a program airs or for how
long, an oversight rather than a deferral, and not enough to ever generate a
rundown from. Both columns are populated on every seeded schedule row, and
the create-schedule-entry form/action in `src/app/(portal)/log/programs/
page.tsx`/`program-actions.ts` (written before this gap was found) were
updated in the same pass to collect them.

**Log: schedule-completeness fixes (2026-08-06)** —
`20260806170000_log_schedule_completeness_fixes.sql` closes three gaps found
after the initial NPR seed, all discovered by cross-checking the seeded data
against the actual 13 source clock PDFs and the station's real weekly
schedule rather than only checking the seed script's own row counts for
internal consistency (which is how the first gap shipped undetected in the
first place): **Morning Edition's clock template/version/23 slots/program
were missing entirely** — fully transcribed at the time but never added to
the seed script's `CLOCKS` dict, so it silently never reached the SQL output;
**`1A` and `Fresh Air` (weekday) had complete clock data but no
`log_schedule` row** — both had templates/versions/slots/programs seeded
correctly, but their `SCHEDULE` entries were left out of the same script, so
neither would ever have appeared on the Today screen or a programs schedule
list despite having a real clock behind them; and **every other program on
the station's actual weekly schedule that this project hasn't yet been given
a detailed clock PDF for now has a `log_programs` row and a `log_schedule`
row anyway**, pointing at one new shared placeholder clock template ("Unspecified
(awaiting network clock)", a single slot spanning the whole hour) rather than
either 32 near-duplicate one-off templates or leaving those programs unable
to be scheduled at all until their real clock arrives. Swapping a placeholder
program onto its own real clock template later is a normal `log_schedule`
update — that table, unlike `log_clock_versions`/`log_clock_slots`, is not
insert-only — so no migration is required when the remaining clocks show up.

**Log: clock version diagram.** The clock template detail screen
(`/log/clocks/[id]`) now renders each version's slots as a circular ring
diagram alongside the existing table, in the same visual spirit as the NPR
network clock PDFs this data was transcribed from. `src/lib/log/clock-face.ts`
is pure geometry/categorization (donut-segment SVG path construction,
slot-to-visual-category mapping keyed off label text and
`fill_mode`/`timing_mode` — there's no dedicated "kind of network element"
column) with a colocated test file; `src/components/log/clock-face.tsx` is a
plain server-rendered `<svg>` (no `"use client"` needed — each segment's
native `<title>` tooltip is the only interactivity called for) consuming it.
The diagram also fixed two real usability gaps found once it existed: slot
boundaries had no minute labels (`buildBoundaryLabels`, rotated radially via
`radialLabelOrientation` — a horizontal label collided with its neighbors
wherever two boundaries fell only seconds apart, since a label's on-ring
footprint is its full text width; rotating it to run along its own radius
shrinks that footprint to the line's thickness), and a floating break
rendered as an ordinary solid wedge at its nominal position instead of
looking like a movable window — `slotRenderWindow` now draws it spanning its
full earliest-start-to-latest-end range with a diagonal hatch fill and
dashed border instead of a solid one.

**Log: clock seed corrections (2026-08-06)** —
`20260806180000_log_clock_seed_corrections.sql` fixes real transcription
errors in 10 of the 13 seeded NPR clocks, found by re-checking each against
its source PDF after a user report that some slot times looked wrong. Two
bugs were systemic, not one-offs: nearly every clock's original transcription
silently stopped short of the actual top of the hour, missing a final few
seconds of "Silence" (and often a short "Music Bed" before it) that every one
of these NPR house clocks reserves right before the next hour's Billboard —
this alone affected Hidden Brain, TED Radio Hour, Wait Wait... Don't Tell
Me!, 1A, both All Things Considered clocks, both Weekend Edition clocks, and
World Cafe. Morning Edition additionally had a promo mislabeled onto the
wrong position (swapped with a different promo fifteen minutes away) and a
dropped 30-second Music slot that shifted two newscasts thirty seconds early
and inflated one's duration past what the network newscast actually runs.
All Things Considered (weekday) had a cluster of slots — a Return, a Music
Bed, and a Cross-Promo — that don't exist at all in the source diagram, which
shows Segment D starting immediately at that point instead. `log_clock_slots`
is insert-only from the application (no update/delete RLS policy for
producers — see below), which is a boundary on writes through the app, not a
reason to leave a migration's own seeding mistake in place: each affected
version's slots are deleted and re-inserted in this migration rather than
left to accumulate as a confusing phantom "correction" version. Three clocks
(Fresh Air, Fresh Air Weekend, Here & Now) were not yet re-verified against
their source PDFs at the time — see the next entry for those.

**Log: clock seed corrections, part 2 (2026-08-07)** —
`20260807120000_log_clock_seed_corrections_2.sql` finishes the job the first
corrections migration left open, re-checking Fresh Air, Fresh Air Weekend,
and Here & Now against their source PDFs. Same missing-end-of-hour-tail bug
in all three. Beyond that: Fresh Air had a wrong Segment B duration, a
missing 35-second Funding Credit, and a floating break whose own duration
undercounted its "adjacent funder" half (35s instead of the Music+Funding
Credit combo's 65s the diagram's own label already named it for — the same
combined-float-slot modeling Hidden Brain already used, not a new pattern).
Fresh Air Weekend's floating break had the same undercounted-duration bug
even more severely (41s instead of 101s), and — more seriously — the
following Segment B was anchored to the floating window's *latest* bound
instead of right after the break's actual nominal placement, leaving a real
379-second hole in the schedule that nothing in the schema catches (a
`log_schedule` row covering a program doesn't validate that its clock's own
slots are gapless). Here & Now turned out to have a real, unusual structural
feature none of the other clocks do — a 10-second Funding Credit before
Billboard, which then only runs 50 seconds instead of 60 — that the first
transcription pass flattened into an ordinary 60-second Billboard, plus a
swapped Promo/Music Bed label pair and a missing Funding Credit before
Segment E. All three clocks now sum to exactly 3600 seconds (or 3599,
within the same ~1s rounding noise every clock's own PDF shows).

**Log: clock seed corrections, part 3 (2026-08-07) — a real, systemic
mistranscription across nearly every clock, not just Morning Edition.** A
user report ("the 5:40 break doesn't actually start until 6:00") led to
re-rendering Morning Edition's source PDF at 6x resolution instead of 4x,
which showed a genuine, separately-colored 20-second red "Funding Credit"
wedge between Newscast 2 and the following Music Bed — previously read as
decoration from the red double-headed "network newscast tolerance" arrow
drawn over the same spot in every one of these clocks, because at lower
resolution the thin wedge and the thick arrow on top of it were
indistinguishable. `20260807180000_log_morning_edition_top_of_hour_fix.sql`
fixes Morning Edition specifically: Newscast 2 ends at 5:40 as already
recorded, but what follows is Funding Credit (5:40–6:00, 20s) *then* Music
Bed (6:00–7:30, 90s) — the two prior passes had merged both into one
110-second "Music Bed" starting at 5:40, which is what prompted the report.
Re-checking the same junction on a second clock at the same resolution
confirmed the identical red wedge exists there too, and a query across all
13 clocks' `log_clock_slots` showed **every other clock** (all but World
Cafe, which has no Newscast 2 at this position) had the same two slots
recorded in the wrong order — Music Bed then Funding Credit, rather than
Funding Credit then Music Bed — meaning this specific mistake predates and
survived both prior correction passes entirely, since it was assumed to be
normal cross-clock transcription noise rather than checked at full zoom.
`20260807190000_log_clock_seed_top_of_hour_swap.sql` fixes it everywhere
else in one pass: a pure label swap keyed on `start_offset_seconds` (340
and 360), since the offsets and durations were already correct and only
which slot was which had been backwards. The lesson worth remembering
before trusting a "not a real slot, just decoration" read on any of these
diagrams again: render tight and zoom past where an annotation and the
element underneath it look identical at a glance.

**Log: milestone 1 slice 2 (Content library) has landed** —
`20260806160000_log_content_library.sql` adds `log_content_items` (news,
station/program promos, membership messages, university announcements,
PSAs, legal IDs, interview/feature, host-created) and `log_content_components`
(a timed part of one — live intro, recorded audio, live outro, optional
tag), plus the `/log/library` route segment (browse/filter, create, detail
with components and an approval-status control). One thing about this
slice cuts the other way from Slice 1's producer gate: **content
authorship is open to any tool member, not producer-only** — the design
doc is explicit that newsroom/promotions staff "neither need a producer
role to do it," so `log_content_items`/`log_content_components` RLS keys
off `private.has_log_access()` alone, with no `is_log_producer()` branch at
all (confirmed directly against preview: a plain member with no
`tool_role` can insert a content item). Retiring stale content is an
ordinary update (`approval_status` → `'retired'`), the same
deactivate-don't-delete lifecycle `ep_criteria`/`ep_form_fields` use — no
delete policy is granted on either table. Audio uploads (`log-media`
storage bucket, added in the same migration) copy Sourcework's established
pattern exactly: browser-direct-to-Storage via `supabase.storage.from(...).upload()`
(`src/app/(portal)/log/audio-upload.tsx`), never a Server Action payload for
the file itself, with `upsert: true` against a fixed per-entity object path
(`lib/log/content-library.ts`'s `contentItemAudioObjectPath`/
`contentComponentAudioObjectPath`) so a corrected re-upload overwrites
cleanly rather than orphaning the previous file. `computeTotalDurationSeconds`
(same file, pure and tested) implements the design doc's "a 30-second promo
with a required 8-second outro is a 38-second commitment, never displayed
as 30" rule — optional components never count toward the total.

**Log: milestone 1 slice 3 (NPR + weather) has landed** — plus, the same
day, its NPR half was corrected to the real API model (see the dated note
below; this paragraph already describes the corrected state).
`20260807130000_log_npr_weather.sql` adds `log_weather_reading`, and
`20260807140000_log_npr_cds_correction.sql` adds `log_npr_episodes`/
`log_npr_episode_items` and `log_programs.npr_collection_id`, plus the
`/log/npr` and `/log/weather` route segments (Workflow D,
`docs/log-design.md` §3). All three tables stay open to any tool member, no
`is_log_producer()` branch, same reasoning as Slice 2's content library —
reading and refreshing NPR/weather is an ordinary host duty. Both
integrations are refreshed **lazily at read time, never on a schedule**
(§6: this repo still has no job queue): `lib/log/npr.ts`'s
`getNprEpisodeForProgramOnDate()` and `lib/log/weather.ts`'s
`getCurrentWeatherReading()` check staleness against a pure, tested
threshold check (`lib/log/staleness.ts`) on every read, refetch inline when
stale, and — critically — never clear or block a previously cached result
on a fetch failure; they return whatever's still cached, flagged stale,
with the error attached for the screen to show (§5.2, §22's "a temporary
API or network failure must not make the current rundown unreadable"). A
short client poll (`log-poller.tsx`, the same
`router.refresh()`-on-an-interval shape as Sourcework's `ProcessingPoller`
and Remote Interview's waiting room) re-triggers that check periodically
since there's still no notification layer. The two integrations' caches
replace data differently per their own lifecycle: an NPR episode is deleted
and reinserted wholesale **per (program, show_date)** on refresh ("not
diffed... not a change history" — no update policy granted; see the
correction note below for why it's scoped to a dated episode rather than a
whole program), while `log_weather_reading` keeps every row as revision
history and just flips `is_current` (a partial unique index enforces at
most one current row; no delete policy granted). The provider layer
(`lib/log/providers/`) treats the two integrations very differently because
one has a confirmed API model and default and the other, as of this slice
landing, didn't yet: weather hits the National Weather Service's free,
keyless `api.weather.gov` for WUWF's Pensacola, FL coordinates by default
(`WEATHER_LATITUDE`/`WEATHER_LONGITUDE` override it) — a real, working
integration, though not necessarily WUWF's final vendor choice
(`docs/log-design.md` §7). NPR now has a confirmed model too (NPR's
Content Distribution Service — see the correction note), though WUWF's own
production CDS token is still outstanding, so `providers/npr.ts` is
unverified against a live account the same way
`lib/remote-interview/daily.ts` shipped unverified before this repo had a
live Daily account — every caller treats "not configured" as an ordinary,
expected outcome, distinct from "this program has no CDS mapping" and from
an actual CDS/network failure. `/log/npr` is a bridging standalone screen
(a program+date picker plus that episode's ordered story items) not in
`docs/log-design.md` §4's original screen list, which has NPR rendering
only inline within the rundown builder — that screen doesn't exist yet
(it's the next slice), and shipping Slice 3 with no way to see or manually
refresh NPR data at all would leave it invisible and untestable until
then; `/log/weather` matches §4 exactly.

**Log: NPR integration corrected to the real CDS model (2026-08-07).**
Slice 3 originally shipped its NPR half against a hypothetical, invented
"rundown feed" contract (`NPR_RUNDOWNS_API_URL`, a generic
`{ segments: [...] }` response, Log-invented fields like
`forward_promo_copy` and a `draft`/`edited`/`revised`/`withdrawn` status,
one undifferentiated "current rundown" per program with no date) — built
before this repo had real information about NPR's actual API, deliberately
labeled an open question at the time. It's since been given real API
context for NPR's Content Distribution Service (CDS), so
`20260807140000_log_npr_cds_correction.sql` replaces that prototype
outright rather than leaving it as unsupported dead weight: NPR identifies
a program as a CDS **collection** (a stable integer id — `log_programs`
gained `npr_collection_id`, nullable, backfilled only for the 9 collection
ids actually known, by exact program-name match, nothing guessed), and a
rundown is a dated **program-episode** document containing an ordered
`items` collection of stories — `log_npr_rundown_cache` (one row per
program, no date, deleted in this migration) became `log_npr_episodes`
(one row per **program + show_date**, `found`/`not_found`, a `raw jsonb`
column preserving the CDS document verbatim for fields this schema didn't
anticipate) and `log_npr_episode_items` (that episode's ordered story
items, each with a stable `npr_item_id` — CDS's own document id, never
derived from a title — plus `title`/`teaser`/`raw`). Date is part of a
CDS episode's identity: a Log rundown for August 7 keeps referring to the
August 7 NPR episode even if reopened on August 8, which is why the cache
key changed from `program_id` alone to `(program_id, show_date)`.
CDS-specific JSON parsing is concentrated in
`lib/log/providers/npr-response.ts` — a pure, colocated-tested module
(no fetch, no Supabase) isolated from `providers/npr.ts`'s actual `fetch`
call so the important boundary cases (malformed response, no matching
episode, missing/optional item fields, item order, stable ids surviving
normalization) are unit-tested without live CDS credentials, which this
repo still doesn't have. A new pure `lib/log/npr-access.ts` gates the two
required short-circuits — no CDS mapping, no CDS token — before
`lib/log/npr.ts`'s orchestration ever calls the provider, also
unit-tested. Host-forward copy is explicitly **not** something NPR
supplies or this correction models — CDS gives editorial metadata (title,
teaser), and any on-air forward promotion a host wants is local/derived
content composed from that, per `docs/log-design.md` §3D.

**Log: station timezone fix (2026-08-07).** Slice 3 shipped a real bug,
caught immediately by a user comparing the weather screen's "Last updated"
against an actual clock: every wall-clock-facing display in Log had been
built with no explicit `timeZone`, so `Date`/`Intl` formatting fell back to
the rendering process's own timezone — UTC on Vercel, five hours off
Pensacola in August (CDT). `lib/log/timezone.ts` (pure, tested) is now the
one place that knows the station is Central time, not Eastern, despite
being in the Florida panhandle (`STATION_TIME_ZONE = "America/Chicago"`),
and every timestamp/date Log renders goes through it:
`formatStationTimestamp` (weather's and NPR's "last updated"/"retrieved"),
`formatStationDateLong` (the Today screen's header), and — the more
consequential half of the same bug — `stationTodayISO()`, which replaced
the Today screen's `new Date().toISOString().slice(0, 10)`. That one wasn't
just a mislabeled timestamp: computing "today" from UTC meant the Today
screen would silently show **tomorrow's** lineup for roughly 7pm–midnight
Central, every single day, since UTC has already rolled over by then. Nothing
elsewhere in the portal uses this helper or needs to — every other tool's
timestamps (`created_at`, `submitted_at`, audit log entries, etc.) are
ordinary multi-timezone-audience activity logs, not a live single-studio
wall clock, and rendering those in the viewer's ambient timezone rather than
a fixed one is a longstanding, separate characteristic of the rest of the
codebase, not something this fix touched.

**Log: rundown generation with the timing engine has landed** — Workflow E
(docs/log-design.md, "Building the daily rundown"). `log_rundowns`/
`log_rundown_items` (`20260807150000_log_rundowns.sql`, member-level RLS, no
producer gate — generating and filling a rundown is an ordinary host/member
action per the design doc). Generation (`generateRundown` in
`rundown-actions.ts`) only creates a row for a clock slot a host actually
decides something for (`fill_mode` `optional`/`host_fillable`) — the
network-automatic majority of every real clock's slots never gets a row,
since there's nothing for a host to pick and a row that can never be filled
would just be noise in the builder. `lib/log/rundown-generation.ts` builds
the draft items (repeating a clock's slots once per hour across a
multi-hour shift), `lib/log/rundown-eligibility.ts` filters the content
library to what a given slot actually permits, and `lib/log/timing.ts` is
the pure, tested build-time fit engine (slot fit, rundown-level readiness) —
never stored state, recomputed on every render per the design doc's
"Timing is a pure, tested module." `log_rundowns` has a unique
`(program_id, air_date)` constraint, not in the design doc's literal column
list but needed to keep "generate" idempotent. The `/log/rundowns/[id]`
builder screen lets a host fill, replace, or clear each host-fillable slot
from the content library, with live fit feedback.

**Log: the host console with mid-broadcast actions has landed** — Workflows
F and G. `log_broadcast_events` (`20260807160000_log_broadcast_events.sql`,
append-only RLS — select+insert only, no update/delete policy, matching
`log_clock_versions`/`log_clock_slots`' immutability precedent) is the
as-aired record. `lib/log/console-timing.ts` is the live, continuously
recomputed timing state (on time / running long / running short / at risk
of missing a required item / at risk of missing rejoin) — pure and tested,
following the same "not stored state" rule as build-time `timing.ts`, and
deliberately lighter-weight than a system with real playback telemetry
would need, since every outcome in this milestone is host-confirmed.
`lib/log/mid-broadcast.ts` is the pure, tested move-destination eligibility
(empty, future, permitted content type — daypart/spacing/inventory
eligibility the design doc also names have no modeled concepts yet in this
schema). The `/log/rundowns/[id]/console` screen is the live view: current/
next item, adjustable copy size, inline weather and NPR context, and the
three mid-broadcast actions (`console-actions.ts`'s `markAired`/
`markMissed`/`moveRundownItem`) always one tap away. "Moved" is modeled as
filling a different open item with the same content and clearing the
original, recorded as outcome `skipped` rather than a new column — see the
migration's file header — which is what makes the console's "Undo" link
just the same move run in reverse, with nothing to delete from an
append-only table.

**Log: rundown submission and the three MCP capabilities have landed** —
Workflow H, and `docs/log-design.md`'s "Architecture" section naming
exactly these three as "the operations useful to drive from the in-portal
agent without a live console in front of you." No migration needed:
`log_rundowns.status`/`submitted_at`/`submitted_by` already existed from the
rundown-generation slice. `listUnresolvedItems()` (`lib/log/submission.ts`,
pure, tested) is the review surface — a filled item with no recorded
broadcast event, or a still-empty required slot — shown on the console
screen's new "Wrap up" panel, but **submitting is never blocked by it**:
per the design doc, "submission is a checkpoint, not a lock." `submitRundown`
(`console-actions.ts`) sets `status = 'submitted'`; nothing about that status
gates `markAired`/`markMissed`/`moveRundownItem`, which is what makes
§15.3's "documented management corrections" after submission just work,
unchanged, rather than needing a separate unlock path. The three
capabilities (`lib/log/capabilities.ts`, registered in
`src/lib/capabilities/registry.ts`): `log.rundown.buildItem` (fill/replace a
slot's content, confirmation `none`), `log.rundownItem.recordOutcome` (one
capability over aired/missed/moved, via a discriminated-union input, rather
than three near-identical tools — confirmation `required`, since it writes
the as-aired record Underwriting's exception queue and FCC Reporting will
eventually read as ground truth), and `log.content.search` (mirrors
`sourcework.project.search`). `fillRundownItem`, `markAired`, `markMissed`,
and `moveRundownItem` are now thin adapters over these capabilities —
`recordRundownItemOutcome`'s confirmation is satisfied with
`confirmed: true` at the call site, same convention as
`sendAnswerToSourcework`'s: the console button click is itself the human
confirmation.

**Underwriting & Traffic: milestone 1 slice 1 (Foundation) has landed — the
guardrail against building it is lifted.** This is the second of three tools
`docs/broadcast-operations-strategy.md` splits the WUWF Unified Broadcast
Rundown and Traffic System spec into — Log is the first, and its milestone 1
is complete (see above). Read `docs/broadcast-operations-strategy.md`, then
`docs/underwriting-design.md` (design in full) before touching any of it.
**Slice 1 ships only Workflows A (creating/maintaining a contract) and B
(managing underwriting copy)** — `uw_contracts`/`uw_placement_obligations`/
`uw_copy`/`uw_contract_copy` (`20260807200000_underwriting_foundation.sql`),
the route segment (`src/app/(portal)/underwriting/`) gated by
`requireToolAccess("underwriting")`, and a plain member-level dashboard,
contract, and copy-library screens. **Slice 2 (manual credit placement,
Workflow C), Slice 3 (the exception queue, Workflows D/E), Slice 4
(makegoods, Workflow F), and Slice 5 (affidavits, Workflow G) have since
landed too — see below.** That completes every workflow milestone 1 lists
(§7) — nothing further is authorized to start without its own instruction.

Two things about this slice are load-bearing:

1. **This slice has no elevated role, unlike every other tool's Slice 1.**
   `docs/underwriting-design.md` §6 is explicit: "Ordinary traffic staff do
   everything else: contracts, copy, placement, exception triage up to but
   not including a waive/certify decision" — and every action this slice
   adds is on that "everything else" list. `private.is_underwriting_manager()`
   (the elevation for waiving an obligation, certifying an affidavit, and
   overriding expired/unapproved copy into a placement) is deliberately
   **not defined yet** — there is nothing in this slice for it to gate.
   Defining an authorization predicate before any policy needs it is the
   same speculative-schema mistake CLAUDE.md warns against for columns; it
   gets added in whichever later slice adds the first action that actually
   needs it.
2. **The eligible-programs field is still a plain UUID list, not a name
   picker.** `uw_placement_obligations.eligible_program_ids` references
   `log_programs`, but Slice 2's boundary work (below) only ever reads Log's
   tables from inside a `security definer` function — it never granted this
   tool's own client-side code a `select` policy on `log_programs`. A create-
   time name picker would need one, which is still more RLS surface than the
   obligation-creation screen alone justifies; the obligation form stays
   comma-separated program IDs with a hint explaining why.

**Underwriting & Traffic: Slice 2 (manual credit placement into Log's
rundown) has landed** — Workflow C, the two-way Log boundary
`docs/underwriting-design.md` §6 describes, built in one migration
(`20260807210000_underwriting_placement.sql`) since it's one relationship
with two directions. **Write into Log**: `log_rundown_items` gained
`item_kind`/`underwriting_copy_id` (mirroring `sw_source_excerpts`' "exactly
one of several possible references" shape), written only by
`log_place_underwriting_credit()` — a `security definer` function, not a
bare RLS-gated update, so the guard (an open, permitted slot; an active
contract; program-eligible; copy linked to the contract and either approved-
and-in-date or carrying a manager-checked override) lives in one place.
`log_clear_underwriting_credit()` is the undo. **The read side of the same
boundary, not named explicitly in the design doc but needed for Workflow
C's own UI**: an underwriting-only caller has no RLS access to Log's
rundown tables at all, so `log_list_placeable_rundown_items()` — also
`security definer` — is how the contract page finds a given obligation's
eligible open slots. **The reverse read Log needs from this tool**: a
narrow additive `select` policy on `uw_placement_obligations` for Log
members, scoped to obligations with an active placement — added per the
design doc's instruction, though no Log-side code reads it yet (the
console's existing move-destination check is content-type-based and already
works for underwriting-credit items without it). This slice also defines
`private.is_underwriting_manager()` for the first time — Slice 1 deliberately
left it undefined; this is the slice with the first action (an override)
that needs it. `uw_scheduled_placements` denormalizes `program_name`/
`scheduled_at`/`clock_slot_label` at write time (captured by the security
definer function, which can read Log's tables) specifically so this tool's
own screens never need a live cross-tool read just to render a placement
list — the same reasoning Audience Listening's answers snapshot their
question. The capability layer gets `underwriting.credit.schedule`
(`lib/underwriting/capabilities.ts`), confirmation-required, but
deliberately **without** override support — the override path stays
UI-only, the same judgment-call carve-out `lib/roadmap/capabilities.ts`
already applies to curation. Two Log-side pure-logic bugs surfaced and were
fixed while building this: `lib/log/mid-broadcast.ts`'s move-destination
check and `lib/log/capabilities.ts`'s `recordRundownItemOutcome` "moved"
branch both only checked `content_item_id` for "is this slot open," so
either would have let a host move content on top of an underwriting credit
and hit a raw constraint-violation error live on air; both now also check
`underwriting_copy_id`. `clearRundownItem` (Log's own plain content-clear
action) is now scoped to `item_kind = 'content'` for the same reason — an
underwriting-credit item is only ever cleared through
`log_clear_underwriting_credit()`.

**Underwriting & Traffic: Slice 3 (the post-broadcast exception queue) has
landed** — Workflow E, plus Workflow D (pre-broadcast conflict review) as a
computed dashboard needing no schema of its own. One migration
(`20260807220000_underwriting_exceptions.sql`, corrected the same day by
`20260807230000_underwriting_exception_read_fix.sql` — see below) since,
like Slice 2, it's one relationship: `uw_exceptions` (§5) is real, staff-
triaged state (compliance judgment, resolution action, notes), never a
derived view, but it also has **no insert grant to `authenticated`** — the
only way a row is ever created is `uw_flag_exception_from_broadcast_event()`,
an `after insert` trigger on Log's own `log_broadcast_events`. That trigger
is this repo's stand-in for the job queue it doesn't have: the moment a host
records an underwriting-credit item's outcome as anything but
`aired_as_scheduled`, an open exception exists — nobody polls for it. Waiving
an exception is one of the design doc's four manager-only privileged
actions, enforced by `uw_guard_exception_resolution()`, a `before update`
trigger mirroring `rd_guard_post_curation()`'s exact shape (Roadmap's own
curation guard): RLS admits any member's update, and the trigger alone
raises unless `private.is_underwriting_manager()` is the one setting
`resolution_action = 'waive'`. **The corrected read boundary**: Slice 3
originally scoped `log_broadcast_events_select_for_underwriting` (the read
side named in Slice 2's own note) to the rundown item's *current*
`item_kind = 'underwriting_credit'` — caught by a self-review before it
shipped to production reliance: clearing a placement after its exception
was already raised (an ordinary reassign) flips `item_kind` back to
`content`, which retroactively hid that exception's own broadcast event and,
through it, `getExceptionDetail()`'s placement lookup — silently blanking a
still-open exception's context with no error. The fix keys the policy off
`uw_exceptions` actually referencing the event instead, which is permanent
once created and never needs a join through Log's own tables at all. Two
more privileged-action bugs a self-review caught before commit, both about
auditing a value rather than a transition into it: `resolveException()` and
`setContractStatus()` (the latter's audit call was a **Slice 1 gap** dating
back to that slice, since `docs/underwriting-design.md` §6 has required it
from the start) both now read the prior value first and only call
`logAuditEvent()` when the write is a genuine transition into `waive`/
`terminated` — re-saving an already-waived exception or an already-
terminated contract no longer logs a fresh privileged-action row credited to
whoever happened to click Save. `placeCreditAction` (Slice 2) had the same
gap for the override audit and is fixed the same way, by reading back
`uw_scheduled_placements.override_reason` after a successful placement
rather than trusting "the form had text in it." `lib/underwriting/
conflicts.ts` is Workflow D's pure conflict check — scoped to what this
schema can actually verify (an approved linked copy; enough already-placed
or enough eligible open slots to meet `quantity_required`), not a real
inventory/spacing engine. `listObligationPlacementContexts()` in
`lib/underwriting/queries.ts` is shared by the dashboard and the contract
detail screen so the two don't drift on how "existing placements plus
currently-placeable slots" is combined — flagged as duplicated by the same
self-review before being extracted.

**Underwriting & Traffic: Slice 4 (scheduling and confirming makegoods) has
landed** — Workflow F. One migration
(`20260807240000_underwriting_makegoods.sql`) adds `uw_makegoods`, reusing
every mechanism Slice 2 already built rather than adding new ones:
scheduling a makegood's slot goes through the identical
`log_place_underwriting_credit()`/`log_list_placeable_rundown_items()` pair
the contract page's own "Place a credit" form already calls
(`lib/underwriting/placement.ts`), and cancelling one that already has a
slot reuses `log_clear_underwriting_credit()` too — nothing writes into
`log_rundown_items` or `log_broadcast_events` directly, and
`log_broadcast_events`' insert policy stays scoped to `has_log_access` only
(hosts). §5's literal column list makes `uw_makegoods.status` a three-value
enum (`scheduled` | `aired` | `cancelled`) with `scheduled_placement_id`
nullable "until scheduled" — a makegood record can exist before a slot is
chosen (status stays `scheduled`, `scheduled_placement_id` null) and after
(`scheduled_placement_id` set once a slot is picked, status still
`scheduled` until confirmed aired); the "awaiting a slot" vs "slot chosen"
distinction is derived at read time (`lib/underwriting/makegoods.ts`,
pure and tested), not a fourth stored status, the same "derived, not
stored" discipline `uw_placement_obligations.status` already follows.
`uw_update_makegood_from_broadcast_event()` (an `after insert` trigger on
`log_broadcast_events`, security definer for the same reason Slice 3's
`uw_flag_exception_from_broadcast_event()` is) flips a scheduled makegood to
`aired` the moment its own placement's rundown item is confirmed aired as
scheduled — the other half of "tracked through to its own broadcast event."
If a makegood's own airing is itself missed or moved, this trigger leaves
it alone and Slice 3's own trigger already raises a fresh `uw_exceptions`
row against it, since that trigger doesn't distinguish an original
placement's rundown item from a makegood's — the recursive resolution path
the design doc implies, with no new code needed for it. Ordinary
member-level RLS throughout, no manager gate — §3F lists this workflow
under "traffic staff," not §6's four privileged actions. The exception
detail screen gained a "Makegoods" panel (create a bare record against an
exception) and a new `/underwriting/makegoods` screen (Workflow F's own
screen per §4) is where a slot actually gets picked or a makegood gets
cancelled.

**Underwriting & Traffic: Slice 5 (generating affidavits) has landed** —
Workflow G, the last of milestone 1's seven workflows. One migration
(`20260807250000_underwriting_affidavits.sql`) adds
`uw_affidavits`/`uw_affidavit_line_items` (§5's literal columns —
`uw_affidavit_line_items` has no separate id, a composite
`(affidavit_id, log_broadcast_event_id)` primary key, same shape as
`uw_contract_copy`'s own join-table precedent) plus a broadened read policy
on `log_broadcast_events`: Slice 3's own
`log_broadcast_events_select_for_underwriting` is scoped to broadcast
events an `uw_exceptions` row already references, correct for the exception
queue but too narrow for affidavit generation, which needs every broadcast
event behind a contract's placements in a period — including the compliant
majority that never became an exception. The new
`log_broadcast_events_select_for_underwriting_placements` policy is
additive, not a replacement, and — like Slice 3's own
`exception_read_fix` — keyed off a permanent reference
(`uw_scheduled_placements` rows are never deleted or repointed, only marked
superseded) rather than `log_rundown_items.item_kind`'s current,
reassignable state, so it doesn't reintroduce that bug. Generating an
affidavit is ordinary application-layer orchestration
(`lib/underwriting/queries.ts`'s `findAffidavitEvidence()`,
`affidavit-actions.ts`'s `generateAffidavit`) over existing reads, not a
security definer function — unlike Slice 2's placement boundary, nothing
here writes into a table this tool doesn't already own. Regenerating for
the same contract/period is allowed and produces a new, separately
versioned affidavit (`lib/underwriting/affidavits.ts`'s
`buildReportIdentifier`, pure and tested) rather than overwriting the
previous one. Certifying an affidavit (`status` → `certified`) is one of
§6's four privileged, manager-only actions, enforced by
`uw_guard_affidavit_certification()` — a before-update trigger in the exact
shape of Slice 3's `uw_guard_exception_resolution()` — not the Server
Action, so the boundary holds no matter how the table is ever written.
Milestone 1's affidavit stays a structured on-screen record styled for
browser print (`/underwriting/affidavits/[id]`, a `print-button.tsx` client
component calling `window.print()`), per §6's "no PDF generation" — not a
generated PDF.

That completes every workflow `docs/underwriting-design.md` §7 lists for
milestone 1. Nothing further (automatic rules-based scheduling, true PDF
generation, automation-system export/reconciliation, scheduled
proof-of-performance delivery — all listed in that section as deferred) is
authorized to start without its own instruction.

**FCC Reporting: design is done, not yet authorized to build.** The third of
the three tools, depending on a real backlog of tagged `log_broadcast_events`
existing before quarterly aggregation is worth building against, so it stays
last regardless of when its design doc was written. `docs/fcc-reporting-design.md`
was written the same day as the strategy doc and the other two tools' design
docs, but had no CLAUDE.md entry until now — same staleness this section's
Underwriting entry above already explains, and now fixed in the strategy
doc's §8 too. Read it before starting any of it.

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
(the in-portal agent) has landed**: `src/components/agent-chat-widget.tsx` renders a chat
panel mounted in the portal layout (`src/app/(portal)/layout.tsx`) for every signed-in
user, backed by `src/app/api/agent/chat/route.ts` and `src/lib/agent/chat.ts`'s
`streamAgentTurn()`, driven by OpenAI's Responses API (`OPENAI_API_KEY`, the same key
already configured for Sourcework's embeddings) and streamed over SSE so replies render
as the model generates them rather than only after a whole tool-calling turn finishes.
The agent is deliberately "just another MCP client": `src/lib/agent/mcp-client.ts`
connects to a fresh in-process instance of the same `buildMcpServer()` Phase C built, over
a linked in-memory transport, instead of calling `registry.invoke()` directly — same tool
set, same confirmation gating, same `mcp.*` audit event per call an external MCP client
would get. A `confirmation: "required"` capability's `confirmed` field is stripped from
what the model ever sees (`src/lib/agent/tool-bridge.ts`) and is only ever set after an
explicit approve/decline round-trip with the signed-in user in the widget — never trusted
from the model's own output. There is still no chat-history table or job queue: the full
conversation round-trips through the client on every request. **Phase E (external
Claude/ChatGPT clients) is next — do not start it without an explicit instruction**, and
still needs its own auth design first (design doc §8) — Phase D's cookie-based session
auth doesn't extend to a client with no browser session.

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
src/app/(portal)/academic-partnerships/  Academic Partnerships (pipeline, all submissions,
                            settings) — its own route segment, gated by
                            requireToolAccess("academic-partnerships")
src/app/(portal)/log/     Log (clocks, programs — slice 1 of its milestone 1; see above) —
                            its own route segment, gated by requireToolAccess("log")
src/app/join/[token]/      Remote Interview's guest-facing join link — deliberately
                            outside both (portal) and (auth), since a guest has no
                            profile — see docs/remote-interview-design.md, "Fit with
                            portal conventions"
src/app/listen/[publicId]/ Audience Listening's public participation page, and /embed for
                            the Grove iframe. Outside (portal)/(auth) for the same reason
                            as /join, and listed in the middleware's PUBLIC_PATHS
src/app/partner/           Academic Partnerships' public inquiry form, and /embed for the
                            Grove iframe. Outside (portal)/(auth) for the same reason as
                            /join and /listen, and listed in the middleware's
                            PUBLIC_PATHS — but unlike those two, needs no session at all,
                            not even an anonymous one (see the milestone note above)
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
src/lib/academic-partnerships/  Academic Partnerships' access gate + role (access.ts,
                           roles.ts), staff data reads (queries.ts), the domain activity
                           log (activity.ts), the public route's read (public.ts) and
                           IP-hash rate-limit helper (rate-limit.ts, server-only), plus
                           pure, tested modules — pipeline/disposition state (pipeline.ts),
                           partnership types + public-form validation
                           (partnership-types.ts), embed code (embed.ts), and email
                           template interpolation (email.ts)
src/lib/log/               Log's access gate + role (access.ts, roles.ts), staff data reads
                           (queries.ts), plus pure, tested modules — clock-version
                           resolution (clock-versions.ts) and schedule-entry-active-on-a-date
                           logic (schedule.ts). Slice 1 only (see "Log" above); later slices'
                           timing engine, content-eligibility filtering, etc. land here too
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

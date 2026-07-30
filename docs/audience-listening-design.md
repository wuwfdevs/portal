# Audience Listening — Product & Engineering Design

Status: **Milestone 1 built.** Schema, RLS, storage, internal screens, the public
participation route, and the Transcription Workspace handoff all land together —
see §7 for what is in this milestone and what is deliberately deferred.
Scope: the fourth tool in the WUWF Tools Portal, at `/audience-listening`, with a
public participation surface at `/listen/<public id>`.

Written 2026-07-30, at the point `CLAUDE.md`'s guardrail ("do not build the
Audience Listening tool without an explicit instruction to start that phase") was
lifted.

Read alongside `docs/transcription-workspace-design.md` (the tool this one hands
off to) and `docs/remote-interview-design.md` (whose guest-join route is the
closest existing precedent for a public, account-less flow). Where this document
describes something those two already solved, it says so and reuses their answer
rather than inventing a second one.

---

## 1. The problem we're solving

A reporter working a story about housing costs wants to hear from people it is
happening to. The tools available today are all wrong in the same way: a Google
Form collects text, not voice; a call-in line collects voice but no structure and
no consent record; a social post collects neither reliably and cannot be worked
through afterward. What the newsroom actually needs is the middle: **a small,
ordered set of questions, answered in the listener's own voice, arriving grouped,
with consent and attribution recorded once and attached to the whole thing.**

The value is entirely in what comes out the other end. A submission is not a
survey response — it is raw tape with provenance. It has to reach the
Transcription Workspace as cleanly as a recorded interview does, or the reporter
will do the work by hand and stop using the tool.

Two constraints shape everything below:

1. **The participant is not a user.** They arrive from a link in a Grove article,
   on a phone, once. They do not have an account, will not create one, will not
   install anything, and will not come back to fix a failed upload. Whatever the
   flow asks of them has to be answerable in one sitting, and whatever goes wrong
   has to be explained in a sentence.

2. **This is a public write surface.** Everything else in this portal is written
   by an authenticated staff member whose row-level identity is the security
   boundary. Here, anyone on the internet can create rows and upload audio. That
   inverts the usual assumption and is the reason for §6's central architectural
   decision.

What this tool is **not**: a survey platform, a form builder, a comment system,
a public response gallery, a polling tool, a transcript editor, or a clip
library. It ends at "grouped, consented, reviewable audio, with a one-click path
into the Transcription Workspace."

## 2. Product model

**The query is the central object** — one query per listening initiative. The
durable hierarchy is exactly the one the brief describes:

```
Query (one listening initiative)
├── questions      (1–5, ordered; prompt, guidance, required, max duration)
└── submissions    (one per participant, grouped and consented as a unit)
    └── answers    (one audio recording per question answered)
        └── handoff (optional tw_projects row created from that one answer)
```

Five constraints:

1. **A submission is the unit of consent; an answer is the unit of use.** The
   participant agrees once, to terms covering the whole submission, and is told
   plainly that WUWF may use one answer without using the others. That sentence
   is not decoration — it is what makes per-answer handoff to transcription
   editorially honest.

2. **Question wording is snapshotted onto the answer.** A reporter will reword a
   question after seeing the first few responses. Every answer therefore carries
   the exact prompt, its position, and whether it was required *as presented to
   that participant*. Nothing downstream ever has to ask "but which version of
   question 2 was this?"

3. **One answer, one transcription project.** The Transcription Workspace models
   one source media file per project (`tw_projects` folds media in as columns —
   see its design doc §2). Rather than bend that, an answer becomes its own
   project. Three answers means up to three projects. The grouping stays here, in
   Audience Listening, which is the only place it means anything.

4. **The original is never replaced.** The file the participant's browser
   uploaded stays in `audience-listening-media` untouched forever. Transcription
   handoff *copies* into `transcription-media`; it does not move or re-encode.

5. **Nothing is public but the questions.** No response gallery, no vote counts,
   no participant-visible anything beyond their own in-flight submission. The
   public route is a write surface with a read of the prompts, and nothing else.

### Relationship to the existing tool registry

The `audience-listening` row is currently seed-only
(`supabase/seed.sql:85-87`), pointing at the generic placeholder route with
`status = 'planned'`:

|                | Now                                          | After this milestone                                                                          |
| -------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| description    | "Organize and analyze structured audience input." | "Collect recorded answers from the public to a short set of questions, and review them here." |
| route          | `/tools/audience-listening` (placeholder)    | `/audience-listening`                                                                          |
| status         | `planned`                                    | `available`                                                                                    |
| default_access | `invite_only`                                | `invite_only` (unchanged)                                                                      |

Following the Transcription Workspace and Remote Interview precedent, the row is
maintained by this tool's own migration rather than seed data, so it exists
wherever the migration has been applied. Because the row is seed-only today and
may or may not exist on a given project, the migration uses
`insert … on conflict (key) do update` rather than a bare `update` (Remote
Interview's migration used the latter, which silently no-ops on a project whose
seed never ran).

`tool_access.tool_role` is not used by this tool. Anyone with a grant can do
everything; there is no editor/reviewer split. That matches the Transcription
Workspace's shared-workspace model, and a newsroom this size does not need a
second permission vocabulary.

## 3. Primary user workflows

### A. Creating a query (staff)

New query → internal title, public title, public intro. That is the whole
creation form; everything else is configured in the workspace, where the reporter
can see it. The query starts as a **draft**, which is invisible to the public in
every sense — the public route reports "not available" for a draft exactly as it
does for a public id that does not exist, so a draft's link cannot be probed for
existence.

The workspace has five tabs: **Overview**, **Questions**, **Settings**,
**Submissions**, **Share**.

### B. Questions

One to five, ordered, each with a prompt, optional public guidance, optional
internal context, a required/optional flag, and a maximum recording length.
Add, edit, reorder, duplicate, remove.

The five-question ceiling is enforced by a database trigger, not just by the UI —
this is the sort of limit that gets worked around by an action nobody remembered
to guard.

Once a query has submissions, question *wording* stays editable (the reporter
learns what the question should have said from the first responses) but questions
can no longer be deleted or reordered, and the screen says why: existing answers
carry the wording they were given, and renumbering would make historical answers
ambiguous. Editing shows the same warning.

### C. Settings

Three groups, one form:

- **Participant information** — name, city/community, email, phone, note. Each is
  independently `hidden` / `optional` / `required`.
- **Consent and attribution** — whether to ask for contact permission, whether to
  ask for name attribution, whether to offer the "please consider my responses
  anonymously" request, and the consent text itself (defaulted, editable).
- **Publication and transcription** — opening and closing dates, and whether
  eligible answers are queued for transcription automatically or left for manual
  review.

### D. Opening, sharing, and closing

Opening a query flips `status` to `open` and makes the public route live (subject
to `opens_at`/`closes_at`). The **Share** tab gives two things and asks the
reporter to write no HTML:

- The standalone public URL, `https://<site>/listen/<public id>`.
- A Grove-ready iframe snippet pointing at `/listen/<public id>/embed`, with an
  accessible `title`, `allow="microphone"`, `width="100%"`, `loading="lazy"`, and
  a height computed from the question count.

Closing sets `status = 'closed'`. Archiving sets `status = 'archived'` and is the
"this is finished" state — submissions, answers, and transcription links are all
preserved; nothing is deleted.

### E. Review

The Submissions tab lists submissions with participant, submitted date, answer
count, review state, and transcription state. A submission's detail screen shows
the participant information and the three consent choices as separate lines
(they are separate questions and must never be collapsed into one "consented"
badge), then every question in order — answered with a player, or marked skipped.

Staff can mark the submission or an individual answer reviewed, flag it, or
reject it, and can add a short internal note at either level. Rejection is a
review state, not a deletion; nothing in this tool deletes a participant's audio.

### F. Handoff to the Transcription Workspace

Per answer: **Send to transcription** creates a `tw_projects` row, copies the
audio into `transcription-media`, and kicks off the existing ASR pipeline —
literally the same `startTranscriptionForProject()` the Transcription Workspace's
own upload path calls (extracted to `lib/transcription/ingest.ts` for this, and
now shared rather than duplicated). Afterwards the answer shows the project's
status and an **Open in Transcription Workspace** link. A failed handoff shows
the reason and a **Retry** button.

What rides along, in the project's background text (which is the field the
Transcription Workspace's design doc §3G calls the whole context story, and which
its embeddings are built from):

- the query's public title,
- the exact question prompt and its position,
- the submission date,
- the participant's name and city — **only when they gave permission to be
  identified and did not request anonymity**; otherwise the line reads
  "withheld at the participant's request",
- the participant's own note,
- the three consent answers as plain yes/no,
- a durable link back to this submission and answer.

Contact details (email, phone) deliberately do **not** cross over. They are not
editorial context, the Transcription Workspace is a wider shared workspace than
this tool, and a phone number in a searchable, embedded background field is a
privacy problem waiting to happen.

### G. What a participant does

1. Reads the introduction; sees how many questions and roughly how long.
2. Presses **Begin** — a deliberate act, and the first moment any identity or row
   is created for them.
3. Grants the microphone **once**, on a dedicated screen, and can test it.
4. Answers questions one at a time: record → stop → listen back → redo, or
   continue. Optional questions can be skipped. They can go back to a previous
   question at any point.
5. Reviews the full set, and can replace any single answer without touching the
   others.
6. Fills in whatever participant information the query asks for.
7. Makes the contact / attribution / anonymity choices, reads the consent terms,
   and ticks the one required box.
8. Submits, watches the progress, and gets a confirmation that says what happens
   next and what does not (no automatic publication, no guaranteed response).

Each answer is uploaded as soon as the participant continues past it, not held to
the end. That is what makes "this answer is saved" true when the screen says it,
and it is why one failed upload cannot cost the participant the other answers.

## 4. Screens

| Route                                                       | Who        | What                                                                    |
| ----------------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `/audience-listening`                                       | staff      | Query list: status, question count, submissions, unreviewed, owner       |
| `/audience-listening/new`                                   | staff      | Create a draft query                                                     |
| `/audience-listening/[id]?tab=…`                            | staff      | Workspace: overview, questions, settings, submissions, share             |
| `/audience-listening/[id]/preview`                          | staff      | The public experience, rendered read-only, for a draft or open query     |
| `/audience-listening/[id]/submissions/[submissionId]`       | staff      | One grouped submission and its answers                                   |
| `/listen/[publicId]`                                        | **public** | Standalone participation page                                            |
| `/listen/[publicId]/embed`                                  | **public** | The same flow, chrome-free, for a cross-origin iframe                    |

The public routes live at `/listen`, outside both `(portal)` and `(auth)`, for
the same reason Remote Interview's `/join/[token]` does: a participant has no
profile, never signs in through `/login`, and must never see portal chrome. Both
are added to the middleware's `PUBLIC_PATHS`.

`/listen/[publicId]` and `/listen/[publicId]/embed` render the identical flow
from one component; the only differences are the outer padding, the WUWF wordmark
(shown standalone, suppressed in the embed where the article already provides
context), and the embed's "microphone blocked here — open in a new tab" affordance.

## 5. Data model

Four tables, prefixed `al_`, following the `tw_`/`ri_` precedent.

### `al_queries`

The initiative. Carries the public id, both titles, the public introduction,
internal notes, status, the open/close window, the five participant-field modes,
the consent/attribution configuration and text, and the transcription mode.

`public_id` is 16 characters from a 32-character lowercase alphabet, generated
with `crypto.randomBytes` — ~80 bits of entropy, unguessable, and carrying no
information about the row. It is the only identifier that ever appears in a
public URL. Sequential ids do not exist in this schema at all (everything is
`gen_random_uuid()`), but a uuid still identifies a row across tools; the
separate opaque id keeps the public surface from having any handle on internal
identity.

### `al_questions`

`query_id`, `position`, `prompt`, `guidance`, `internal_context`, `required`,
`max_duration_seconds`. Position is a plain integer rewritten on reorder, the
same approach the Editorial Planning settings screens use for `sort_order` — no
unique constraint, because a swap under one would need a deferrable constraint or
a temporary value for no benefit. A trigger enforces at most five per query.

### `al_submissions`

One participant's grouped response. `participant_user_id` references
`auth.users` and is the anonymous identity established at **Begin**; it is
`on delete set null`, so a submission survives its anonymous auth user being
cleaned up. Participant fields, the three consent choices, `consent_agreed_at`,
`status` (`in_progress` → `submitted`), `submitted_at`, plus the internal
`review_state` / `internal_notes` / `reviewed_by` / `reviewed_at`.

A partial unique index allows at most one `in_progress` submission per
(query, participant) — reopening the page resumes rather than forking, and a
scripted client cannot accumulate half-finished rows.

### `al_answers`

One recording. Carries `submission_id`, `query_id` (denormalized so storage and
policy predicates do not need a second join), `question_id`
(`on delete set null`), and the **snapshot**: `question_prompt`,
`question_position`, `question_required`. Then the media (`storage_path`,
`content_type`, `size_bytes`, `duration_ms`), the upload `status`
(`pending` → `uploaded`, or `failed`), the internal `review_state`/`internal_note`,
and the transcription link (`transcription_state`, `transcription_project_id`,
`transcription_error`).

There is no `skipped` answer status: a skipped question simply has no answer row.
"Answered or skipped" is derived by comparing the query's questions against the
answers that exist, which stays correct even after a question is reworded.

`unique (submission_id, question_id)` is what makes a redo a replacement rather
than a second answer.

### Storage

One private bucket, `audience-listening-media`. Object key:

```
<query id>/<submission id>/<answer id>
```

Deliberately extension-less. A participant who redoes an answer on a browser that
picks a different container would otherwise leave the first upload orphaned under
a different key; a fixed key means a redo overwrites in place. The content type
lives on the row and on the object's metadata, and signed URLs set an explicit
download filename, so nothing user-facing depends on the key being readable.

## 6. Architecture

### The central decision: the public surface is a set of functions, not a set of tables

Everywhere else in this portal, RLS is the boundary and application code reads
tables directly. That works because every reader is a staff member whose whole
row is safe to hand them. It does not work here, for one specific reason: **RLS is
row-level, and this tool's rows are half public and half internal.** The same
`al_queries` row holds the public title a participant must read and the internal
notes they must never see. The same `al_submissions` row holds the participant's
own answers and the newsroom's review state and reviewer identity.

Column-level `GRANT`s can express that split, but they are granted per *role*,
and an anonymous participant and a staff reporter are both `authenticated` — so a
column grant tight enough for the participant would break the reporter.

So:

- **`al_*` table RLS is staff-only.** Every policy on all four tables requires
  `private.has_audience_listening_access(auth.uid())`. There is no participant
  policy on any of them.
- **The entire public surface is seven `security definer` functions**, each
  returning exactly the fields the public is allowed to see and validating
  exactly what it is allowed to do. They are the API, and being an explicit,
  enumerable list is the point — the public capability set is seven function
  signatures, reviewable on one screen.

This is the same reasoning that produced `ri_bind_guest_participant()` and
`ri_guest_join_waiting_room()` in Remote Interview ("a plain RLS update policy on
a guest's own row would also let them set their own `admitted_at`"), applied to a
whole surface rather than two calls.

The functions, all `security definer`, `set search_path = public`:

| Function                        | Callable by            | Does                                                                 |
| ------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `al_public_query`               | `anon`, `authenticated`| Returns the public view of a query + its questions, or null           |
| `al_start_submission`           | `authenticated`        | Creates (or resumes) this participant's `in_progress` submission      |
| `al_participant_progress`       | `authenticated`        | Which questions this submission has saved answers for                 |
| `al_reserve_answer`             | `authenticated`        | Creates/resets the answer row, snapshots the prompt, returns the path |
| `al_complete_answer`            | `authenticated`        | Marks the answer uploaded after a successful direct upload            |
| `al_save_participant_details`   | `authenticated`        | Writes only the participant/consent columns of an own, open submission|
| `al_finalize_submission`        | `authenticated`        | Validates everything and flips the submission to `submitted`          |

`anon` can call exactly one of them, and it only reads. Everything that writes
requires a real (if anonymous) session, established at **Begin**.

Two things this buys beyond confidentiality:

- **Server-side validation is unavoidable.** Required-question completion,
  required participant fields, consent, duration and size caps, the open window,
  and content-type allow-listing are all checked inside the database, in the same
  transaction as the write. A hand-crafted client cannot skip any of it.
- **The question snapshot is authoritative.** `al_reserve_answer` copies the
  prompt, position and required flag out of `al_questions` itself. The client
  never supplies them, so it cannot fabricate what it was asked.

### Storage is the one exception, and deliberately so

Uploads go **directly from the participant's browser to Supabase Storage**, never
through a Server Action — the repository's existing rule (`CLAUDE.md`, and the
Transcription Workspace's upload path) and the obvious one for audio. That means
the storage policies, unlike the table policies, do have to admit participants:

- `insert` / `update` are allowed when the object key sits under a submission the
  caller owns *and that submission is still `in_progress`* — expressed by
  `private.al_owns_open_submission_object(name, uid)`. A submitted submission's
  audio can no longer be overwritten by the participant who made it.
- `select` and `delete` are staff-only. A participant never reads back from
  storage (playback during the flow is from the in-memory blob), and nothing
  gives them the ability to remove their own submitted evidence — the same call
  Remote Interview made for guests.

The order of operations mirrors `createProject` → upload → `completeProjectUpload`:
**the row is created before the bytes exist.** `al_reserve_answer` returns a path
that is only reachable because a `pending` answer row already points at it. There
is no way to write an object that no row knows about, which is what "avoid
creating anonymous orphaned media objects" actually requires.

### Recording

The browser's native `MediaRecorder`, not the `extendable-media-recorder` WAV
pipeline Remote Interview uses. That tool needs lossless masters from a
professional guest on a laptop; this one needs a two-minute answer from a phone
on cellular, and Opus in WebM at ~32 kbps is both right and universally
supported. Format support genuinely differs — Chrome and Firefox give
`audio/webm`, Safari gives `audio/mp4` — so the candidate list is probed with
`MediaRecorder.isTypeSupported()` and the winner recorded on the row. Codec
parameters are stripped from the MIME string before upload
(`audio/webm;codecs=opus` → `audio/webm`), because the bucket's
`allowed_mime_types` matches exact strings.

The microphone is requested **once**, on its own screen, and the resulting
`MediaStream` is held for the whole session. Re-prompting per question is the
single most common way a flow like this loses people.

`audio/ogg` is added to the `transcription-media` bucket's allow-list by this
migration — a one-line additive change to another tool's bucket, needed because an
answer recorded as Ogg on some Firefox builds must be copyable into it. Without
it the handoff would fail for exactly one browser, at the last step.

### Transcription handoff

`sendAnswerToTranscription()` runs as the staff member, under RLS, and:

1. requires that they hold **both** tool grants, and says so plainly if not —
   `tw_projects`' insert policy would otherwise fail with nothing readable;
2. inserts the `tw_projects` row first (`status = 'uploading'`, `created_by` =
   the staff member — the person accountable for bringing it into the workspace);
3. downloads the answer object and re-uploads it to
   `<project id>/source.<ext>` in `transcription-media`. `copy()` with
   `destinationBucket` would avoid the round trip, but it is unverified against
   this project's storage version and an answer is at most a few megabytes;
4. writes the media columns and calls the shared
   `startTranscriptionForProject()`;
5. records the outcome on the answer, and audits it.

**"Automatic" transcription is automatic *eligibility*, not background
processing.** This repository has no job queue — the Remote Interview design doc
says so, and its own assembly step is host-triggered "never automatic, since
there's still no job queue." Finalizing a submission on an `automatic` query sets
every uploaded answer to `queued`; the workspace then shows "N answers queued"
with a one-click **Send queued answers to transcription**. On a `manual` query
answers stay at `none` and are sent one at a time after review. This is the
honest version of the requirement given what exists; §7 records it as the open
item it is.

There is no second ASR pipeline, no second webhook, no second provider adapter,
and no transcript storage in this tool. The Audience Listening screens show
`tw_projects.status` and link out.

### The Grove embed

The generated snippet is a plain iframe. No resizer script, no `pym.js`: the
embed's height is computed from the question count and stated in the snippet, and
the flow itself is built so that no screen needs internal scrolling — one question
at a time, one column, no nested scroll containers. A resizer would mean shipping
a script into someone else's page and a `postMessage` contract with a host whose
behavior we cannot test from here.

`next.config.ts` sets `Content-Security-Policy: frame-ancestors *` on `/listen/*`
only. Next sets no `X-Frame-Options` by default, so the routes are already
framable; the explicit header states the intent and keeps a future global CSP from
silently breaking every published embed.

Microphone access inside a cross-origin iframe requires the parent to delegate it
with `allow="microphone"`. When the reporter (or Grove) drops that attribute,
`getUserMedia` rejects with `NotAllowedError` and there is nothing the embedded
page can do about it — so the embed detects that it is framed
(`window.self !== window.top`), and on a permission failure offers a prominent
link to open the same query standalone in a new tab, rather than a dead end.

### Abuse protection

Without adding standing infrastructure, four layers:

1. **Identity costs something.** Writing anything requires an anonymous Supabase
   session, and Supabase Auth rate-limits anonymous sign-ins per IP at the
   project level. This is the front line and it is not ours to reimplement.
2. **Bounded per participant.** One `in_progress` submission per (query,
   participant) by partial unique index; at most three submissions total per
   (query, participant), checked in `al_start_submission`; at most one answer per
   (submission, question) by unique constraint.
3. **Bounded per answer.** Duration is capped by the question's own
   `max_duration_seconds` (plus a small tolerance for encoder overshoot) and size
   by `MAX_ANSWER_BYTES`, both checked in `al_complete_answer`; the bucket
   enforces its own size and MIME limits independently.
4. **Bounded in time.** `opens_at` / `closes_at` and `status` are checked inside
   `al_start_submission`, not just rendered.

What is deliberately *not* here: a CAPTCHA, an IP-address table, or a rate-limit
store. All three are standing infrastructure this repository does not have, and
adding one for a tool that has not yet been attacked would be exactly the
speculative infrastructure `CLAUDE.md` warns against. §7 records it.

### Accessibility

- Recording state, elapsed time, progress, upload state, and errors are all
  carried in **text**, never in color, animation, or an icon alone. The recording
  indicator is the word "Recording", the timer is digits, a saved answer says
  "Saved".
- The timer is **not** in a live region — a politely-announced value changing
  every second makes a screen reader unusable. It is `aria-live="off"` with an
  explicit `role="timer"`; a separate visually-hidden `aria-live="polite"` region
  announces only transitions ("Recording started", "Recording stopped, 42
  seconds", "Maximum length reached", "Answer saved").
- Each step is a labelled region with a heading, and focus moves to that heading
  on every step change, so a screen-reader or keyboard user is never left with
  focus on a button that no longer exists.
- Progress is announced as "Question 2 of 3" in text, not only as a bar. The bar
  is `aria-hidden`.
- Every control is a real `<button>` or labelled form control; nothing depends on
  hover, pointer position, or drag.

### Fit with portal conventions

Everything below is reuse, not new mechanism:

| Concern              | Reused from                                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| Access gate          | `requireToolAccess("audience-listening")` / `assertToolAccess` (`lib/auth/authz`) |
| Membership predicate | `private.has_audience_listening_access`, shaped exactly like `has_transcription_access` |
| Audit                | `logAuditEvent()` after every privileged write                                  |
| Read failures        | `unwrapRead()`                                                                  |
| Write failures       | `failIfError()` / `failWith()` from `lib/editorial/action-result`                |
| UI                   | `components/ui/*` — no new primitives                                           |
| Public route shape   | `/join/[token]`'s outside-the-route-groups placement and `GuestShell` pattern    |
| Anonymous identity   | `signInAnonymously()`, already enabled for Remote Interview                     |
| Direct upload        | The Transcription Workspace's row-then-upload-then-complete sequence            |
| ASR                  | `startTranscriptionForProject()`, extracted and now shared                      |

One portal-schema change is needed, and it is the narrowly-scoped additive kind
the `CLAUDE.md` conventions anticipate: an `audit_events` insert policy for
audience-listening members. The existing policies admit only administrators and
Editorial Planning editors, so without it every `logAuditEvent()` call from this
tool would fail RLS and be swallowed by that helper's `console.error`.

> Noted while doing this, not fixed here: **Remote Interview has that same gap
> today.** Its actions call `logAuditEvent()`, but no policy admits
> remote-interview members, so a non-administrator host's session/participant
> actions are not actually being audited. It is out of scope for this milestone
> and belongs in a Remote Interview change.

### What's deliberately not in the architecture

- **No branching or conditional questions.** Sequential, 1–5, full stop.
- **No non-audio question types.** No text, scale, ranking, matrix, or choice.
- **No participant accounts, sessions across devices, or "edit your submission".**
- **No public gallery, comments, votes, reactions, or sharing.**
- **No resumable/chunked upload.** An answer is one short file and one request.
  The Remote Interview technical assessment established there is no resumable
  upload infrastructure here; a two-minute Opus file does not justify building it.
  A failed upload is retried from the blob still in memory.
- **No thematic analysis, clustering, or summarization.**
- **No second transcript or clip surface.**
- **No job queue, notification layer, or error reporting.** Same as every other
  tool in this repository, and called out so the "automatic transcription"
  compromise above reads as a consequence rather than an oversight.

## 7. Milestone 1, and what is left

**In this milestone** — the whole path works end to end in a local or preview
environment:

1. Schema, RLS, the seven public functions, the storage bucket and its policies,
   the registry row, and the `audit_events` policy.
2. Internal: query list, create, workspace (overview / questions / settings /
   submissions / share), staff preview, submission detail with playback, review
   states and notes, per-answer transcription handoff and retry, archive.
3. Public: `/listen/[publicId]` and `/listen/[publicId]/embed`, the full
   record-review-redo-skip-back flow, participant information, consent, grouped
   submission, and confirmation — including the failure states in §"Important
   public states" of the brief.
4. Transcription: a real handoff into `tw_projects` through the shared ingest
   path, with status and links surfaced.
5. Tests around the pure logic: public-id validation, public availability
   derivation, participant-field and completion rules, media allow-listing and
   paths, embed generation, and review-state derivation.

**Open, and honestly open:**

- **"Automatic" transcription still needs a hand.** It queues; a human clicks
  once. A real background drain needs a job runner this repository does not have.
- **Abuse protection leans on Supabase Auth's per-IP limits.** No CAPTCHA, no
  rate-limit store. Fine for a newsroom callout linked from one article;
  revisit before a query is promoted anywhere it could attract a flood.
- **The embed's height is a guess based on question count.** No resizer, by
  choice. If Grove turns out to expose a resizing contract worth targeting, that
  is a small, well-bounded follow-up.
- **The migration is not self-applying.** Like every migration here, it must be
  applied to the preview project, verified, then production — and anonymous
  sign-ins must be enabled in both dashboards (already required by Remote
  Interview, and now required by a second tool).
- **Nothing here has met a real browser on a real phone.** The recording,
  permission, and format-fallback logic is written against the documented
  behavior of `MediaRecorder`; the first thing to do with a preview deployment is
  run the flow on an actual iPhone and an actual Android device, inside a real
  Grove embed.

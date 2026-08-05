# Academic Partnerships — Product & Engineering Design

Status: **Milestone 1, in progress.** Schema, RLS, the public inquiry form, and
the internal pipeline land together — see §7.

Scope: the sixth tool in the WUWF Tools Portal, at `/academic-partnerships`,
with a public inquiry form at `/partner` (and `/partner/embed` for Grove).

Written 2026-08-03, in response to an explicit instruction to build it. The
strategic context is `WUWF Applied Media Partnership Program`, item 3 of the
"Student Engagement, Faculty Partnership and Institutional Alignment" memo:
give faculty one recognizable way to propose a partnership, instead of ad hoc
class visits and individual relationships nobody tracks.

Read alongside `docs/audience-listening-design.md` — the closest existing
precedent for a public, account-less write surface — and
`docs/roadmap-design.md` — the closest precedent for a staff-only workflow
tool with a status pipeline and a guard trigger. Where this document reuses
either tool's answer rather than inventing a new one, it says so.

---

## 1. The problem we're solving

A faculty member wants to connect a course, a student, or their own research
to WUWF. Today that happens through whoever they happen to know at the
station, or not at all. Nothing tracks the inquiry, nothing reminds staff to
follow up, and nothing distinguishes "we should do this" from "we said we'd
look into it four months ago and never did."

This tool is the front door and the tracker: a public inquiry form feeds a
staff-run pipeline from **New** through **Active** to **Completed**, with
**Deferred**/**Declined**/**Withdrawn** as the ways an inquiry can end early.
It is not a CRM, not an outreach tool, and not a way to solicit interest —
see §8 for the explicit non-goals.

Two things shape everything below, both direct reuses of Audience Listening's
architecture:

1. **The submitter is not a user.** A faculty member fills out a form once,
   from a link in an email, a department newsletter, or a Grove article about
   the program. They never sign in, never come back to check status, and
   never see anything past the confirmation screen.

2. **This is a public write surface**, but a much narrower one than Audience
   Listening's: one submission, one request, no session, no follow-up upload,
   no resumable multi-step flow. That narrowness is what lets this tool skip
   most of the machinery Audience Listening needed (§3).

## 2. Product model

```
Settings (singleton: open/closed, copy, enabled types, appointments URL)
Email templates (7, keyed, editable)
Submission (one per faculty inquiry)
└── Activity events (chronological: received, notes, stage changes,
    assignments, email actions, decisions — the visible history)
```

One wide `ap_submissions` row per inquiry. The field list is fixed by the
program, not user-configurable — this is deliberately **not** a form
builder (see §8) — so every field the brief asks for is a real, typed,
searchable column, not a JSON blob. The only structured JSON in the schema is
each activity event's `metadata` (small, heterogeneous, write-once, never
queried by field).

### Pipeline stages

Seven primary stages, matching the workflow in the brief exactly:

```
new → reviewing → meeting_requested → scoping → approved → active → completed
```

Three **dispositions** — `deferred`, `declined`, `withdrawn` — are not
additional pipeline columns. A submission carries a `stage` (its position in
the pipeline, preserved even after it closes) and, separately, an optional
`disposition` that takes it out of the active board when set. This mirrors
`ep_pitches`' `archived_at`/`archived_reason`/`archived_by` triple exactly,
renamed to the vocabulary the brief uses (`disposition`/`disposition_reason`)
and widened to three values plus `archived` itself, which the brief also
asks for as a distinct staff action. A `completed` submission has no
disposition — completion is success, not closure-by-exception.

### Partnership types

Six fixed values (the brief's own list), a Postgres enum rather than a lookup
table — there is no product intent to let staff invent new types, only to
enable or disable which of the six are currently offered on the public form
(`ap_settings.enabled_partnership_types`).

## 3. Architecture: why this public surface is simpler than Audience Listening's

Audience Listening's central decision (§6 of its design doc) is that its
public surface has to be **a set of `security definer` functions, not a set
of tables**, because the *same row* holds both public and internal data, and
because participants make several separate authenticated calls across a
multi-step recording flow — which is what forced a whole parallel,
non-cookie Supabase client to survive a cross-origin Grove iframe.

Academic Partnerships shares the "public write surface" problem but not the
other two:

- **No row is ever read back by the public.** `ap_submissions` is entirely
  internal from the moment it's created — there is no faculty dashboard, no
  "check your submission status" (explicitly out of scope, §8). So there is
  no split-row problem RLS can't express.
- **No multi-request session.** The whole interaction is one page load and
  one submit — no recording, no resumable upload, no "come back and finish
  later." A plain Next.js Server Action is a single POST from the browser
  the page is already loaded in; it needs no cookie to be read back on a
  *later* request, which is specifically the failure mode that forced
  Audience Listening off `@supabase/ssr`'s cookie-based client. So this form
  uses an ordinary `<form action={submitInquiry}>` Server Action, the
  portal's default pattern, calling the normal cookie-based
  `lib/supabase/server.ts` client — no `signInAnonymously()`, no dedicated
  public client, no participant identity at all.

What's kept from Audience Listening's playbook, because the reasoning still
applies:

- **The public API is still an enumerable list of `security definer`
  functions**, not a table RLS policy admitting `anon`. `ap_submissions`
  RLS stays staff-only, full stop — mirroring "there is no participant
  policy on any of them." Two functions:
  - `ap_public_form_config()` — the public view of settings: whether it's
    open, the intro copy, which partnership types are enabled. `anon` and
    `authenticated` may call it; it only reads.
  - `ap_submit_inquiry(payload jsonb, ip_hash text)` — validates
    (open/closed, required fields by partnership type, email shape, enabled
    type, rate limits — all inside the same transaction as the write, so a
    hand-crafted request can't skip any of it), inserts the submission with
    `stage = 'new'` and every internal field left at its default/null, and
    inserts the first activity event (`received`, `actor_id = null` for
    "the public, not a staff member"). Returns the new id or an error code;
    the confirmation screen is rendered from a fixed copy string plus
    `ap_settings.confirmation_copy`, never from anything the function
    returns about internals.
- **Server-side validation is unavoidable**, for the same reason: a
  `security definer` function is the only place a required-field-by-type
  rule and a rate limit can be enforced in the same transaction as the
  insert.

### Abuse protection

No CAPTCHA, no rate-limit store, no IP table — Audience Listening's design
doc calls owning either "speculative infrastructure `CLAUDE.md` warns
against," and nothing about this form changes that call. Instead, the same
shape of defense, adapted to having no participant identity to bound:

1. **A honeypot field.** A form input hidden from sighted users via CSS (not
   `display:none`/`hidden`, which some bots skip) that must arrive empty;
   `label`ed and `aria-hidden` so it is invisible and inert to assistive
   technology too. A filled honeypot is silently accepted and dropped
   (§"never tell an attacker what tripped the check").
2. **A minimum elapsed-time check.** The form's render time travels in a
   hidden field; `ap_submit_inquiry` rejects anything submitted in under a
   few seconds as machine-speed.
3. **Bounded per submitter, inside the function, in the same transaction as
   the write** — exactly `al_start_submission`'s "one participant, one
   query, three tries" shape, keyed on the two things we actually have: at
   most 3 submissions with the same email in 24 hours, and at most 5 from the
   same `ip_hash` (a salted hash of `x-forwarded-for`, computed in the Server
   Action via `next/headers`, never the raw IP) in one hour.
4. **Bounded in time.** `ap_settings.is_open` is checked inside the
   function, not just used to hide the form.

### Kanban and drag-and-drop

Nothing in this repository does drag-and-drop today — no library is
installed, and Editorial Planning's and Audience Listening's own reordering
(pitches in a meeting slate, questions in a query) both use plain up/down
`<button>` forms, not a DnD library (`components/editorial/reorder-buttons.tsx`).
The brief explicitly asks for draggable kanban cards, though, and a real
kanban board is the one part of this tool's UI that a button-based
alternative would make substantially worse — so this is the one new
dependency this module adds: **`@dnd-kit/core`**, a small (~10 KB gzipped),
actively maintained, dependency-free drag-and-drop primitive with first-class
keyboard support. `@dnd-kit/sortable` is not needed — cards move *between*
columns (a stage change), not to a specific position within one, so
`DndContext` + `useDraggable`/`useDroppable` alone is enough.

Every card also carries a plain "Move to…" `<select>` (a
`<form action={setStage}>`, same convention as `setPostStatus`), always
present, never hidden behind the drag interaction. That is not a fallback
bolted on for compliance — it is how a keyboard or screen-reader user, or
anyone on a touch device where drag is unreliable, moves a card at all.
`@dnd-kit`'s keyboard sensor supports dragging by keyboard too, but a native
`<select>` inside a `<form>` needs no JavaScript to work and is the more
robust of the two, so it stays.

### Tags

The brief says "apply tags if the portal already has a reusable tagging
system." It doesn't — checked across every tool's schema and
`components/ui/`. Building a general tag system for one tool's benefit is
exactly the speculative infrastructure `CLAUDE.md` warns against, so
Milestone 1 ships without tags. If a second tool wants them later, that's the
point at which a shared system earns its cost.

### Files and attachments

The brief's field list asks for "supporting links or materials," not file
upload — the research-partnership path collects this as a plain text field
(newline-separated URLs/citations). No storage bucket, no upload flow, no
RLS-on-storage-objects surface for Milestone 1. Audience Listening's own
storage policies took two tries to get right (`al_media_select_own` fixed a
production bug caused by `upsert: true` needing an unexpected `select`
grant) — real complexity this tool doesn't need to take on for a field the
brief never actually asks to be a file.

### Email

There is no transactional email sender anywhere in this repository —
confirmed by grep; the only real email-sending is Supabase Auth's own
invite/magic-link mail, used exclusively for account creation. Building a
provider integration (Resend, SendGrid, SMTP) for one tool's "send an email"
button would be new standing infrastructure the brief itself anticipates
might not exist ("If reliable email sending is not currently implemented,
support a clean draft, copy, or mailto workflow without making email
delivery a blocker"). So: every email action in this tool prepares a subject
and body from a template (interpolating the submission's fields, the
configured Google Appointments URL, and any staff-added context), and
presents it with a `mailto:` link and a copy-to-clipboard button — the same
`CopyButton` component Audience Listening's Share tab uses for the embed
snippet. Nothing here claims the email was delivered; the activity log
records that staff *prepared and confirmed sending* an email of a given kind
(§4), which is the honest version of what the software can actually observe.

**Invite to Meet** is the one template wired to a side effect: after
confirming the draft was sent, the screen offers (checkbox, checked by
default) to also move the submission to `meeting_requested` — one Server
Action, one activity event, matching the brief's "when this action is
completed, move or offer to move the record to Meeting Requested."

## 4. Activity log

`audit_events` (the portal's cross-tool table) is **select-restricted to
administrators only** (`audit_events_select_admin_only`,
`20260722120001_rls_policies.sql`) — it is a portal-wide privileged-action
trail for administrators, not a per-entity history any tool member can read.
Every other tool that wants staff-visible history therefore keeps its own:
Editorial Planning's `ep_meeting_pitches` doubles as a review-history table,
Remote Interview logs `session_events`. This tool does the same with
`ap_submission_events` — a dedicated, staff-selectable (via
`private.has_academic_partnerships_access`), append-only table — while
*also* calling `logAuditEvent()` for the same key actions, per CLAUDE.md's
"every privileged write is audited" convention, so administrators keep their
portal-wide view too. The two are complementary, not duplicative: one is the
domain-specific timeline a reviewer reads on the submission screen, the other
is the cross-tool ledger an administrator reads.

`ap_submission_events.actor_id` is nullable. The one event with
`actor_id = null` is `received` — inserted by `ap_submit_inquiry()` itself,
which runs as a `security definer` function and therefore bypasses RLS the
same way `al_start_submission()` does, so no grant needs to admit the public
to this table at all.

## 5. Data model

Tables prefixed `ap_`, per `CLAUDE.md`'s directory conventions.

### `ap_settings`

Singleton (`id boolean primary key default true check (id)`, the same trick
`ep_settings` uses): `is_open`, `intro_copy`, `confirmation_copy`,
`enabled_partnership_types` (`ap_partnership_type[]`),
`google_appointments_url`, `updated_at`, `updated_by`.

### `ap_email_templates`

One row per template `key` (`meeting_invite`, `request_info`,
`narrower_scope`, `defer`, `decline`, `approve`, `follow_up`): `label`,
`subject`, `body` (plain text with `{{placeholder}}` tokens interpolated in
`lib/academic-partnerships/email.ts`), `updated_at`, `updated_by`. Seeded
with sensible defaults by the migration; editable from Settings.

### `ap_submissions`

Public fields (written once, by `ap_submit_inquiry`, never by staff):
`faculty_name`, `email`, `department`, `phone`, `partnership_type`,
`course_title`, `course_number`, `timeframe`, `enrollment_estimate`,
`learning_objectives`, `description`, `student_experience`,
`support_requested`, `deliverables`, `relevant_dates`, `may_publish`,
`additional_context`, plus the research-only fields (`research_topic`,
`research_summary`, `research_relevance`, `research_status`,
`research_links`, `research_dates`, `research_availability`) — populated
only when `partnership_type = 'faculty_research'`, left null otherwise, and
never re-derived or hidden: the brief's conditional fields are a form-UX
concern, not a schema concern.

Internal fields (staff-only, written by Server Actions): `stage`,
`stage_changed_at`, `stage_changed_by`, `disposition`, `disposition_reason`,
`disposition_by`, `disposition_at`, `owner_id`, `fit`, `capacity`, `timing`,
`primary_function`, `potential_staff_lead`, `key_considerations`,
`next_action`, `next_action_date`.

Metadata: `submitted_ip_hash` (spam-pattern review only, never shown
prominently), `created_at`, `updated_at`.

A trigger (`ap_stamp_stage_change`, mirroring `set_updated_at()`'s shape)
sets `stage_changed_at`/`stage_changed_by` whenever `stage` actually changes,
so "time in stage" on a kanban card is correct regardless of which code path
changed it.

### `ap_submission_events`

`submission_id`, `actor_id` (nullable), `event_type` (`received`,
`owner_changed`, `stage_changed`, `note`, `email_action`,
`appointment_shared`, `disposition_changed`, `assessment_updated`,
`next_action_updated`, `completed`), `note` (free text — the note body for a
`note` event, a short human-readable detail for others), `metadata` (jsonb —
structured detail: `{from_stage, to_stage}`, `{template_key}`, `{field,
old_value, new_value}`), `created_at`.

## 6. Screens

| Route                                         | Who        | What                                                              |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `/academic-partnerships`                       | staff      | Pipeline: kanban board across the 7 primary stages                 |
| `/academic-partnerships?view=all`              | staff      | All submissions: searchable, filterable table (active + historical)|
| `/academic-partnerships/[id]`                  | staff      | Submission detail: original response, internal fields, activity log|
| `/academic-partnerships/settings`              | staff      | Form preview, embed code, public URL, copy, types, appointments URL, templates |
| `/partner`                                     | **public** | Standalone inquiry form                                            |
| `/partner/embed`                               | **public** | The same form, chrome-free, for a cross-origin iframe               |

`/partner` and `/partner/embed` live outside both `(portal)` and `(auth)`,
for the same reason `/listen` does, and are added to the middleware's
`PUBLIC_PATHS`. `next.config.ts` gets a `frame-ancestors *` CSP header
scoped to `/partner/:path*`, mirroring the existing `/listen/:path*` rule.

Settings is gated the same way Roadmap's curation screen is: reachable by
any tool member, but the write actions (copy, templates, appointments URL,
enabled types, open/closed) require `assertAcademicPartnershipsAdmin()` —
this tool's own grant carrying `tool_role = 'coordinator'`, mirroring
Roadmap's curator role — matching the brief's "configuration and form
settings should be limited to appropriate administrators" without
overloading the *platform* administrator role, which this portal's
convention (`tool_access.tool_role` is free text, interpreted per-tool)
already supports.

## 7. Milestone 1, and what is left

**In this milestone:**

1. Schema, RLS, the two public functions, the registry row, and the
   `audit_events` policy.
2. Public: `/partner` and `/partner/embed`, conditional fields, honeypot +
   timing + rate-limit spam protection, open/closed enforcement, confirmation
   copy.
3. Internal: kanban pipeline (drag + keyboard-accessible "Move to…"), all-
   submissions table with search/filter, submission detail with the original
   response, internal assessment fields, and the activity log, owner
   assignment, notes, next action/date, defer/decline/withdraw/archive.
4. Email: mailto/copy drafting from 7 templates, Invite to Meet's
   stage-transition offer.
5. Settings: copy, enabled types, open/closed, appointments URL, templates,
   embed code + preview.
6. Tests around the pure logic: stage/disposition transitions, conditional
   field requirements, embed URL generation, rate-limit window checks.

**Open, and honestly open:**

- **No CAPTCHA.** Same bet Audience Listening made — revisit if the form is
  ever promoted somewhere that could attract a flood.
- **"Prepared and confirmed sending" is not "delivered."** There is no
  transactional email in this repository; see §3.
- **No faculty-facing status.** A submitter never learns their inquiry
  moved from Scoping to Approved except by a staff member telling them —
  deliberately, per the brief's own out-of-scope list (no faculty accounts,
  no faculty dashboard).
- **The migration is not self-applying.** Like every migration here, it
  must be applied to preview, verified, then production, and recorded in
  `supabase/migrations/APPLIED.md`.

## 8. Out of scope (from the brief, restated for reference)

Faculty accounts/authentication, faculty dashboards, prospecting/outreach-
list management, calendar sync, student records, internship application
management, project task management, facility reservations, equipment
checkout, formal agreements/e-signatures, cost-recovery calculations, a
general-purpose form builder, automated acceptance decisions, a public
faculty-expertise directory.

## 9. Revision (2026-08-05): multi-track wizard, a KPI dashboard, real email

Five changes landed together, in response to using the shipped Milestone 1
and finding real problems:

1. **`partnership_type` (one enum) became `partnership_types` (a non-empty
   array).** A faculty member proposing both a classroom visit and an
   applied project was previously forced to pick one. Migration
   `20260805120000_academic_partnerships_multi_track.sql` altered the
   column directly — safe because both projects still had zero real
   submissions — added a GIN index for the array-membership filter the
   kanban/table screens now use (`.contains()`), and rewrote
   `ap_submit_inquiry()` to validate a JSON array element-by-element rather
   than a single value. The research-fields requirement now checks
   `'faculty_research' = any(...)` instead of equality — a submission can
   name research alongside a teaching track and still get both question
   sets. `enrollment_estimate` was renamed `estimated_students_reached` in
   the same migration: the brief's "gather an estimate of students reached
   at the outset... to evaluate impact" is an overall, once-per-inquiry
   figure, not a single course's roster, so it moved out of the
   course-conditional fields into its own early step.

2. **The public form became a guided, multi-step wizard** (`partner-form.tsx`),
   not the single long page Milestone 1 shipped. Steps: about you → reach &
   timing (the students-reached estimate, asked early) → choose your
   track(s) (multi-select checkboxes, each with a plain-language description
   — `PARTNERSHIP_TYPE_DESCRIPTION` in `partnership-types.ts` — satisfying
   "present minimal contextual information... what the different
   collaborative tracks are") → about the partnership → what this could
   look like (conditional: any non-research track chosen) → research &
   expertise (conditional: `faculty_research` chosen) → a few more details.
   Every field from every step stays mounted in the DOM the whole time —
   only `hidden` toggles per step — so Back/Next never lose a value the way
   unmounting-and-remounting would. Per-step validation happens in JS
   (`goNext()` walks `[required]` elements within the current step's own
   ref and calls `reportValidity()`), not native whole-form validation,
   because most required fields are `hidden` (and therefore exempt from
   constraint validation) at any given moment.

   **A genuine bug, caught only by driving the form with Playwright and
   watching network traffic, not by reading the code:** the first
   implementation rendered the last step's button as `type="submit"` and
   every other step's as `type="button"`, switching via a ternary at the
   same JSX position. React patches that DOM node's `type` attribute in
   place rather than remounting it — and mutating a *just-clicked, still
   focused* button's type from `"button"` to `"submit"` mid-click fired a
   real, premature form submission (confirmed by a stray `POST` on the
   exact click that reached the final step), wiping every field. The fix:
   the button is now always `type="button"`; the final step's click handler
   calls `formRef.current?.requestSubmit()` instead, which submits through
   the exact same `useActionState` path a real submit click would, without
   ever putting `type="submit"` where `type="button"` sat a moment earlier.
   Worth remembering for any future step-based form in this portal.

3. **The kanban board's drag-and-drop didn't work**, for two compounding
   reasons found the same way (a stub page + Playwright, since the DB-backed
   route can't be driven in this sandbox — see the environment's egress
   policy). First, only a small "⠿" glyph was draggable, not the card
   itself — technically functional but not what "drag the box" means to
   someone using it; `kanban-board.tsx`'s `DraggableCard` now spreads
   `@dnd-kit`'s `listeners`/`attributes` on the whole card, relying on
   `PointerSensor`'s `activationConstraint: { distance: 6 }` to still let a
   plain click reach `SubmissionCard`'s `<Link>` underneath (confirmed both
   ways under test: a real drag moves the card and never navigates, a plain
   click navigates and never drags). Second, `@dnd-kit` generates internal
   ids (`aria-describedby`) from a module-level counter that isn't
   synchronized between the server render and the client's first render,
   producing a real hydration mismatch on every load. `kanban-board-field.tsx`
   now loads the board via `next/dynamic({ ssr: false })` — the same wrapper
   pattern `rich-text-field.tsx` uses for ProseMirror, for the same reason
   (no SEO/no-JS value in server-rendering a drag-and-drop widget, and it
   fully eliminates the mismatch rather than papering over it).

4. **The Settings embed preview was taller than its content.** Cause:
   `PartnerShell`'s embedded branch used `min-h-screen` — inside an iframe,
   `100vh` resolves to the iframe's own declared `height` attribute, not the
   content's actual height, so the wrapper always inflated to fill whatever
   number the embed snippet guessed, leaving a gap below short content.
   Fixed by dropping that `min-h-screen` (the wrapper now sizes to content,
   full stop) and, separately, making the Settings preview iframe
   self-measuring (`share-panel.tsx`'s `LivePreviewFrame`, a `ResizeObserver`
   on `iframe.contentDocument.body` — possible only because that preview is
   same-origin; the real Grove embed is cross-origin and still needs the
   static guess in `embed.ts`'s `EMBED_HEIGHT`, now `780` rather than the
   original single-page guess of `2600`, sized for the tallest *step*
   — "choose your track(s)" — now that the form is a wizard instead of one
   long page).

5. **Real email sending, via Resend** (`src/lib/email.ts`) — this portal's
   first transactional email sender, not just Academic Partnerships'.
   `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (`.env.example`); unset,
   `sendEmail()` returns a clear "not configured" failure rather than
   throwing or silently no-op'ing, following the same optional-external-
   service pattern as `DAILY_API_KEY`/`MISTRAL_API_KEY`. `email-panel.tsx`
   shows a primary "Send email" action (→ `sendInquiryEmail()` in
   `actions.ts`) whenever `isEmailSendingConfigured()`, and the manual
   mailto:/copy-to-clipboard path from Milestone 1 stays available
   regardless — via an explicit "I sent this myself instead" toggle when
   sending is configured, as the default (only) path when it isn't. Both
   paths converge on the same `afterEmailAction()` tail (activity log,
   `logAuditEvent()`, the Meeting-Requested stage offer), factored out so
   "how the email left this system" doesn't change what gets recorded
   afterward. What "I sent this email" records was never a delivery claim
   even before this change (see §3); `sendInquiryEmail()`'s failure path
   (a `failWith()` bounce with Resend's own error message) is the one place
   in this tool that now *can* speak to real delivery, and does — a failed
   Resend call is reported as a failure, never recorded as sent.

6. **A KPI dashboard** (`/academic-partnerships/dashboard`,
   `lib/academic-partnerships/dashboard.ts`) — stat tiles (total inquiries,
   active in pipeline, completed, estimated students reached — both
   all-time and active-only) plus bar breakdowns by stage, disposition,
   track, and department. Aggregation happens in application code over
   `listAllSubmissions({})`'s existing full read, not a new SQL aggregate
   function — appropriate at this tool's scale (revisit if submission
   volume ever makes that reduce slow). A submission naming two tracks
   counts toward both in the track breakdown, labeled as instances rather
   than submissions so the numbers don't quietly stop summing to the total.

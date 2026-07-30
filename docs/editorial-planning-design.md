# Editorial Planning — Product & Technical Design

Status: **implemented**, including the strategic/magazine refinement (schema in
`supabase/migrations/20260722130000_editorial_planning.sql` and
`supabase/migrations/20260730130000_editorial_strategic_refinement.sql`, logic in
`src/lib/editorial/`, screens under `src/app/(portal)/editorial/`). This document is
the design the implementation follows; treat it as the rationale record, and the code
as the source of truth for details that have since evolved. §10 covers the
refinement: a fuller pitch form organized around coverage pillars, a granular
strategic/enterprise rubric, a true core/modifier split (institutional alignment kept
visibly outside the editorial-merit score), reviewer recommendations and structured
concern flags, rubric profiles (strategic vs. immediate/emerging-news), and a narrowly
scoped post-selection story-planning phase. Everything in §1–§9 below still describes
the foundation those additions build on.

---

## 1. What the tool is (and is not)

A structured pipeline for the weekly editorial meeting:

> **Pitch → independent review → ranked agenda → editorial decision → history.**

It organizes discussion; it never makes decisions. The ranked list is a conversation
starter, editors always retain discretion, and every decision is recorded with its
context (scores, comments, rationale) so the newsroom accumulates institutional memory.

Explicitly out of scope: story production tracking after assignment, calendars/deadlines,
notifications, drafts, generic project management. The pipeline ends the moment a pitch
is assigned or archived.

---

## 2. Core workflow

### 2.1 The two entities that matter

The design rests on one deliberate modeling decision: **pitches and meetings are
separate, and a meeting never owns a pitch.**

- A **pitch** is a long-lived idea with a tiny status machine:

  ```
  open ──────────► assigned        (terminal: someone is reporting it)
    │  ▲
    ▼  │
  archived                         (parked: reversible, kept forever)
  ```

  That is the entire pitch lifecycle. `open` means "in the backlog, available for any
  future meeting." There is no `in_review` status on the pitch itself — being on this
  week's agenda is a fact about the _meeting_, not about the pitch.

- A **meeting** is one weekly planning session. An editor selects a slate of open
  pitches for it, reviewers score that slate independently, and the meeting records a
  decision for each slate item. The meeting has its own small lifecycle:

  ```
  open ──► agenda ──► concluded
  ```

  - `open` — the slate is being built and reviewers are scoring. Each reviewer sees
    only their **own** scores (enforced by RLS, not UI — see §7).
  - `agenda` — scoring is closed. Scores unlock for everyone, and the ranked agenda
    is generated. This is the state the meeting is run in.
  - `concluded` — every slate item has a decision. Any item without an explicit
    decision when the editor concludes is recorded as **deferred**, and the pitch
    simply stays `open` in the backlog.

The join between them (`ep_meeting_pitches`) is where review history and decisions
live. A pitch that gets deferred three times has three join rows — with three sets of
scores, comments, and outcomes — and is still just one `open` pitch. This directly
delivers "stories move through statuses while preserving a history of when they were
reviewed," which was the brief's stated intuition.

**Why a meeting entity at all, when the brief was skeptical of "planning cycles"?**
Three requirements can't be met without one:

1. _Independent review_ needs a defined window in which scores are hidden and after
   which they're revealed. That window is a meeting state.
2. _"Reviewed in week X, deferred; reviewed again in week Y, assigned"_ needs each
   review round to be a distinct historical record. That record is the join row.
3. _The agenda_ is inherently per-meeting: the same pitch can rank #2 one week and
   #6 a month later as the slate around it changes.

The brief's instinct was right about what to avoid, though: the meeting here is a
lightweight session record, not a container. It doesn't own pitches, has no capacity,
no sprint semantics, and nothing "carries over" — unselected pitches were never in it.

### 2.2 Roles

`tool_access.tool_role` (free text interpreted by this tool, per portal convention)
takes three canonical values, each a superset of the previous:

| Role          | Can do                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| `contributor` | Submit pitches; view the backlog, agendas, and decision history                          |
| `reviewer`    | …plus score slates and write review comments                                             |
| `editor`      | …plus create/run meetings, build slates, record decisions, configure the form and rubric |

The brief said "administrators" configure the form and rubric; this design assigns that
to the tool's `editor` role instead (platform administrators who need it can grant
themselves the role through the existing admin screens). Rubric and form design are
_editorial_ decisions and belong to newsroom leadership, not to whoever operates the
portal — and it keeps the portal's promise that tool roles are the tool's own business.

### 2.3 Keeping the backlog manageable

The brief's one hard constraint: no unmanageable pile of hundreds of stale pitches.
Mechanisms, all cheap:

- **Deferral count and last-reviewed date** are first-class, visible columns in the
  backlog (both derivable from join rows — nothing extra to maintain).
- The backlog defaults to sorting **newest first** but has a one-click **"Stale"
  filter**: open pitches not reviewed in 90+ days or deferred 3+ times.
- **Bulk archive** from the stale view, with an optional reason. Archiving is
  reversible (status back to `open`) and archived pitches remain searchable — nothing
  is ever deleted, matching the portal-wide "history is preserved" principle.
- When building a slate, editors see deferral counts inline, which creates a natural
  "fish or cut bait" moment every week — the third deferral is when you archive.

Deliberately _not_ included: auto-archival. A cron that silently buries ideas
contradicts "institutional memory," and at newsroom scale (a few pitches a week) the
manual sweep is a two-minute task made easy by the stale filter.

---

## 3. Data model

All tables live in the `public` schema with an `ep_` prefix (see §6 for the tradeoff
vs. a separate Postgres schema). All are RLS-enabled in the same migration. FKs to
`profiles` follow the portal pattern: `on delete set null` for attribution columns,
never cascade-deleting history.

```
ep_form_fields          the configurable submission form (one row per field)
ep_criteria             the configurable rubric (one row per criterion)
ep_settings             singleton: scoring scale (and future tool-wide settings)

ep_pitches              one row per story idea
ep_pitch_values         one row per (pitch, form field) answer
ep_meetings             one row per weekly planning session
ep_meeting_pitches      slate membership + the decision record   ← the pivot
ep_reviews              one row per (reviewer, slate item): comment + submitted_at
ep_review_scores        one row per (review, criterion): score + weight snapshot
```

### 3.1 Configuration tables

```sql
create table ep_form_fields (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- stable slug, e.g. 'summary'
  label       text not null,
  help_text   text,
  field_type  text not null check (field_type in
                ('short_text', 'long_text', 'select', 'multi_select', 'date', 'url')),
  options     jsonb,                         -- ["News","Feature",…] for selects, else null
  required    boolean not null default false,
  active      boolean not null default true, -- deactivated, never deleted
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table ep_criteria (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text not null,                 -- what this criterion measures
  guidance    text,                          -- shown to reviewers while scoring
  weight      numeric(4,2) not null default 1.0 check (weight > 0),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table ep_settings (                   -- singleton row, id always true
  id          boolean primary key default true check (id),
  scale_min   integer not null default 1,
  scale_max   integer not null default 5,
  updated_at  timestamptz not null default now()
);
```

One scoring scale for the whole rubric (not per-criterion): it keeps weighted averages
directly comparable across criteria without normalization, and it matches how rubrics
are actually discussed ("score everything 1–5"). Scale changes only affect future
meetings — past scores carry their scale with them via the snapshot (§4.2).

### 3.2 Pitches

```sql
create table ep_pitches (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,              -- the ONE hard-coded field (see §4.1)
  status         text not null default 'open'
                   check (status in ('open', 'assigned', 'archived')),
  submitted_by   uuid references profiles (id) on delete set null,
  assigned_to    uuid references profiles (id) on delete set null,  -- convenience copy
  archived_reason text,
  archived_by    uuid references profiles (id) on delete set null,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table ep_pitch_values (
  pitch_id   uuid not null references ep_pitches (id) on delete cascade,
  field_id   uuid not null references ep_form_fields (id),
  value      jsonb not null,                 -- string | string[] | date-string
  primary key (pitch_id, field_id)
);
```

`assigned_to` on the pitch is a denormalized convenience copy of the deciding meeting
row (the authoritative record), so the backlog and analytics never need a join to
answer "who has this."

### 3.3 Meetings, slates, decisions

```sql
create table ep_meetings (
  id            uuid primary key default gen_random_uuid(),
  meeting_date  date not null,
  status        text not null default 'open'
                  check (status in ('open', 'agenda', 'concluded')),
  notes         text,                        -- free-form meeting notes
  created_by    uuid references profiles (id) on delete set null,
  agenda_at     timestamptz,                 -- when scoring closed
  concluded_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table ep_meeting_pitches (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references ep_meetings (id) on delete cascade,
  pitch_id      uuid not null references ep_pitches (id) on delete cascade,
  added_by      uuid references profiles (id) on delete set null,
  -- decision record, null until decided:
  outcome       text check (outcome in ('assigned', 'deferred', 'archived')),
  assigned_to   uuid references profiles (id) on delete set null,
  rationale     text,                        -- why, when it's worth recording
  decided_by    uuid references profiles (id) on delete set null,
  decided_at    timestamptz,
  unique (meeting_id, pitch_id)
);
```

Recording an outcome is one server action that (a) writes the decision onto the join
row, (b) transitions the pitch (`assigned` / stays `open` / `archived`), and (c) logs
an audit event. The join row is the permanent answer to "what did we decide and why";
the pitch status is just current state.

### 3.4 Reviews and scores

```sql
create table ep_reviews (
  id                uuid primary key default gen_random_uuid(),
  meeting_pitch_id  uuid not null references ep_meeting_pitches (id) on delete cascade,
  reviewer_id       uuid not null references profiles (id) on delete cascade,
  comment           text,
  submitted_at      timestamptz not null default now(),
  unique (meeting_pitch_id, reviewer_id)
);

create table ep_review_scores (
  review_id        uuid not null references ep_reviews (id) on delete cascade,
  criterion_id     uuid not null references ep_criteria (id),
  score            integer not null,
  weight_snapshot  numeric(4,2) not null,    -- criterion weight at scoring time
  scale_snapshot   integer not null,         -- scale_max at scoring time
  primary key (review_id, criterion_id)
);
```

A review is one reviewer's take on one slate item: per-criterion scores plus one
optional comment, submitted atomically. The unique constraint gives idempotent
resubmission (a reviewer can revise their scores any time while the meeting is `open`).

---

## 4. Configurable forms and rubrics

### 4.1 Recommendation: no form-builder dependency

The brief assumed an open-source form builder would fit here. **I recommend against
adopting one.** Libraries in this space (SurveyJS, Form.io, rjsf) are platforms: they
bring conditional logic, multi-page flows, their own schema formats, their own styling
systems, and tens of thousands of lines of dependency — to a project that deliberately
runs on a small dependency set (CLAUDE.md calls this out explicitly) and needs exactly
this much:

> a flat, ordered list of typed fields, editable by an admin.

That is one database table (`ep_form_fields`), one admin CRUD screen (the portal
already has two screens of exactly this shape — admin/users and admin/tools), and one
~150-line renderer component that switches on `field_type` to emit the right input.
"Reorder" is up/down buttons on `sort_order`, not drag-and-drop. This is a few days of
owned, on-pattern code versus a permanent platform dependency, and it structurally
cannot grow into "a generic form-building application" — the ceiling the brief asked
for is built in, because the schema simply can't express anything fancier.

Six field types cover a pitch form (`short_text`, `long_text`, `select`,
`multi_select`, `date`, `url`). Adding a seventh later is one check-constraint value
and one case in the renderer.

**One field is hard-coded: the title.** Every list, agenda, and audit line needs a
guaranteed human-readable name for a pitch; making it configurable would mean every
screen defensively handling its absence. Everything else — summary, why-now,
sources, format, estimated effort — ships as _seeded default rows_ in
`ep_form_fields`, so day one looks fully formed but every part of it is editable.

### 4.2 Keeping history meaningful when configuration changes

The same lifecycle rule governs both fields and criteria, and it's the load-bearing
idea of the whole configuration design:

> **Configuration rows are deactivated, never deleted — and a change in _meaning_ is
> a new row, not an edit.**

- **Deactivate, don't delete.** An inactive field disappears from the submission form
  but its FK from historical `ep_pitch_values` stays intact, so a 2026 pitch renders
  exactly as submitted in 2029. Same for criteria and old scores.
- **Edits are for typos.** Fixing a label's spelling or clarifying help text is a
  normal update. Turning "Local relevance" into "Digital potential" is not an edit —
  it's deactivate + create, because otherwise old scores would silently change
  meaning. The admin UI states this rule next to the edit form; it is guidance, not
  enforcement (a small trusted newsroom doesn't need a hard gate, and a hard gate
  would make typo fixes infuriating).
- **Scores snapshot their context.** Each score row copies the criterion's `weight`
  and the scale in force at scoring time. A meeting's ranking is therefore _frozen
  arithmetic_ — reweighting the rubric next month cannot rewrite last month's agenda
  order. This is the cheap alternative to full rubric versioning (see §6).
- **Mid-meeting config changes don't tear a slate.** Reviewers score against the
  criteria active at the moment they submit; because every score carries its own
  weight/scale, a slate scored across a config change still aggregates correctly
  per-review.

### 4.3 Aggregation math (pure, tested)

For one review: `weighted = Σ(scoreᵢ × weightᵢ) / Σ(weightᵢ)` using the snapshotted
weights. For one slate item: the mean of its reviews' weighted scores, plus a
**spread** (max − min of reviewers' weighted scores) surfaced on the agenda as a
simple agreement signal — a pitch everyone scored 3 and a pitch scored 1-and-5 have
the same average and very different meetings ahead of them. These are dependency-free
functions in `src/lib/editorial/scoring.ts` with colocated Vitest tests, per the
portal's testing convention.

---

## 5. Weekly planning, end to end

A typical week, and the screens behind it (all under `/editorial`):

1. **All week — pitches accumulate.** Anyone with access submits via the structured
   form (`/editorial/pitches/new`). New pitches land in the backlog as `open`.

2. **Editor creates the meeting and builds the slate** (`/editorial/meetings/new` →
   meeting page in `open` state). The slate builder is the backlog with checkboxes:
   filter, see deferral counts, add pitches. The slate can be adjusted until scoring
   closes.

3. **Reviewers score independently.** Each reviewer opens the meeting and works
   through the slate: per-criterion scores (with the criterion's guidance text
   inline) plus an optional comment per pitch, with a "4 of 9 reviewed" progress
   header. RLS guarantees they cannot read anyone else's review while the meeting is
   `open` — independence is a database property, not a UI courtesy.

4. **Editor closes scoring** (→ `agenda`). One click, one confirm. Scores unlock for
   everyone and the agenda renders: slate ranked by average weighted score, each row
   expandable to per-criterion means, per-reviewer scores, spread, and comments.

5. **The meeting runs off the agenda page.** For each pitch, the editor records the
   decision inline: **Assign** (to a person, optional rationale), **Defer** (stays in
   backlog, rationale optional), or **Archive** (rationale encouraged). The ranking
   organizes the conversation; the decision buttons don't care about rank order —
   discretion is the point.

6. **Editor concludes the meeting.** Anything undecided is auto-recorded as
   `deferred` (with a confirm listing what's about to be deferred). The meeting
   becomes a permanent, read-only record at `/editorial/meetings/[id]`.

There is no "current meeting" singleton — `open` meetings are simply listed first.
In practice there'll be one at a time, but nothing breaks if a special-projects
planning session overlaps the weekly one.

### Wireframes (text)

**Backlog — the tool's home page**

```
Editorial Planning                                        [ + New pitch ]
─────────────────────────────────────────────────────────────────────────
Backlog (14 open)   Meetings   Archive          Filter: [All ▾] [Stale]

TITLE                          SUBMITTED BY   AGE     REVIEWED  DEFERRED
Beach renourishment funding    M. Bell        3d      —         —
Shrimping season outlook       S. Okafor      11d     Jul 15    1×
Bridge toll public comment     D. Ruiz        34d     Jul 1     2×   ⚠
…
```

**Reviewer scoring (meeting `open`)**

```
Meeting · Jul 24, 2026 — Review the slate           Your progress: 4 / 9
─────────────────────────────────────────────────────────────────────────
▸ Beach renourishment funding                                  ✓ scored
▾ Shrimping season outlook
    Summary, sources, format …(pitch details, read-only)…

    News value        ①②③④⑤    "Is this new, consequential, timely?"
    Local relevance   ①②③④⑤    "Does it matter to our listening area?"
    Feasibility       ①②③④⑤    "Can we actually report this well?"
    Comment  [ optional, visible to the room after scoring closes      ]
                                                      [ Save review ]
```

**Agenda (meeting `agenda`) — run the meeting from here**

```
Meeting · Jul 24, 2026 — Agenda            5 reviewers · scoring closed
─────────────────────────────────────────────────────────────────────────
#  SCORE  SPREAD  TITLE                        DECISION
1  4.4    0.6     Beach renourishment funding  [Assign ▾] [Defer] [Archive]
2  4.1    2.1 ⚠   Hurricane season prep        [Assign ▾] [Defer] [Archive]
   ▾ criterion means · per-reviewer scores · 5 comments
3  3.7    0.9     Shrimping season outlook     ✓ Assigned → M. Bell
…
                                              [ Conclude meeting ]
```

---

## 6. Tradeoffs made (and why)

- **A meeting entity vs. pure pitch statuses.** Chose the entity: independent-review
  windows, per-week ranking, and re-review history are all facts about a session, and
  encoding them as pitch statuses would _lose_ history on every transition. Kept it
  minimal (3 states, no capacity, no ownership) to honor the brief's anti-"planning
  cycle" instinct.
- **Snapshot-on-score vs. full rubric versioning.** Chose snapshots (weight + scale
  copied onto each score row). A `rubric_versions` scheme answers questions nobody
  here is asking ("diff rubric v3 against v5") at the cost of real modeling and UI
  complexity. Snapshots make historical aggregates immutable — which is the actual
  requirement — for two columns.
- **Value table (`ep_pitch_values`) vs. a `responses jsonb` blob on the pitch.**
  Chose the table. A blob is marginally simpler to write but makes every future
  analytics question ("how many pitches proposed format = feature in 2026?") a JSON
  path query against untyped data, and orphaned keys accumulate silently. The value
  table keeps FK integrity with field definitions and is exactly the "structure the
  data so the AI/analytics possibility remains open" hedge the brief asked for — at
  the cost of one join.
- **Hand-rolled schema-driven form vs. open-source form builder.** Chose hand-rolled
  (§4.1): the need is one flat field list; a form platform is a large permanent
  dependency whose main features would all be unused, in a repo whose stated policy
  is a minimal dependency set.
- **`ep_` prefix in `public` vs. a dedicated Postgres schema.** Chose the prefix.
  A separate schema is architecturally prettier but adds friction end to end with
  Supabase (PostgREST schema exposure config, `.schema()` on every client call,
  multi-schema type generation) for a namespacing benefit the prefix already
  provides. If a later tool proves the need, migrating one tool's tables into a
  schema is mechanical. _(This interprets CLAUDE.md's "its own schema" as "its own
  tables and migrations"; flag if a literal Postgres schema was intended.)_
- **One scoring scale for the whole rubric vs. per-criterion scales.** Chose one:
  per-criterion scales force normalization math into every aggregate and make scores
  harder for humans to compare across criteria. Weights already express "this
  criterion matters more."
- **No pitch drafts, no edit-after-submit while under review.** Pitches are editable
  by their submitter (and editors) while `open` and not on an `open`/`agenda`
  meeting's slate; frozen while under active review so reviewers score the same text.
  A separate draft state adds a status and a filter everywhere for marginal value on
  a form this small.
- **Auto-defer on conclude vs. requiring explicit decisions.** Chose auto-defer with
  a confirm. Meetings end abruptly; blocking conclusion on bookkeeping means stale
  `agenda` meetings, and "we ran out of time" is honestly recorded as a deferral.

## 7. Security model (RLS sketch)

Follows the existing policy patterns in `20260722120001_rls_policies.sql`, with two
new `security definer` helpers mirroring `is_administrator()`:

- `ep_role(uid)` → the user's active `tool_role` for editorial-planning (null if none),
  and `ep_has_access(uid)` as the boolean convenience. Both check `account_status =
'active'` and `revoked_at is null`.

Policy summary:

| Table                                          | select                                                                               | write                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `ep_form_fields`, `ep_criteria`, `ep_settings` | any tool user                                                                        | editors                                                                |
| `ep_pitches`, `ep_pitch_values`                | any tool user                                                                        | insert: any tool user (as self); update: submitter-while-open, editors |
| `ep_meetings`, `ep_meeting_pitches`            | any tool user                                                                        | editors                                                                |
| `ep_reviews`, `ep_review_scores`               | **own rows always; others' only when the meeting status is `agenda` or `concluded`** | reviewer as self, only while meeting is `open`                         |

The bolded rule is the mechanical heart of independent review: hiding colleagues'
scores is a database guarantee, and "scoring closed" flips visibility for everyone at
once. Platform administrators get no blanket read of editorial content — deliberately;
they administer access, not editorial judgment (they can grant themselves a role if
they need in).

Every privileged mutation (config changes, meeting transitions, decisions) is a
server action that starts with the role assertion and ends with `logAuditEvent()`
(actions like `ep.meeting.concluded`, `ep.pitch.assigned`), matching the portal's
existing audit convention.

## 8. Future expansion that costs nothing today

Cheap later _because_ of this structure, and deliberately not built now:

- **Analytics** — every question in the brief is a query over existing rows:
  assignment mix by any select field (`ep_pitch_values` join), repeat-deferral
  ideas (count of `deferred` join rows), reviewer agreement (spread/variance over
  `ep_review_scores`), priorities receiving attention (criterion means over time).
  A read-only `/editorial/insights` page, whenever wanted.
- **Impact tracking** — "what did the story produce" is 2–3 nullable columns (or one
  small table) hung off the `assigned` outcome: aired date, link, impact note.
- **Tags/beats** — already expressible today as a `select`/`multi_select` form field;
  promotion to a first-class taxonomy only if analytics demand it.
- **AI-assisted workflows** — the hedge the brief asked for is satisfied by shape:
  fully relational, typed values keyed to stable field/criterion definitions,
  decisions with rationale text, complete score matrices. Duplicate-pitch detection,
  pattern summaries, or pre-meeting briefs would consume these tables as-is.
- **Notifications** ("scoring closes tomorrow") — a bolt-on that touches no schema.
- **A second configurable-form consumer** (e.g. Audience Listening) — copy the
  pattern, not the tables; per CLAUDE.md, no cross-tool abstraction until a third
  consumer proves the shape.

## 9. Implementation plan

Mapped onto the existing architecture; each step lands independently and keeps
`npm run lint && npm run typecheck && npm test` green. Total shape: one migration,
one lib directory, one route segment.

1. **Migration `ep_schema`** — all nine tables from §3, the two helper functions,
   indexes (`ep_pitches(status)`, `ep_meeting_pitches(pitch_id)`,
   `ep_reviews(meeting_pitch_id)`), and **RLS policies in the same migration** (per
   CLAUDE.md, a table without RLS is a bug). Seed default form fields (summary,
   why-now, sources, format), a starter 4-criterion rubric, and a 1–5 scale — in the
   migration for config defaults, plus sample pitches/meetings in `seed.sql` for
   local dev. Regenerate `database.types.ts`. Normalize the seeded `tool_role`
   values (`Editor` → `editor`, `Contributor` → `contributor`) to the canonical
   lowercase set.
2. **`src/lib/editorial/`** — `access.ts` (`requireEditorialAccess(minRole)` layered
   on `requireActiveProfile()` + `hasToolAccess`, and `assertEditorialRole` for
   actions, following `authz.ts` patterns); pure logic with colocated tests:
   `scoring.ts` (weighted aggregate, ranking, spread), `staleness.ts` (backlog
   filter predicate), `form.ts` (dynamic-field validation against field defs).
3. **Backlog + pitches** — replace the placeholder `(portal)/editorial/page.tsx`
   with the backlog; `pitches/new` (schema-driven form renderer), `pitches/[id]`
   (detail incl. review history), submit/edit/archive server actions.
4. **Meetings** — `meetings/`, `meetings/[id]` rendering by status (slate builder →
   scoring UI → agenda/decisions → concluded record); server actions for
   transitions, reviews, decisions — each asserting role first, auditing after.
5. **Settings** — `settings/form` and `settings/rubric` editor-gated CRUD screens
   modeled on `admin/tools`, with the deactivate-don't-repurpose guidance inline.
6. **Flip the registry** — set the `editorial-planning` tool row to
   `status = 'available'` so `getToolCardState` renders "Open Tool" and the
   placeholder redirect logic retires. Update README/CLAUDE.md scope notes.

Sensible PR boundaries: (1)+(2) as "schema + logic," (3) as "pitches," (4) as
"meetings," (5)+(6) as "settings + launch." No new dependencies at any step.

---

## 10. Strategic/magazine refinement

WUWF's editorial strategy is shifting toward fewer reactive spot-news assignments by
default and more planned, wide-angle, issue-based, explanatory, accountability,
enterprise, and audio-rich journalism organized around defined coverage pillars —
without penalizing genuinely urgent public-service coverage that falls outside a
current pillar. Migration `20260730130000_editorial_strategic_refinement.sql` and the
UI/logic changes described below implement that shift as an extension of the
foundation in §1–§9, not a rebuild. Every existing pitch, review, meeting, and
historical score calculation is preserved: obsolete form fields and rubric criteria
are deactivated (never deleted), and every new column on `ep_reviews`/`ep_review_scores`
is additive.

### 10.1 A fuller, pillar-aware pitch form

The four starter fields (`summary`, `why_now`, `sources`, `format`) are deactivated and
replaced by fifteen seeded fields — ten required, five optional — covering summary,
central question, why now, public stakes, reporting approach, relevant perspectives, a
primary coverage pillar, that pillar's contribution, suggested format, and urgency,
plus optional sources/materials, prior coverage, audio/visual opportunities, support
needs, and a resource estimate. All are ordinary rows in `ep_form_fields`, edited the
same way as before — nothing about the form engine changed.

One retired field's slug (`key`) had to become reusable: `ep_form_fields.key` was
globally unique, which blocked "retire the old `summary` field and seed a fuller one
with the same key." The migration replaces that global unique constraint with a
partial unique index (`unique (key) where active`), so a slug frees up the moment the
row that held it is deactivated — the historical row keeps its key and its FK from old
`ep_pitch_values` rows stays intact; only a second _active_ row with the same key is
blocked. This is a narrow schema fix in service of the existing deactivate-then-recreate
pattern (§4.2), not a new lifecycle rule.

**Coverage pillars are a first-class, admin-configurable entity** — `ep_pillars`
(migration `20260730150000_editorial_pillars_table.sql`), not text embedded in a
select field's options. Each row is a name plus an optional guiding question, with the
same active/sort_order lifecycle as `ep_criteria`/`ep_form_fields`, and its own
Settings → Pillars screen (add, edit, reorder, retire/restore — plus an outright
Delete once a pillar has been retired and confirmed unused; see below). This followed
two rounds of the pillar work: `20260730140000_editorial_sextant_pillars.sql` first
replaced five placeholder pillar names with the newsroom's actual six — adopted
alongside the Sextant podcast framework: Growth and Resilience, Public Health and
Well-Being, Military Affairs, Public Safety and Civil Liberties, Affordability and
Opportunity, and Power and Politics, each with its guiding question — by editing
`primary_pillar`'s `options` array directly; `20260730150000` then promoted pillars out
of that array into their own table so editors could manage them "just as they can the
rubric," instead of only through the generic select-field-options editor.

`primary_pillar`'s selectable options and help text are now derived **live** from
`ep_pillars` at read time (`pillarSelectOptions`/`pillarHelpText`/`withPillarOptions` in
`lib/editorial/form.ts`, merged in by `listPitchFormFields` in `data.ts`) rather than
stored on the field row — the field's own `options`/`help_text` columns are cleared and
unused, so there is exactly one place a pillar's name or guiding question can be edited,
and the pitch form can never show something Settings → Pillars doesn't. The generic
field-settings screens special-case `primary_pillar` to point here instead of exposing
a redundant (and silently ineffective) options editor.

Three fixed status options are still appended to every `primary_pillar` picklist,
hard-coded rather than stored as pillars: `Outside current pillars`, `Emerging issue /
possible future priority`, and `Immediate public need`. These are structural, not
pillar names — a pitch choosing one of them is never treated as pillar-deficient; it is
scored on its own editorial merit via the other rubric criteria (§10.2) and the choice
itself is a signal for future analytics (§10.7).

**Delete vs. retire.** Every other configuration table in this tool only supports
retiring, never deleting, because a criterion or form field is referenced by a foreign
key from historical scores/values — deleting it would orphan them. A pillar name is a
plain string copied into `ep_pitch_values`, not a foreign key, so deleting an *unused*
pillar is safe; `deletePillar` checks for that (any `ep_pitch_values` row equal to the
pillar's name) and refuses with a pointer to retire instead if it finds one. The
settings screen only offers Delete on an already-retired pillar, so removing one is
always a deliberate two-step action.

**The one piece of field interdependency in the form:** `pillar_contribution` is
required only when `primary_pillar`'s value is a real pillar (not one of the three
status options). This is deliberately narrow — a single named exception
(`lib/editorial/form.ts`'s `pillarContributionRequired`), not a general conditional-logic
builder. The pitch form client component (`pitch-form.tsx`) mirrors the same check to
show the requirement live as the writer picks a pillar; the server action is the actual
enforcement.

### 10.2 A granular core rubric

The four starter criteria (`News value`, `Local relevance`, `Feasibility`, `Audience
impact`) are deactivated. In their place, the default **Strategic / Enterprise** rubric
profile (§10.4) seeds ten core criteria whose active weights sum to 100: Public impact
(16), Audience and community relevance (12), Timeliness and strategic moment (8),
Accountability and civic significance (13), Originality and discovery (10), Explanatory
and service value (9), Human and narrative potential (7), Breadth of perspective and
community representation (7), Coverage-pillar contribution (13), and Reporting
opportunity and readiness (5).

These are deliberately not "News value" writ ten different ways. Prominence, conflict,
magnitude, celebrity, and shareability are not independently scored anywhere — they are
evidence a reviewer weighs _within_ Public impact, Timeliness, or Human and narrative
potential, not separate line items that would double-count the same appeal or reward
it directly. Coverage-pillar contribution is a **core** criterion, not a bolt-on, because
the pillars express WUWF's own editorial priorities — advancing them is part of
editorial merit, not a separate consideration.

The tool-wide scale moved from 1–5 to **0–4** (`ep_settings.scale_min`/`scale_max`).
This only affects future scoring: every `ep_review_scores` row snapshots the scale it
was given under, so a 2026-era review still reads back as "scored 1–5" even after the
default moves. Two new criterion-level columns support this and the modifier (§10.3)
without touching that snapshot design:

- `scale_min`/`scale_max` (nullable) — a criterion-specific scale override. Null (the
  common case) means "use the tool-wide scale"; the modifier sets an explicit `0..5`.
- `anchors` (`jsonb`, `{"0": "…", "1": "…", …}`) — a short description shown to
  reviewers at each score point. Every seeded criterion has one for every point on its
  scale, editable the same way name/description/guidance are.

`ep_review_scores` gained `scale_min_snapshot` alongside the existing `scale_snapshot`
(the max), since a review given against a criterion with an overridden scale now needs
its _whole_ scale preserved, not just the ceiling the original single-scale design
assumed. Historical rows backfilled to `1` (the tool's scale-min before this
migration); every new write sets it explicitly.

### 10.3 The institutional-alignment modifier

`ep_criteria.criterion_type` is `'core'` or `'modifier'`. A core criterion feeds the
weighted editorial-merit average exactly as before
(`weightedReviewScore`/`aggregateReviews` in `lib/editorial/scoring.ts`, now filtering on
`criterion_type = 'core'`). A modifier is scored on its own scale, entirely outside that
average — **UWF institutional alignment must never be a low-weight core criterion**,
because that would make it fungible with genuine public-service merit instead of
staying visibly secondary to it.

The seeded modifier, **Institutional public-value alignment**, scores `0` to `+5`:
does the pitch create additional public value through a legitimate connection to UWF's
educational, research, cultural, workforce, or regional-service mission? Its anchors
are explicit that publicity or reputation-management value scores `0`, the same as no
connection at all — the modifier rewards genuine public value that happens to touch
UWF, never favorable coverage of UWF for its own sake. It is optional per reviewer
(§10.4's scoring form gives it an explicit "N/A" option, `required={false}` in
`validateReviewScores`) — a reviewer is never forced to score it when no legitimate
connection exists, and its group average
(`PitchAggregate.modifierAverage`/`modifierReviewerCount`) is computed only over the
reviewers who did.

**The formula** (`computeAdjustedScore` in `lib/editorial/scoring.ts`, tested in
`scoring.test.ts`):

```
adjustedScore = coreAverage + (modifierApplied ? modifierAverage : 0)
modifierApplied = modifierAverage !== null && coreAverage >= modifierMinCoreScore
```

`modifierMinCoreScore` is `ep_settings.modifier_min_core_score`, editor-configurable in
Settings → Rubric (default `2.5` on the 0–4 scale — solidly above the midpoint).
Below that threshold the modifier contributes nothing: **it cannot rescue a pitch that
is editorially weak on its own**, because the addition never happens unless the core
score already cleared the bar. This is deliberately simple and transparent — no
normalization, no reweighting, two numbers added together under one guard condition —
so a newsroom conversation can audit it by eye off the agenda screen. The agenda
(`agenda-section.tsx`) and the pitch detail page's review history both display core
score, modifier, and adjusted score as three distinct numbers, plus reviewer spread on
the core score, exactly as this section's requirements specify; the modifier never
edits `PitchAggregate.average` itself.

Ranking (`rankSlate`) sorts the agenda by **adjusted** score, not core score alone.
That is a deliberate reading of "may modestly increase organizational priority": once a
pitch has cleared the merit bar, a legitimate public-value connection is allowed to
move it up the discussion order — but never past the bar itself, and never for a pitch
that hasn't earned it on independent merit.

### 10.4 Reviewer recommendation and structured concerns

`ep_reviews` gained two columns, both nullable at the database level (so historical
reviews given before they existed stay valid) but required by the `submitReview`
action for new submissions:

- `recommendation` — one of `advance`, `advance_with_revisions`, `hold_for_development`,
  `needs_more_reporting`, `defer`, `decline`, `route_to_immediate_news`
  (`lib/editorial/review.ts`). A structured judgment call, separate from the numeric
  scores — a reviewer can score a pitch respectably and still recommend `hold_for_development`
  because the reporting isn't ready, and the agenda shows both.
- `concern_flags` — zero or more of `focus_scope`, `reporting_path`, `duplication`,
  `resource_conflict`, `viewpoint_breadth`, `framing`, `verification`, `ethics_harm`,
  `editorial_independence`. Lightweight checkboxes next to the free-text comment, not a
  second form to fill out.

Comments stay exactly as lightweight as before — optional, never required per
criterion. What changed is a **prompt**, not a requirement:
`reviewNeedsExplanation` (`lib/editorial/review.ts`, tested in `review.test.ts`) flags a
review as worth a sentence of explanation when the core score is near either extreme,
the recommendation reads sharply against the numeric score (e.g. a low score paired
with `advance`), the modifier is scored near its maximum, or any concern flag is
raised. The scoring UI shows a one-line nudge under the comment box when this fires;
submission is never blocked on it.

### 10.5 Post-selection story planning

`ep_story_plans` (one row per pitch, `unique (pitch_id)`) and
`ep_story_plan_milestones` extend the pipeline exactly one step past assignment,
per this section's brief: **not** a production-tracking suite — no Kanban, no time
tracking, no drafting/publishing workflow, no full calendar. A story plan is created on
demand (never automatically) once a pitch is `assigned`, by the assigned reporter or an
editor, from a "Start story plan" link on the pitch detail page.

Lifecycle: `draft → ready_for_editor → approved`
(`canTransitionStoryPlanStatus` in `lib/editorial/story-plan.ts`, tested). The reporter
can move a plan between `draft` and `ready_for_editor` in either direction; only an
editor can approve it or reopen an approved plan for revision — enforced twice, once in
the RLS update policy (whose `with check` clause never permits a non-editor to write
`status = 'approved'`) and once in the app-level transition check, so the UI's
affordances and the database's actual guarantee agree.

The field set foregrounds **viewpoint diversity** as the brief requires: alongside the
confirmed central question, intended public-service value, working frame/scope,
deliverables, and a reporting/evidence map, the plan has explicit fields for people
directly affected, decision-makers, expert and experiential sources, the main credible
interpretations or competing interests, a **missing-perspective assessment**,
**source-concentration risks**, and **framing risks** — plus opportunity-to-respond
requirements and status (`otr_status`: not applicable / not yet sought / in progress /
declined / obtained), a small `standards_flags` set (ethics/harm, editorial
independence, verification, framing), reporter/editor assignment, a target publication
window, and a small ordered list of editorial milestones. The story-plan screen
(`pitches/[id]/story-plan/`) states directly that breadth of perspective does not mean
equal treatment of unequal evidence or artificial partisan symmetry — the
missing-perspective field asks what's missing and why, not "did both sides get equal
time."

### 10.6 Rubric profiles

`ep_rubric_profiles` (seeded with **Strategic / Enterprise**, the default, and
**Immediate / Emerging News**) is the smallest sound extension for supporting more than
one scoring profile without a rules engine: every `ep_criteria` row belongs to exactly
one profile (`profile_id`, not null), and every `ep_meetings` row picks one profile to
score its slate against (`rubric_profile_id`, editor-selectable at meeting creation,
defaulting to Strategic / Enterprise). `listCriteria({ profileId })` filters by it; the
scoring and agenda screens, and `submitReview`'s validation, only ever see the active
meeting's profile's criteria. Nothing about the aggregation math changed — a profile is
just a tag criteria carry and a meeting picks, using the exact same tables and
`ep_review_scores` snapshot design as before.

Immediate / Emerging News reweights toward urgency and readiness (Urgency and public
safety impact 22, Public impact 15, Accountability and civic significance 12, Reporting
readiness and source access right now 15, Explanatory and service value 10, Audience
and community relevance 10, Breadth of perspective and fairness under deadline 8,
Coverage-pillar contribution or emerging-issue signal 8) and, per this section's
requirement, never gates urgent coverage on pillar fit — its pillar criterion explicitly
credits an emerging-issue signal as an alternative to a defined-pillar connection. It
carries its own copy of the institutional-alignment modifier, since a modifier is
itself profile-scoped like any other criterion.

Profiles are configuration data, editable the same way criteria are (the rubric
settings screen groups criteria by profile and lets an editor assign a new criterion to
either one); there is no profile-management UI beyond that; a third profile would be
one more seeded row plus its criteria, not a schema change.

### 10.7 Portfolio context and future analytics

No analytics dashboard is built in this refinement, but every question this section
asks for is now a query away, because the relational structure already supports it:
pitch/assignment volume by pillar and format (`ep_pitch_values` joined on those fields),
high-value pitches outside current pillars or flagged emerging/immediate (the same
join filtered to the three status options), repeated emerging issues (grouping
`primary_pillar = 'Emerging issue / possible future priority'` pitches over time),
deferrals and declines (`ep_meeting_pitches.outcome` plus `ep_reviews.recommendation`),
reviewer disagreement (`PitchAggregate.spread`, already computed for the agenda),
source/viewpoint planning patterns (`ep_story_plans`' missing-perspective and
source-concentration fields), institutional-modifier use
(`ep_review_scores` rows against a `criterion_type = 'modifier'` criterion, and how
often `modifierApplied` actually fires), and allocation between strategic and immediate
coverage (`ep_meetings.rubric_profile_id` over time). A read-only `/editorial/insights`
page remains future work, whenever wanted.

### 10.8 Configuration ownership, restated

Nothing about who owns these editorial choices changed: the `editor` tool role still
configures fields, criteria, weights, options, active status, rubric profiles, and now
the modifier threshold — all through the same Settings screens, all still governed by
the deactivate-then-recreate rule (§4.2) rather than editing meaning in place. The
rubric settings screen states this inline, alongside a direct reminder that the rubric
is a structured aid to judgment, not an automatic commissioning system, and that
weights express current priorities worth revisiting periodically — not a fixed formula.

# Editorial Planning — Product & Technical Design

Status: **proposed** (design only — no implementation yet, per the portal-foundation
milestone in CLAUDE.md). This document is the design deliverable for the first real
tool in the WUWF Tools Portal; the implementation plan at the end maps it onto the
existing architecture.

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

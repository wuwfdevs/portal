# Log — Product & Engineering Design

Status: **Milestone 1 shipped in full, then redesigned (2026-08-07/08) once
real WUWF clock and operational detail existed to check it against.** First
of the three tools `docs/broadcast-operations-strategy.md` splits the WUWF
Unified Broadcast Rundown and Traffic System spec into, and the one the
strategy doc's build order (§6) puts first, because it owns the operational
spine — Program, Clock, Content item, Rundown, Broadcast event — that
Underwriting & Traffic and FCC Reporting both read from.

Read `docs/broadcast-operations-strategy.md` first — it records why this is
three tools instead of one, and why this tool in particular owns the shared
tables rather than a new foundation layer. Source material throughout is the
`WUWF Unified Broadcast Rundownand Traffic System` spec (§ references below
point there) plus, as of the 2026-08-07/08 redesign, WUWF's actual NPR
network clock diagrams and a real annotated Morning Edition example that
surfaced a modeling mistake milestone 1 shipped with — see §2's "Network
clock vs. local opportunity" below for the correction.

---

## 1. The problem we're solving

WUWF's daily broadcast planning is split across tools that don't talk to
each other: RadioTraffic's log, the NPR Rundowns App, a weather source
checked separately, and whatever a host has printed or scribbled for local
content. None of them know about the others' timing. A host building a
local break has to hold the network clock, the underwriting obligations, and
the available local content in their head simultaneously, live, on air.

Log is the answer to four questions the source document poses (Executive
summary): **What must air? What can air? What did the host choose? What
actually aired?** Those are four different moments — the clock's structural
requirement, the content library's eligible material, the host's assembled
plan, and the as-aired record — and Log is the one place all four live
together, in that order, for every program.

It is not a general newsroom CMS and not a scheduling algorithm that removes
the host from the loop. §1.2's "human control during live radio" is load-
bearing: Log calculates, warns, and surfaces options; a host decides.

---

## 2. Product model

### Network clock vs. local opportunity — the milestone-1 mistake, corrected

Milestone 1 shipped `log_clock_slots.fill_mode` (`required` | `optional` |
`host_fillable`) as a property of the network clock's own structural table.
It looked reasonable against the abstract spec, but checking it against
WUWF's real, annotated Morning Edition clock (the reference case for this
whole correction) exposed why it was wrong: **every slot in every clock
seeded so far was `fill_mode = 'required'`/`assignment_mode = 'automatic'`.
There has never actually been a host-fillable network slot in this data**,
because a WUWF local-substitution opportunity is not a property of one
network segment at all — it's WUWF's own operational decision layered *on
top of* an accurate network clock, and it routinely spans several network
segments. Morning Edition's real ~29:30–34:00 local-story window, for
example, covers the tail of a cross-promo, a Music Bed, and both Newscast 3
and Newscast 4 — four distinct network slots, one WUWF opportunity. There
was no way to express that as a fill_mode on a single slot; the model was
conflating "what the network publishes" with "where WUWF may substitute
local material," and a floating opportunity spanning several slots proved
those are genuinely different objects, not two names for the same one.

The fix: `log_clock_slots` describes only what NPR/the network actually
publishes (offset, duration, label, and — for a genuinely floating network
element — a timing window), same as before this redesign but stripped of
every fillability column. `log_local_opportunities` is new: WUWF's own
overlay, versioned against a `log_clock_versions` row (so it stays
meaningful against the exact offsets it was authored for) but **editable in
place**, unlike the network clock's own insert-only immutability — this is
WUWF policy, not NPR's structure, and a producer revising which windows are
local avails shouldn't rewrite history the way editing the network clock
itself would.

`requirement` (`optional` | `required`) is the field milestone 1's
`fill_mode` conflated three different things into, split apart: **optional**
means a genuine avail WUWF may or may not use — an unfilled optional
opportunity is a normal, resolved state ("carrying network"), never flagged.
**required** means a genuine local obligation (a legal ID, a station
announcement) — an unfilled required opportunity is unresolved and must be
flagged. See §5 (Morning Edition's five seeded opportunities) and §6
(`log_rundown_breaks`) for how this plays out downstream.

### Program
A recurring or special broadcast program (§3, §4.1) — *Morning Edition*,
*Ranger Rick's Radio Hour*, a pledge-drive special. Identifies scheduled air
periods; doesn't itself carry timing structure.

### Clock template / Clock version
A **clock template** is the named, editable clock staff maintain — "Weekday
Morning Drive," "Weekend Classical." A **clock version** is an immutable,
dated snapshot of that template's slots. This split exists for the same
reason Audience Listening's answers snapshot their question rather than
referencing a live `al_questions` row: a completed rundown must forever
point at the exact clock that generated it (§4.3), and a template that keeps
changing underneath it would silently rewrite history. Editing a template
creates a new version; old rundowns keep referencing the old one.

### Clock slot
A position within a clock version describing **only the network's own
structure** (post-redesign): start offset, duration, label, and — for a
genuinely floating network element (Hidden Brain's own described break) — a
timing window. No fillability of any kind lives here anymore; see above.

### Local opportunity
WUWF's own local-substitution overlay on a clock version (new in this
redesign): start offset (or, for a floating window, an earliest/latest
range), duration, a `requirement` of `optional` or `required`, the content
types permitted to occupy it, and whether more than one item may occupy it
at once. Independently editable in place — deactivated, not deleted, when
retired — because it's WUWF's own policy decision about an accurate network
clock, not a fact about the network clock itself.

### Content item / Content component
A **content item** is reusable or one-time material (§7): news, a station
promo, a membership message, a university announcement, a PSA, legal ID, an
interview or feature, or a host-created one-off. A **content component** is
a timed part of it — live intro, recorded audio, live outro, optional tag
(§7.3). Total occupied time is always the sum of required components; a
30-second promo with a required 8-second outro is a 38-second commitment,
never displayed as 30.

Recorded material (`component_type = recorded_audio`) carries an optional
`dad_cart_number` — a plain text reference to the item's identifier in
ENCO/DAD, WUWF's actual playback/automation system of record. See §6's "DAD
is the system of record, not the portal" below for why this replaced a
Supabase-hosted audio upload.

Underwriting credits are a real content kind as of this redesign
(`item_kind = 'underwriting_credit'` on a rundown item, never a
`log_content_items` row) — see §6's "The Underwriting boundary is now real"
below. Milestone 1 shipped this as a manual stopgap `content_type`; that
stopgap is gone.

### NPR program episode
NPR identifies a network program as a **collection** in its Content
Distribution Service (CDS), and a particular broadcast's rundown as a dated
**program-episode** document within that collection, containing an ordered
sequence of story/content items (§5) — a mapped local program's cached copy
of that dated episode, never edited locally, always labeled with when it was
last successfully retrieved. Date is part of the episode's identity: "the
Morning Edition episode for August 7" and "for August 8" are different
documents, not one row that gets overwritten. Not every program has a CDS
mapping — local and unmapped network programs simply have none. NPR remains
subordinate/contextual throughout this redesign, exactly as milestone 1
built it: editorial metadata a host reads, never on-air copy Log assumes NPR
supplies (see §3D).

### Weather reading
One current live-read, not one row per slot (§8) — every weather slot in
every rundown references today's current version by default. A host may
still set a **per-airing override** for one specific slot's wording without
mutating that shared master reading — see the per-airing override entry
below.

### Rundown / Rundown break / Rundown item
A **rundown** is the generated, editable plan for one program's air period
or host shift, tiling `log_local_opportunities` hourly across the shift the
same way milestone 1 tiled clock slots. A **rundown break** is one
occurrence of a local opportunity within that rundown — a container zero or
more **rundown items** may occupy. This is the direct structural consequence
of the network-clock/local-opportunity split above: milestone 1's
`log_rundown_items` held exactly one row per fillable slot; post-redesign, a
break can hold nothing (a normal, resolved state for an optional break), one
item, or several (when `allow_multiple` is true — e.g. an underwriting
credit plus a legal ID inside one longer window).

### Per-airing override
A rundown item may override a master content item's script, total duration,
live-intro/live-outro/tag seconds, or add operator notes, **for this one
airing only** — new in this redesign, and the mechanism behind "the same
promo airs slightly differently at 6am versus 8am without a second copy of
the promo existing." Nothing about an override ever writes back to
`log_content_items`/`log_content_components`; a null override column means
"inherit from the master," and `planned_duration_seconds` is always the
computed effective total for this specific airing (master or overridden —
see `lib/log/content-library.ts`'s `computeEffectiveDurationSeconds`). The
same mechanism covers weather: a `weather`-kind item has no content
reference at all, and its effective text is the current
`log_weather_reading` unless this one airing's `override_script` is set.

### Broadcast event
The planned-versus-actual record of one rundown item's airing (§15). This is
the critical distinction the source document names explicitly: **a content
item is not the same as an airing.** One story can have many broadcast
events across many air dates, each independently outcome-tracked.

---

## 3. Primary user workflows

### A. Defining a clock (producer)
A producer builds or edits a clock template's slots — offsets, durations,
labels, and (for a genuinely floating network element) a timing window.
Saving creates a new clock version; the template itself has no "current
slots" a rundown can silently drift onto. Separately, and editable in place
rather than versioned, a producer maintains that version's local
opportunities — see §2's "Network clock vs. local opportunity." The clock
template detail screen (`/log/clocks/[id]`) renders both: a network
structure table, a local-opportunity table, and — materially larger than
before this redesign, since it now has to legibly show two concentric rings
instead of one — the circular clock-face diagram, network slots on an inner
ring and local opportunities on an outer one (`lib/log/clock-face.ts`,
`components/log/clock-face.tsx`).

### B. Scheduling programs (producer)
Maintains the recurring weekly grid, associates each program with a clock
template, and layers in date-bounded substitutions, holidays, and temporary
pledge-drive/breaking-coverage exceptions (§4.1, §4.3).

### C. Managing the content library (newsroom, promotions, any member)
Newsroom staff create news items with scripts, summaries, expected
durations, geography and subject tags, and eligible newscasts (§9).
Promotions staff create promos and institutional announcements with
campaign dates, eligible programs/slots, priority, and required/optional
tags (§10). Both browse, search, and retire their own stale content;
neither needs a producer role to do it — content authorship is open to any
tool member. Recorded items carry a `dad_cart_number` rather than an
uploaded audio file — see §6.

### D. Reading NPR and weather in context
The current NPR program-episode's ordered story items render inline in
chronological position within the rundown (§5.2) — not a separate tab. NPR
supplies editorial metadata (title, teaser/description) for a host to read
and understand what's coming, not polished on-air copy; a host composes
their own forward promotion from that metadata if they want one — that copy
is local/derived content, never something NPR is assumed to supply. Same for
the current weather live-read (§8.3): a host reads it from any weather slot,
sees when it was last updated, can refresh manually, and can set a temporary
per-airing override for the current slot without overwriting the master
copy every other slot references.

### E–H. Building, running, and submitting a rundown — one screen (host, or a producer preparing ahead)
Workflows E ("building the daily rundown"), F ("running the console live"),
G (mid-broadcast actions), and H (submitting) all happen on **one screen**,
`/log/rundowns/[id]` — not four workflows split across two routes. This is
itself a correction: the original build (both milestone 1 and the first
pass of this redesign) split a **builder** (pre-air planning, full editing,
time-independent) from a separate **console** (`/console`, a narrowed
current/next live view with only aired/missed/move). Real usage showed that
split was wrong on two counts, both found from direct reports against the
deployed app, not from re-reading the spec: a host routinely decides what
fills an open avail *while on air*, not only ahead of time, so the console
needed the builder's fill controls anyway — and once it had them, keeping a
second, narrower route around stopped making sense. A solo host running the
board wants the **same vertical, chronological list of break cards** at
every point in the process, not a wide-view screen for prepping and a
narrow one for executing. See §6's "One screen, not two" for the mechanism;
CLAUDE.md's "Log: builder and console merged into one screen" note has the
full account of both corrections in order.

**Always visible, regardless of whether the broadcast has started:** every
break in chronological order — scheduled time, label, requirement badge,
network-rejoin time, available duration, its items with per-item override
controls, and quick-add controls at the bottom of any break with room. An
optional break with nothing in it reads as "carrying network," not an error
state. Every action recalculates timing immediately (§11.3, §12).

**Filling a break is one workflow, not three, and weather is not a special
case.** A single "Add…" picker lists every eligible content-library item
*and* "Today's weather" together — weather is picked exactly the way any
other content is, not through a separate button living apart from the rest.
The underlying write still branches (weather has no library row behind it —
its effective text always comes from the current `log_weather_reading`
unless overridden for this one airing), but that's an implementation detail
the host never sees; from the host's side, filling an open break is always
the same interaction. A one-off live read stays a separate control since it
takes free-text input rather than a pick from a list — that's a genuinely
different kind of interaction, not an arbitrary inconsistency.

**Once the broadcast is under way** (`status = in_progress`, started with a
"Start broadcast" button), the same list gains: a live timing badge (on time
/ running long / running short / at risk of missing a required item / at
risk of missing rejoin, §12.4, computed continuously, not on request); the
break currently airing highlighted and anchored ("Jump to now"), its items
shown at adjustable large text size for readability (§13); and, on every
*unconfirmed* item in *any* break — not only the current one, since the
whole show is visible at once — the three mid-broadcast actions: **aired**,
**moved** to another valid break, or **missed** with a brief reason (§14.3).
Every deviation is retained, never silently dropped from the record (§1.2's
"planned is not aired"). **Underwriting-credit items render their actual
script inline** — a correction from milestone 1's placeholder, which told
the host to "go to Underwriting & Traffic" to read a credit; see §6's "The
Underwriting boundary is now real." A sidebar carries network-rejoin time,
current weather, NPR context, and a wrap-up panel (unresolved-item count,
submit).

At the end of a shift, the host reviews that wrap-up panel — an empty
*required* break, or a filled item with no recorded outcome — and submits.
That freezes a reference version of the rundown while still allowing
documented management corrections afterward (§15.3) — submission is a
checkpoint, not a lock that erases the ability to fix a mistake, and every
control above keeps working after submission for exactly that reason.

---

## 4. Screens

```
/log                              Today's programs and their rundown status
/log/clocks                       Clock template list (producer)
/log/clocks/[id]                  Clock editor — network structure + local opportunities, diagram (producer)
/log/programs                     Program schedule (producer)
/log/library                      Content library: browse/search/filter by type
/log/library/[id]                 Content item detail — components, DAD cart refs, air history
/log/library/new                  Create a content item
/log/weather                      Current weather live-read, manual refresh
/log/npr                          Program+date NPR episode lookup, manual refresh
/log/rundowns/[id]                The rundown — build it, run it live, submit it (§3E-H). One screen.
```

**`/log`** — today's schedule, one row per program with its rundown's
status (not generated / generated / in progress / submitted) and a quick
link into its rundown.

**`/log/clocks/[id]`** — the network structure and the local-opportunity
overlay as two separate tables, plus the enlarged dual-ring diagram, so a
producer can see at a glance which windows are WUWF's own call versus what
the network dictates.

**`/log/rundowns/[id]`** — the vertical, chronological break-card list
described in §3E-H: always available for planning, gains a live timing
badge, adjustable-size copy for whatever's currently airing, and the three
mid-broadcast actions once the broadcast starts. There is no separate
console route — that split was tried and corrected; see §6's "One screen,
not two."

---

## 5. Data model

Fourteen tables (the NPR cache split into two — see `log_npr_episodes`/
`log_npr_episode_items`), prefixed `log_` per CLAUDE.md's directory
conventions. This section reflects the post-redesign shape
(`20260808120000_log_local_opportunities.sql`,
`20260808130000_log_rundown_breaks.sql`,
`20260808140000_log_content_dad_and_media_removal.sql`).

### `log_programs`
`id`, `name`, `description`, `kind` (`recurring` | `special`),
`npr_collection_id` (nullable `int` — this program's NPR CDS collection id,
e.g. Morning Edition = 3; null for local programs and any network program
without a known mapping, never guessed), `created_at`, `created_by`.

### `log_clock_templates`
`id`, `name`, `description`, `created_at`, `created_by`, `updated_at`.

### `log_clock_versions`
`id`, `clock_template_id`, `variant` (`weekday` | `weekend` |
`program_specific` | `holiday` | `special_event`), `effective_from`,
`effective_to` (nullable), `created_at`, `created_by`. Immutable — no update
path on this table from the application; a correction is a new version.

### `log_clock_slots`
`id`, `clock_version_id`, `position`, `start_offset_seconds` (nullable —
some slots float), `duration_seconds`, `timing_mode` (`fixed` | `float`),
`earliest_start_offset_seconds`/`latest_start_offset_seconds` (nullable,
for `timing_mode = float`), `label`. Describes **only** the network's
published structure post-redesign — every fillability column milestone 1
had here (`fill_mode`, `assignment_mode`, `permitted_content_types`,
`replaceable`, `shortenable`, `allow_empty`, `allow_multiple`,
`lock_on_air`) was dropped; see §2. Insert-only from the application, same
as `log_clock_versions`.

### `log_local_opportunities` (new)
`id`, `clock_version_id`, `position`, `label`, `requirement`
(`optional` | `required`), `timing_mode` (`fixed` | `float`),
`start_offset_seconds`, `duration_seconds`,
`earliest_start_offset_seconds`/`latest_start_offset_seconds` (nullable, for
`timing_mode = float`), `permitted_content_types` (`text[]`),
`allow_multiple` bool, `notes`, `active` bool (deactivate, don't delete),
`created_at`, `created_by`, `updated_at`. WUWF's own overlay — see §2.
Update-able in place, unlike the network clock tables, since this is station
policy rather than immutable network structure.

**Morning Edition seed** (`20260808210000_log_morning_edition_opportunities.sql`)
— the reference case this whole correction is built against, five rows
against Morning Edition's clock version:

1. Optional short cover over the post-newscast Music Bed at 6:00 (90s) —
   legal ID / PSA / promo / membership message / underwriting credit /
   weather eligible. (`weather` was added by a follow-up correction,
   `20260808230000_log_morning_edition_weather.sql`, after a user report
   that "Add today's weather" never appeared anywhere — the original seed
   omitted it from every opportunity's permitted types.)
2. Optional short cover over the Segment A Music Bed at 19:00 (90s) — same
   eligible types.
3. Optional local story window at ~29:30–34:00 (270s) — spans the tail of a
   cross-promo, a Music Bed, and both Newscast 3 and Newscast 4;
   `allow_multiple = false` since this window is sized for one longer piece.
4. Optional local story window at ~49:35–51:30 (115s) — lands almost exactly
   on the Music Bed at :49:34–:51:29, WUWF's second common story-
   substitution point.
5. **Required** local ID/announcement window at 42:30 (90s) — the one
   opportunity in this seed whose unfilled state is genuinely unresolved,
   exercising `requirement = required` end to end.

Only Morning Edition is seeded — inventing opportunities for the other
twelve network clocks without real operational confirmation from WUWF would
be exactly the "manufacture local slots" mistake this redesign exists to
fix. A producer adds them for any other clock from `/log/clocks/[id]` once
WUWF confirms where they actually are.

**NPR broadcast-rights context, checked against the model (2026-08-11).**
WUWF's own NPR program terms for *Morning Edition*, *All Things Considered*,
and *Weekend Edition* (the three clocks currently seeded), plus NPR's
General Terms and Conditions for Use of NPR Member Benefits, were checked
against this design — they confirm it rather than change it. NPR's terms
grant WUWF a *right* to cover certain elements (billboards, newscast/
headlines, returns, promos, **music beds**, and individual Stories within
permitted segments); which of those rights WUWF actually exercises as a
`log_local_opportunities` row is WUWF's own operational decision, exactly
the "WUWF's own overlay" framing above. Confirmed: **a Music Bed slot is
always within WUWF's rights to mark as a local opportunity, on every
program checked so far** — no exception process, no rep conversation
required, unlike some newscasts (below). Morning Edition's own seeded
opportunities #1 and #2 above already anchor to Music Bed slots for exactly
this reason, and that pattern generalizes to future clocks' Music Bed slots
too.

Two things these terms name that the schema doesn't model, left to a
producer's own judgment for now rather than built speculatively (same
"human control during live radio" principle, §1.2 — no concrete need has
surfaced yet):

- **Newscast coverage is tiered, not flat eligible/ineligible.** Only
  specific numbered newscasts are freely coverable at any time — Newscast 2
  on all three programs, plus Newscast 4 on weekday Morning Edition and
  weekday All Things Considered. Every other newscast requires breaking
  local news, an on-air pledge drive, or "a good faith conversation with
  your Member Partnership Representative" first. `log_local_opportunities`
  has no "conditionally eligible" concept — the app won't warn a producer
  who marks an unauthorized newscast slot eligible either way.
- **A per-hour aggregate local-coverage time cap exists and isn't tracked.**
  Morning Edition: up to 11:53 of 38:00 total segment time per hour. All
  Things Considered (weekday): up to 12:25 of 40:30 per hour (no cap on
  ATC's weekend edition or on Weekend Edition at all). Nothing in
  `computeBreakStatuses` or elsewhere sums locally-covered minutes across a
  rundown's breaks against this ceiling — every opportunity is evaluated
  independently.
- **All Things Considered can generate a one-off cutaway opportunity that
  exists in no clock version.** Per ATC's own program terms: when a piece
  covers both the C and D segments, ATC signals a replacement cutaway
  opportunity — at least 4 minutes, preceded by a music button — via that
  day's program rundown, not via the standing clock. That's a per-episode,
  NPR-rundown-signaled opportunity; `log_local_opportunities` (pinned to a
  specific `log_clock_slots` row, versioned against a clock version) has no
  way to express one that doesn't correspond to any fixed slot. Moot today
  since ATC has no seeded local opportunities at all yet; worth remembering
  once WUWF confirms ATC's real local avails.

### `log_schedule`
`id`, `program_id`, `clock_template_id`, `entry_type` (`recurring` |
`override` | `holiday`), `days_of_week` (`int[]`, for `recurring`),
`start_date`, `end_date` (nullable), `effective_from`, `notes`,
`created_by`.

### `log_content_items`
`id`, `content_type` (`news` | `station_promo` | `program_promo` |
`membership_message` | `university_announcement` | `psa` | `legal_id` |
`interview_feature` | `host_created`), `title`, `script` (nullable),
`dad_cart_number` (nullable text — see §6; replaces the milestone-1
`audio_object_path`), `summary`, `expected_duration_seconds`,
`effective_from`, `effective_to` (nullable), `owner_id`, `approval_status`
(`draft` | `approved` | `retired`), `eligible_program_ids` (`uuid[]`),
`priority`, `frequency_guidance`, `reusable` bool, `geography_tags`
(`text[]`), `subject_tags` (`text[]`), `community_issue_tags` (`text[]` —
free text in this milestone; becomes a real reference once FCC Reporting's
taxonomy exists, see §6), `reporter_or_editor` (nullable, news-specific),
`created_at`, `updated_at`, `created_by`.

### `log_content_components`
`id`, `content_item_id`, `component_type` (`live_intro` | `recorded_audio` |
`live_outro` | `optional_tag`), `sequence`, `duration_seconds`, `required`
bool, `script` (nullable), `dad_cart_number` (nullable — only meaningful for
`component_type = recorded_audio`).

### `log_npr_episodes`
`id`, `program_id`, `show_date`, `npr_collection_id` (`int`), `status`
(`found` | `not_found`), `npr_episode_id` (nullable), `title` (nullable),
`raw` (`jsonb`, nullable), `retrieved_at`. One row per (`program_id`,
`show_date`). Replaced wholesale per program+date on each successful
retrieval, not diffed.

### `log_npr_episode_items`
`id`, `episode_id`, `position`, `npr_item_id`, `title`, `teaser` (nullable),
`raw` (`jsonb`, nullable). Deleted and reinserted with its parent episode
row.

### `log_weather_reading`
`id`, `forecast_area`, `source`, `live_read_text`, `condensed_text`,
`high_temp`, `low_temp`, `conditions_summary`, `precipitation_notes`
(nullable), `hazards` (nullable), `last_updated_at`, `valid_through_at`,
`is_current` bool (exactly one row true at a time; prior rows are revision
history). A per-airing override of this reading for one specific weather
item lives on that `log_rundown_items` row (`override_script`), not here —
see below.

### `log_rundowns`
`id`, `program_id`, `schedule_entry_id` (nullable), `clock_version_id`,
`air_date`, `shift_start_at`, `shift_end_at`, `status` (`draft` |
`generated` | `in_progress` | `submitted`), `generated_at`, `submitted_at`,
`submitted_by`. Unique on `(program_id, air_date)` so "generate" is
idempotent.

### `log_rundown_breaks` (new — replaces the milestone-1 one-row-per-slot shape)
`id`, `rundown_id`, `local_opportunity_id`, `position`, `label`,
`requirement`, `permitted_content_types` (`text[]`), `allow_multiple` bool,
`scheduled_at`, `available_duration_seconds`, `network_rejoin_at`. The last
five columns are **snapshots** of the opportunity at generation time — the
same "answers snapshot their question" precedent Audience Listening uses —
so editing the opportunity later doesn't rewrite an already-generated
rundown's meaning. `network_rejoin_at` is the point by which WUWF must be
back on network content: start + duration for a fixed opportunity, or the
opportunity's latest permitted start + duration for a floating one, computed
once at generation time.

### `log_rundown_items`
`id`, `break_id`, `position`, `item_kind` (`content` | `live_read` |
`weather` | `underwriting_credit` — the last added by Underwriting's own
migration, see §6), `content_item_id` (for `content`), `live_read_title`/
`live_read_script` (for an ad-hoc `live_read` with no library reference),
`underwriting_copy_id` (for `underwriting_credit`, references `uw_copy`),
`override_script`/`override_duration_seconds`/`override_live_intro_seconds`/
`override_live_outro_seconds`/`override_tag_seconds`/`override_notes` (the
per-airing overrides — see §2), `planned_duration_seconds` (the always-
computed effective total for this airing), `placement_status` (`locked` |
`movable` | `replaceable` | `editable`). Exactly one reference set per
`item_kind`, enforced by a check constraint — same discriminated-shape
precedent as `sw_source_excerpts`. A break can hold zero, one, or several of
these rows depending on `allow_multiple`.

### `log_broadcast_events`
`id`, `rundown_item_id`, `outcome` (`scheduled` | `aired_as_scheduled` |
`aired_different_time` | `partially_aired` | `skipped` | `missed` |
`replaced` | `wrong_copy_aired` | `unconfirmed` | `pending_review` |
`makegood_scheduled` | `makegood_aired` | `waived` — the full §15.1
vocabulary), `actual_started_at` (nullable), `actual_duration_seconds`
(nullable), `confirmation_source` (`automation` | `host` |
`exception_report` | `management_correction`), `reason` (nullable —
`network_timing` | `breaking_news` | `segment_overrun` | `technical_problem`
| `host_error` | `unavailable_copy` | `other`), `notes` (nullable),
`recorded_by`, `recorded_at`. Append-only: select+insert only, no update, no
delete. The single source of as-aired truth; Underwriting's exception queue
and FCC Reporting's quarterly aggregation both read it through scoped
additive RLS.

---

## 6. Architecture

### RLS shape: member vs. producer, same pattern as curator/coordinator

Every `log_*` table is staff-only, gated by `private.has_log_access` — a
standard `tool_access` membership predicate, no `security definer` public
surface (Log has no unauthenticated participant the way Audience Listening
or Academic Partnerships do). Within that membership, two roles:

- **Member** — any granted user. Builds and runs rundowns live, manages
  content library items, records mid-broadcast outcomes.
- **Producer** — `tool_access.tool_role = 'producer'`. Additionally edits
  clock templates/versions, local opportunities, and the program schedule.

This is the same shape Roadmap's curator and Academic Partnerships'
coordinator use: a `tool_access` grant is the ticket in, `tool_role` is the
elevation, and the portal itself still doesn't interpret the string —
`private.is_log_producer` is this tool's own predicate.

### DAD is the system of record, not the portal

Inspecting the actual milestone-1 implementation (not just the design doc's
original aspiration) found that `log_content_items.audio_object_path`/
`log_content_components.audio_object_path` were write-only: an upload widget
wrote them, and the only read anywhere in the codebase used the value as a
boolean to toggle upload-hint text — never a signed URL, never an `<audio>`
element, never a preview. WUWF plays recorded material through ENCO/DAD, its
actual broadcast automation system, not through the portal. This redesign
removed the storage bucket and both `audio_object_path` columns, replacing
them with `dad_cart_number` — a plain optional text reference to the item's
identifier in DAD. Script, intro/outro/tag timing, and duration are what Log
actually needs to represent a recorded item; the bytes live in DAD.

### The Underwriting boundary is now real

Milestone 1 deferred this with a manual `content_type = 'underwriting_credit'`
stopgap. This redesign, alongside Underwriting & Traffic's own domain
redesign, builds the real thing: `log_rundown_items.item_kind` includes
`underwriting_credit`, backed by a real `underwriting_copy_id` reference to
Underwriting's own `uw_copy` — added by that tool's migration, per the
`sw_source_excerpts`-style discriminated-reference shape
`docs/broadcast-operations-strategy.md` §2 always intended. Three
security-definer functions on Log's side (all owned and defined by
Underwriting's migration, since the guard logic depends on contract/
schedule-line state that lives in that tool's schema) are the only path
that ever creates, clears, or lists eligible slots for one of these items:
`log_place_underwriting_credit()`, `log_clear_underwriting_credit()`,
`log_list_placeable_rundown_breaks()`. A plain RLS policy naming
underwriting members would let them write any `log_rundown_items` row, not
just an eligible underwriting-credit one; the guard lives in the function
body instead.

The host-facing gap milestone 1 explicitly left open — "the console tells
the host to go to Underwriting & Traffic to read a credit's script" — is
closed: a narrow additive `select` policy on `uw_copy`
(`uw_copy_select_for_log`), scoped to exactly the copy rows already
referenced from a `log_rundown_items` row the caller can see, lets the
console render an underwriting credit's actual script inline. Underwriting
remains the source of truth for that row; this is a read, never a write.

Underwriting-credit items are also excluded from the ordinary item-delete
policy (`log_rundown_items_delete` — `item_kind <> 'underwriting_credit'`):
one is only ever removed through `log_clear_underwriting_credit()`, so that
function can mark the corresponding placement superseded atomically instead
of leaving Underwriting's own placement history pointing at a deleted row.

### Deferred: the FCC Reporting boundary

`log_content_items.community_issue_tags` is `text[]` in this milestone, not
a reference to a taxonomy table, because `fcc_community_issues` doesn't
exist yet. FCC Reporting's own migration is where a real controlled
vocabulary and a proper reference — or a mapping step for whatever free text
accumulated before then — gets built.

### No job queue: NPR and weather refresh lazily, not on a schedule

This repository still has no job queue. NPR (§5) and weather (§8) both want
to look continuously current, but neither gets a cron job:

- **Weather** refreshes on a stale-check at read time: opening a rundown or
  the console checks `log_weather_reading.last_updated_at` against a
  threshold and triggers a refetch server-side if stale, plus a manual
  "Refresh" button.
- **NPR** works the same way, scoped to one program's episode for one show
  date: the console polls its own server (short client-side interval,
  matching Remote Interview's waiting-room poll pattern), and each poll both
  returns the cached episode for that program+date and triggers a background
  refetch if it's older than a threshold. A program with no CDS mapping, or
  a deployment with no CDS token configured, never attempts a fetch at all —
  those are distinct, clearly reported states, not failures.

Both paths keep the last successful version on a fetch failure and mark it
stale rather than blocking or clearing the display — "a temporary API or
network failure must not make the current rundown unreadable."

### Timing is a pure, tested module — not stored state

Fit calculations (remaining time in a break, overage/underrun, time to
network rejoin, the effect of adding/removing/moving an item) are never
persisted as a computed column. They're derived in `lib/log/timing.ts`
(`computeBreakFit`, `computeBreakStatus`, `computeRundownSummary`) from
`log_rundown_items` + `log_rundown_breaks` + wall-clock time, the same way
`lib/remote-interview/call-status.ts` derives participant status from events
rather than storing it — pure functions, no Supabase import, colocated
tests, safe to recompute on every render. `lib/log/console-timing.ts`
(`computeLiveTimingState`, module name kept from when it had a dedicated
route — see below) is the live-timing counterpart, operating on
`ConsoleBreakLike` rather than a single item.

### One screen, not two

`/log/rundowns/[id]` used to be two routes: a builder (pre-air planning,
full editing, time-independent) and `/console` (a narrowed current/next
live view with only aired/missed/move). Both corrections below were found
from direct usability reports against the deployed app, in the same
session, each building on the one before it:

1. The console shipped read-only against the plan at first — aired,
   missed, move, nothing else — on the assumption that "building" is
   builder work and "executing" is console work. That's wrong for how this
   actually happens at a small station: a host is routinely deciding what
   fills an open avail *while on air*. Fixed by sharing the builder's fill
   actions with the console instead of duplicating them.
2. Once the console could fill breaks, keeping a second, narrower route
   around stopped making sense — the thing that made a live view *live*
   was never "less content, more buttons," it was the timing badge and the
   mid-broadcast actions, and those can layer onto the same always-visible
   break list the builder already had. A host running the board wants full
   context and control at every point, not a wide view for prepping and a
   narrow one for executing.

The merge itself: `computeLiveTimingState`/`currentBreak` are computed
whenever `rundown.status` is `in_progress` or `submitted` (the `live`
flag in `src/app/(portal)/log/rundowns/[id]/page.tsx`); when not live, none
of the live-only data (broadcast events, weather, NPR) is even fetched. The
break currently airing gets a visual highlight and an anchor
(`#current-break`, with a "Jump to now" link) and its items render through
`CopyDisplay` (adjustable text size) instead of the plain compact card every
other break uses. Mid-broadcast actions (aired/missed/move) appear on any
unconfirmed item in *any* break once live, not only the current one — the
whole show is visible at once, so a host can act on something from three
breaks back exactly as easily as on what's airing right now, which a
narrowed current/next view could never offer. A sidebar carries
network-rejoin time, weather, NPR, and the wrap-up/submit panel; before the
broadcast starts, that same panel shows a "Start broadcast" button instead
of the submit form. `broadcast-actions.ts` (renamed from
`console-actions.ts` in the same pass, along with `startConsole` →
`startBroadcast`) still holds the three mid-broadcast actions and submit —
their own logic didn't change, only which page renders their controls.

**Weather is filled through the same picker as any other content, not a
separate button** — the other half of the same "one workflow, not several"
correction. `WEATHER_ITEM_SENTINEL` (`lib/log/content-library.ts`) is a
plain string value the "Add…" select's weather option carries;
`fillRundownItem` branches on it before falling through to the ordinary
`buildRundownItem` capability path for a real content item. The underlying
write still differs — weather has no `log_content_items` row, only today's
current `log_weather_reading` — but that split lives entirely inside one
action, invisible to the host, who just picks "Today's weather" out of the
same list as everything else. `buildRundownItem` itself stays scoped to
real library content (its own MCP-facing contract says "use
`log.content.search` first to find an eligible item's id," which never
applies to weather), so the branch sits in the thin Server Action layer
rather than widening that capability's schema.

### Host live-view resilience — flagged, not built, in this pass

§22 of the source spec requires the current rundown to survive a temporary
connectivity loss without becoming unreadable, and requires unsent host
actions to be preserved and synchronized when connectivity returns. **This
was not implemented in the 2026-08-07/08 redesign pass** — the live view
still assumes a live connection to record `markAired`/`markMissed`/
`moveRundownItem`. This is the top unresolved operational gap coming out of
this redesign; see §7. The originally-designed shape (queue actions locally
in IndexedDB with a client-generated id, retry with backoff, replay on
reconnect — the same write-then-sync-then-acknowledge pattern Remote
Interview's local capture uses for audio chunks) is still the intended
approach; it simply hasn't been built yet.

### Fit with portal conventions

`requireToolAccess("log")` gates the route segment; Server Actions in
`actions.ts` per screen area (`clock-actions.ts`, `library-actions.ts`,
`rundown-actions.ts`, `broadcast-actions.ts`) assert access first and use
`failIfError`/`failWith` for the standard `?error=` bounce-back; reads live
in `lib/log/queries.ts` behind `unwrapRead()`; pure logic (timing, the
mid-broadcast state machine, content-eligibility filtering, rundown
generation, submission review) sits in colocated `*.test.ts`-covered modules
with no Supabase import.

Capabilities registered for the MCP/agent layer:
`log.rundown.buildItem` (add a content item, live read, or weather item to a
break), `log.rundownItem.recordOutcome` (the aired/move/missed action,
confirmation `required`), and `log.content.search` (mirroring
`sourcework.project.search`).

### What's deliberately not in the architecture

- **No offline resilience for the live view** — see above; the top unresolved gap.
- **No automation-system integration.** `confirmation_source = 'automation'`
  exists in the schema for when that integration is built, but nothing
  populates it yet.
- **No video.** Out of scope for this entire product area.
- **No second concurrent host editing the same rundown.**
- **No notification layer**, same as every tool in this portal. A stale
  NPR/weather flag or an unresolved exception is visible when the relevant
  screen is open, not pushed.
- **No manufactured local opportunities for the twelve non-Morning-Edition
  clocks.** Only real, WUWF-confirmed operational detail gets seeded — see
  §5.

---

## 7. Milestone 1, and what is left

**Milestone 1, plus the 2026-08-07/08 domain redesign, ships:** clock
templates and versions with a separate, editable local-opportunity overlay;
program scheduling; the content library (referencing DAD by cart number,
not portal-hosted audio); NPR rundown display; the weather live-read with
per-airing override; daily rundown generation around local opportunities
(never flagging an unused optional one); and the single rundown screen —
the vertical break-card list for planning, gaining continuous break-level
timing, adjustable-size copy, inline underwriting-credit scripts, and the
three mid-broadcast actions once a broadcast is under way — plus rundown
submission, all writing directly to `log_broadcast_events`. Builder and
console started as two routes and were merged into this one screen after
two rounds of usability corrections; see §6's "One screen, not two."

**Genuinely unresolved, in priority order:**

1. **Offline/connectivity resilience for the live rundown view** (§6) — not
   built in this pass. This is the single highest-priority remaining gap: a
   real connectivity drop during a live broadcast currently risks losing an
   unsent mid-broadcast action, exactly what §22 warns against.
2. **Local opportunities for the other twelve seeded network clocks.** Only
   Morning Edition has real, confirmed local-substitution windows as of this
   redesign; every other clock has an accurate network structure but no
   overlay, so a rundown generated from it has no host-fillable breaks at
   all until a producer (or a future migration, once WUWF confirms the real
   windows) adds them.
3. **FCC community-issue taxonomy as a real reference**, once FCC Reporting
   ships.
4. **Automation-system confirmation**, pending an answer to which system and
   what format.
5. **Multi-editor rundown concurrency**, if a real second-host scenario
   turns out to need it.

**Open questions specific to this tool:**

- Which weather API/vendor, and what's in its contract terms about update
  frequency and forecast-area granularity?
- Do any of WUWF's other twelve clocks have local-opportunity behavior not
  yet captured — floating windows with unusual eligibility, opportunities
  that only exist on certain days? Each needs the same real-diagram
  verification Morning Edition got before being seeded.
- WUWF's own production NPR CDS token is still outstanding — rate limits,
  update cadence, and response fields beyond what this implementation
  defensively parses remain unconfirmed until it exists.

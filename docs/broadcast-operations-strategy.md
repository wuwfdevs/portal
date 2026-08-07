# Broadcast Rundown & Traffic — Strategy and Schema Plan

Status: **Log and Underwriting & Traffic have both shipped milestone 1 and
been redesigned (2026-08-07/08) against real WUWF operational detail — see
their own design docs' status lines. FCC Reporting remains design-only, not
authorized to build, per §6's build order.** This document still records the
tool-boundary and schema decisions the three tools below build on.

Source: `WUWF Unified Broadcast Rundownand Traffic System` (functional
requirements, August 2026), supplied by WUWF. That document specifies one
system; this one splits it into three portal tools sharing one schema
lineage, and records why.

---

## 1. Why three tools, not one

The source document names five distinct user groups (§2): traffic/underwriting
staff, newsroom staff, promotions staff, on-air hosts, and management. Three of
those groups have workflows that don't just differ in content — they differ in
*operating mode*, the way this portal's existing tools differ from each other:

- **On-air hosts** need a live, low-latency console (§13) built for
  under-pressure use during a broadcast: large controls, minimal typing,
  continuous timing math, local resilience during a connectivity drop.
- **Traffic staff** need contract/copy administration, an automatic
  scheduler, a post-broadcast exception queue, and affidavit generation
  (§6, §16, §17) — ordinary CRUD-and-review work with no live-broadcast time
  pressure at all.
- **Newsroom, management, and a compliance officer** need a quarterly,
  low-frequency compliance workflow (§18) that aggregates months of
  broadcast history into an FCC filing — a completely different cadence and
  audience from the other two.

Building this as one tool would force at least one of those groups through a
UI shaped for a different one — most damagingly, cluttering the live console
with admin surface that has no business being on screen during a broadcast.
This portal's existing precedent is to split by user group and workflow, not
by data domain (Sourcework's Source Library and project workspace stay in
*one* tool because they're the same audience doing the same kind of work;
Remote Interview and Sourcework are separate tools despite both being
media-processing pipelines, because the people and moments of use differ).
The same logic applies here, more strongly, because the operating-mode gap
between "live broadcast" and "quarterly filing" is wider than anything else
in this portal today.

**The three tools:**

| Tool | Route | Tool key | Table prefix | Primary users |
|---|---|---|---|---|
| Log | `/log` | `log` | `log_` | Hosts (primary); newsroom and promotions staff as content contributors; management (read) |
| Underwriting & Traffic | `/underwriting` | `underwriting` | `uw_` | Traffic staff; management |
| FCC Reporting | `/fcc-reporting` | `fcc-reporting` | `fcc_` | Newsroom staff; management; compliance officer |

Each gets its own `requireToolAccess()` gate and its own migration(s), per the
portal's standard tool pattern — no portal-schema changes beyond narrowly
scoped additive RLS, same as every tool before it.

---

## 2. Schema ownership

The three tools share data more deeply than any two tools in this portal do
today: Underwriting's scheduler has to *write* into Log's rundown inventory,
not just read it, and FCC Reporting aggregates broadcast history that Log
produces. That's a real difference from existing cross-tool cases (Roadmap
reading `tools`, the MCP audit policy, Sourcework/Remote Interview's ASR
handoff) — but the *shape* of the answer is the same one this portal always
reaches for: **one tool owns each table outright; another tool gets a
narrowly scoped additive RLS policy and/or a capability, never a second
migration adding parallel tables for the same concept.**

**Log owns the operational spine** — Program, Clock, Content item, Rundown,
Broadcast event — because it's the tool that generates and executes the daily
rundown; every other table in the system exists to feed or consume that
spine. Underwriting and FCC Reporting are consumers with scoped write paths
in, not co-owners.

This also settles where an underwriting credit lives when it occupies a
rundown slot. Rather than mirroring underwriting copy into a shadow
`log_content_items` row (a sync problem waiting to happen), `log_rundown_items`
takes the same shape Sourcework's `sw_source_excerpts` already uses for
"exactly one of several possible references": an `item_kind` column
(`content` | `live_read` | `weather` | `underwriting_credit`) with
`content_item_id`, `live_read_title`, and `underwriting_copy_id` all
nullable, and a check constraint requiring exactly one shape to be set. Same
pattern, not a new one. Built as originally sketched here, then corrected
once real WUWF clock detail showed the network-clock/local-opportunity split
`docs/log-design.md` §2 describes was also needed: a rundown item sits
inside a `log_rundown_breaks` row (one per local-opportunity occurrence),
not directly against a clock slot — the underwriting credit's own reference
shape didn't need to change, only what container holds it.

---

## 3. Log — schema sketch

Owns the structural and operational core (source doc §4, §5, §7–§9, §11–§15).

- `log_programs` — recurring/special broadcast programs.
- `log_clock_templates` — versioned clocks (weekday/weekend/program-specific/
  holiday/special-event), each with an effective date and a pointer to which
  version generated a given rundown (§4.3).
- `log_clock_slots` — ordered positions within a template describing only
  the network's own published structure: offset, duration, label, fixed vs.
  float timing (§4.2). **Corrected in the 2026-08-07/08 redesign**: an
  earlier version of this table also carried fill/assignment/fillability
  columns, until checking it against a real WUWF clock showed local
  substitution is not a property of one network segment — see
  `log_local_opportunities` below and `docs/log-design.md` §2.
- `log_local_opportunities` — WUWF's own local-substitution overlay on a
  clock version, independently editable in place (unlike the network clock's
  own insert-only immutability): offset/window, duration, `required` vs.
  `optional`, permitted content types, whether more than one item may occupy
  it. May span several network clock slots at once (`docs/log-design.md`
  §2's Morning Edition example).
- `log_schedule` — maps programs to the calendar: the recurring weekly grid
  plus date-bounded substitutions and holiday overrides (§4.1).
- `log_content_items` — every non-underwriting content type from §7.1 (news,
  station/program promo, membership message, university announcement, PSA,
  legal ID, interview/feature, host-created item). Underwriting credits are
  explicitly out — see §2 above.
- `log_content_components` — live intro / recorded audio / live outro /
  optional tag rows under a content item, each independently timed, so total
  occupied time is always the sum of required components (§7.3).
- `log_npr_episodes` / `log_npr_episode_items` — the most recently retrieved
  dated NPR program-episode (NPR's Content Distribution Service model —
  see `docs/log-design.md` §5) for each mapped program, and its ordered
  story items, with a retrieved-at timestamp and a flag for staleness (§5)
  — a cache of an external source, not user-authored data.
- `log_weather_reading` — single current row plus revision history, not one
  row per clock slot (§8) — every weather slot references the current
  version.
- `log_rundowns` — one per program/host shift instance: generated, edited,
  and eventually submitted/frozen (§15.3).
- `log_rundown_breaks` — one occurrence of a local opportunity within a
  rundown; a container zero or more rundown items may occupy (added in the
  2026-08-07/08 redesign alongside `log_local_opportunities` above).
- `log_rundown_items` — placements within a break: `item_kind` (see §2),
  scheduled/planned time and duration, per-airing overrides that never
  mutate the master content item, locked/movable/replaceable, current air
  status.
- `log_broadcast_events` — the as-aired record: one row per rundown item with
  the full outcome vocabulary from §15.1 (aired as scheduled, aired at a
  different time, partially aired, skipped, missed, replaced, wrong copy
  aired, unconfirmed, pending review, makegood scheduled/aired, waived),
  actual duration, and confirmation source (§15.2). This is the single
  source of as-aired truth both other tools read.

Community-issue tagging on news items (§9's "subject and community-issue
tags") references a taxonomy — see §5 below for why that taxonomy lives in
FCC Reporting rather than here.

---

## 4. Underwriting & Traffic — schema sketch

Owns contract administration and everything downstream of it (source doc §6,
§16, §17). **Redesigned 2026-08-07/08** against a real WUWF underwriting
agreement (`docs/underwriting-design.md` §1's "The reference agreement") —
the sketch below is the corrected shape, not the original one.

- `uw_underwriters` — a durable sponsor entity (name, contact, category),
  replacing free-text `underwriter_name` on the contract. Added in the
  redesign.
- `uw_contracts` — underwriter reference, contract identifier, a real
  attached agreement document (a Storage object, not a bare URL),
  sponsorship total/category, an explicit `affidavit_required` flag,
  preemption policy, effective dates, status, notes.
- `uw_contract_schedule_lines` — one or more per contract, replacing the
  original `uw_placement_obligations`: day(s) of week, target time,
  duration, program, date range — the real shape of a WUWF insertion order
  ("Monday ~7:49am × 26 weeks"). `sponsorship_position` (opening/closing/
  mid), never grounded in a real agreement, was removed outright.
- `uw_copy` — script, cart identifier (an ENCO/DAD reference — see
  `docs/log-design.md` §6's parallel DAD finding), duration, a rotation
  label ("Message A"/"Message B"), effective/expiration dates, approval
  status, and `execution_kind` (`live_read` | `recorded`) replacing the
  original universal `production_status`, linked to the contracts allowed to
  use it (§6.3).
- `uw_scheduled_placements` — which schedule line is slated into which
  `log_rundown_breaks` row on which date, and its status (scheduled / locked
  / conflict / superseded) (§6.4). Log's rundown generation reads eligible
  rows here the same way it reads `log_content_items` — the scheduler
  doesn't write `log_rundown_items` directly; Log still owns turning an
  eligible placement into an actual rundown item.
- `uw_exceptions` — the post-broadcast queue (§16): rows created against
  `log_broadcast_events` where the outcome is moved/missed/disputed, carrying
  the applicable schedule line, compliance judgment, and resolution (accept
  alternate airing / schedule makegood / reassign / waive / request
  clarification / note / close).
- `uw_makegoods` — scheduled and aired makegood tracking, linked to both the
  originating schedule line and the exception that produced it, per the
  reference agreement's own preemption policy: rescheduled within the
  program originally sponsored.
- `uw_affidavits` — generated from confirmed or management-approved
  `log_broadcast_events` rows, never from the original schedule alone (§17)
  — retains a durable link to the underlying events for audit and
  regeneration.

Two derived-not-stored corrections from the redesign, both because the
original design let staff manually set what should always be computed:
fulfillment status (`lib/underwriting/fulfillment.ts`) is never a column
anyone edits, and a lightweight competitive-adjacency advisory
(`lib/underwriting/adjacency.ts`) — flagging, never blocking, when another
underwriter in the same category already has a nearby placement — replaced
what could have become a full rules engine nobody asked for.

**Cross-tool write path:** the scheduler and the mid-broadcast host actions
(§14 — aired/move/missed) both need to cross the Log/Underwriting boundary.
Per the capability-layer convention already in this repo (Phase A/B,
`src/lib/capabilities/`), that boundary should be a capability
(`underwriting.credit.schedule`, `underwriting.exception.resolve`, etc.), not
direct cross-tool table access from Server Actions — same shape as
`audience-listening.answer.sendToSourcework`.

---

## 5. FCC Reporting — schema sketch

Owns the compliance taxonomy and quarterly filing workflow (source doc §18).

- `fcc_community_issues` — the controlled taxonomy referenced by
  `log_content_items`' community-issue tags (§9, §18.1) — owned here because
  the taxonomy's shape and lifecycle are compliance decisions, not editorial
  ones, even though the tags themselves are set on Log's content.
- `fcc_issue_narratives` — draft narratives assembled per quarter per issue,
  aggregating `log_broadcast_events` (via the content items and programs they
  trace back to): total airtime, item count, programs, confirmed airings
  (§18.2).
- `fcc_filings` — the approved, generated filing document per quarter, with
  filing date and an archived copy of the approved narrative and supporting
  evidence (§18.2's "record the filing date and archive").

FCC Reporting never writes to Log or Underwriting — it's read-only against
`log_broadcast_events`/`log_content_items` (narrowly scoped additive RLS) and
owns everything it produces itself. §18.3's compliance boundary — the system
prepares, it never decides which issues are most significant or files
without review — is a product rule enforced by keeping every write here
staff-initiated, not a background job (this repo still has no job queue).

---

## 6. Suggested build order

Following the source document's own phasing (§23–24) and this portal's
"foundation before extension" pattern:

1. **Log, minimal**: program schedules, clock templates, content library
   (excluding underwriting), NPR display, weather, daily rundown + host
   console, continuous timing, host exception actions writing directly to
   `log_broadcast_events` (with no Underwriting integration yet — a "missed
   underwriting credit" is just an outcome on the event, unresolved). ✅
   **Shipped**, then redesigned 2026-08-07/08 — see `docs/log-design.md`.
2. **Underwriting & Traffic**: contracts, copy, manual (not yet automatic)
   placement into Log's rundown, the post-broadcast exception queue reading
   `log_broadcast_events`, basic affidavits. ✅ **Shipped**, then redesigned
   in the same pass, grounded in a real WUWF agreement — see
   `docs/underwriting-design.md`.
3. **Automatic scheduling** as a follow-up slice on Underwriting, once manual
   placement has validated the eligibility rules against more of WUWF's real
   contract patterns beyond the one reference agreement this redesign used.
   **Not started.**
4. **FCC Reporting**: depends on a real backlog of `log_broadcast_events` and
   community-issue-tagged content existing before quarterly aggregation is
   useful to build against. **Not started** — design is written
   (`docs/fcc-reporting-design.md`) but not authorized to build.

This mirrors the source document's own initial-scope table (§23): the
operational spine first, underwriting fulfillment second, compliance
reporting last because it has the least urgent cadence and the most to gain
from real data existing before it's built.

---

## 7. Open questions before any schema is written

Carried from the source document's §26, unresolved and still blocking:

- Which broadcast automation system receives the current RadioTraffic log,
  and what export/as-run formats does it support? (Affects whether
  `log_broadcast_events`' automation-confirmation source is a real
  integration or host-confirmed only, at least initially.)
- ~~What NPR API or station integration is actually available for
  rundowns?~~ Resolved (2026-08-07): NPR's Content Distribution Service
  (CDS) — see `docs/log-design.md` §5/§7 and CLAUDE.md. WUWF's own
  production token is still outstanding.
- Which existing clock and contract patterns represent WUWF's complete set of
  use cases? **Partially resolved (2026-08-07/08):** one real clock (Morning
  Edition) and one real underwriting agreement (Autumn Beck Blackledge) have
  now been checked against the schema, and both surfaced real corrections —
  see `docs/log-design.md` §2 and `docs/underwriting-design.md` §1. The other
  twelve seeded clocks have accurate network structure but no confirmed
  local-opportunity overlay, and only one contract pattern has been verified
  against the schedule-line model — both still open per each doc's own §7.
- What level of automation confirmation exists for carts, live reads, and
  local news, and who has final authority over alternate airings, makegoods,
  and affidavits? (Shapes `uw_exceptions`' approval flow.)
- What controlled taxonomy should `fcc_community_issues` actually use, and
  how long must completed rundowns and generated reports be retained?

None of these block writing the individual per-tool design docs (Log's, in
particular, could proceed against reasonable defaults), but they should be
resolved — or explicitly deferred with a stated default — before any
migration lands, per this repo's usual rule that a migration is schema, not
a draft.

---

## 8. Next step

All three per-tool design docs are now written — `docs/log-design.md`,
`docs/underwriting-design.md`, `docs/fcc-reporting-design.md` — at the same
depth as `docs/roadmap-design.md` or `docs/academic-partnerships-design.md`.
This document is the boundary and schema-ownership decision those three
docs build on, not a replacement for them.

Per the build order in §6: Log's milestone 1 shipped in full, and
Underwriting & Traffic's milestone 1 has since shipped too (see CLAUDE.md).
Both were then redesigned together on 2026-08-07/08 once real WUWF
operational detail existed to check the original models against — a real
annotated Morning Edition clock for Log, a real executed underwriting
agreement for Underwriting. See each tool's own design doc for what changed
and why. Automatic rules-based scheduling (item 3) and FCC Reporting
(item 4) remain **not started** — like every tool in this portal, a written
design is not the same as authorization to build; see each one's own status
line and CLAUDE.md before starting any migration. FCC Reporting in
particular depends on a real backlog of `log_broadcast_events` and
community-issue-tagged content existing first, so it stays last regardless
of when its design doc was written.

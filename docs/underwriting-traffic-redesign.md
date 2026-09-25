# Underwriting & Traffic: insertion-order-grounded redesign

**Status:** built 2026-09-25 in four slices (schema; demand expansion;
eligibility/auto-fill/manual placement; UI/validation) — see §8 for what
shipped and how it was verified — **and revised the same day by a second,
deeper audit of the archive (§9), which replaced the four typed rule kinds
with eligibility lines plus explicit demand buckets, added contract
revisions, and keyed opening/closing positions to Log. §9 supersedes §3–§5
and §8 wherever they conflict; the evidence in §2 and the non-goals in §6
still stand.** This is the current-state/proposed-schema
diff the redesign brief (2026-09-24) asked for first; it supersedes
`docs/underwriting-design.md` §2's "Contract schedule line" and §5's
`uw_contract_schedule_lines`, and CLAUDE.md's 2026-08-09 auto-fill notes,
where they conflict. Read `docs/underwriting-design.md` and
`docs/log-slot-keyed-breaks-design.md` first.

Source material: the fourteen signed WUWF orders the brief lists (read from
the originals on 2026-09-25 — see §2), plus the Autumn Beck Blackledge
reference agreement already on file.

---

## 1. Current state, and what it cannot express

`uw_contract_schedule_lines` is one recurrence shape: `days_of_week`,
optional `target_time`, `duration_seconds`, optional `program_id`, a date
range, and a _total_ `occurrence_count_override`. `expectedOccurrenceCount`
counts matching weekdays (or returns the override); `collapseToOnePerDay`
lets auto-fill place at most one credit per line per calendar date, closest
to `target_time`. `log_place_underwriting_credit()` checks program, contract
status, copy linkage/approval/dates and duration fit — **not** date range,
weekday, quantity, or anything about "how many this week".

Checked against the real orders, that model is wrong in four ways:

| Order                                                                  | Says                                                 | Current model                                                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Boyles, Natural Awakenings, Move Period (rotation), Bud & Alley's, FPL | _N spots per week_ on any of several days            | Seven eligible weekdays means seven per week; an override of 156 can't say "3 a week" |
| Choral Society, USF, Armstrong (June PM)                               | _two per day_ on a date                              | Hard-capped at one per line per day, everywhere                                       |
| Emerald Coast, Live Nation, Symphony                                   | Explicit dates, some months apart                    | Only a recurrence; nothing stops the planner spreading credits over the gaps          |
| FPL                                                                    | A week-by-week grid with zero weeks and a bonus line | No per-week quantity at all                                                           |

And three operational gaps: the document's "AM Drive" / "Carpool" /
"Weekend Edition" is not a `log_programs` id and has no mapping to Log
opportunities; a placement writes no record of _which_ contractual unit it
satisfies, so nothing can say "week of 4/6: 2 expected, 1 aired, 1 missed";
and revising or cancelling an order (Symphony's replaced flight, Armstrong)
has no path except deleting rows by hand.

### Files and objects affected

**Tables** — `uw_contract_schedule_lines` (rewritten in place),
`uw_scheduled_placements` (+ demand-period columns, `makegood_id`),
`uw_contracts` (+ agency/separation policy, stated total),
`uw_contract_copy` (+ `flight_id`), `uw_exceptions` (+ `scheduled_placement_id`,
`makegood_approval`), `uw_makegoods` (+ `demand_period_start`). **New:**
`uw_inventory_pools`, `uw_inventory_pool_targets`, `uw_contract_flights`,
`uw_schedule_allocations`.

**Functions** — `log_place_underwriting_credit` (rewritten: full contractual
eligibility, period quota, day cap, same-contract-in-break, flight-scoped
copy, makegood linkage, row lock), `log_list_placeable_rundown_breaks`
(pool/window/day/date filter, returns `minutes_of_day`),
`uw_flag_exception_from_broadcast_event` (records the placement and the
agency-approval state), new `uw_line_period_for_date` (the one SQL copy of
"which period does this date belong to, and what is its quota"). Unchanged:
`log_clear_underwriting_credit`, `log_relocate_underwriting_credit`,
`log_generate_rundown_for_underwriting`, `log_get_program_schedule_context`,
`log_insert_rundown_items_for_underwriting`, `log_list_programs`,
`uw_update_makegood_from_broadcast_event`, both guard triggers.

**Code** — replaced: `lib/underwriting/schedule-lines.ts` (→ `demand.ts`),
`auto-fill-plan.ts` (→ `inventory-selection.ts`), `fulfillment.ts`
(per-period), `conflicts.ts`; rewritten: `auto-fill.ts`,
`rundown-provisioning.ts`, `queries.ts` (line/placement/demand reads),
`placement.ts` (error codes, new RPC shapes), `capabilities.ts` (unchanged
contract, new checks underneath); the route's `contract-actions.ts`,
`placement-actions.ts`, `auto-fill-actions.ts`, `makegood-actions.ts`,
`exception-actions.ts`; screens `contracts/[id]/page.tsx`, `page.tsx`
(dashboard), `makegoods/page.tsx`, `exceptions/[id]/page.tsx`, new
`pools/page.tsx`; `nav-tabs.tsx`; `database.types.ts`; `supabase/seed.sql`.
Untouched on Log's side: everything except the two functions above —
breaks stay slot-keyed, items keep `underwriting_copy_id`, broadcast events
and the exception/makegood triggers keep their shape.

## 2. Evidence: the fourteen orders, as fixtures

`src/lib/underwriting/fixtures/insertion-orders.ts` transcribes each order's
schedule into the new model, with the document's stated totals, and
`demand.test.ts` checks the arithmetic against those totals. What the
originals actually say (transcribed 2026-09-25):

- **Boyles & Boyles** (9/21/26–9/19/27, 52 weeks): 104 drive = 2/week; 156
  rotation = 3/week; 52 Weekend Edition = 1/week "in either Sat. or Sun".
- **Natural Awakenings** (4/13/26–4/11/27): 156 ROS = 3/week Mon–Sun.
- **Move Period** (8/31–11/29/26, 13 weeks): AM drive 1 each Mon/Wed/Thu,
  PM drive Tue (52 drive); rotation 1 each Tue/Fri (26); two rotating
  scripts; affidavits yes.
- **Bud & Alley's** (2/16–11/29/26): drive 2/16–4/26 3/week (2 AM, 1 PM);
  4/27–11/29 2 AM/week — 30 + 62 = 92 ✓; rotation 2 the week of 2/16, then
  1/week 2/23–11/29 — 2 + 40 = 42 ✓.
- **Lynn Keefe Pediatrics** (6/9/26–6/6/27): 52 spots, Carpool, Tuesday
  8:19 AM. **Open Books** (9/7/26–9/6/27): 52, Carpool, Thursday 8:44 AM.
- **309 Punk Project** (10/1/26–1/28/27, "17 weeks"): "Oct. 3–Oct 23 Friday
  @ 7:49 AM" then "Oct 29–Jan 28 Thursday @ 8:19 AM". Oct 3 is a Saturday;
  Fridays 10/9, 10/16, 10/23 (3) + Thursdays 10/29–1/28 (14) = 17 ✓ — the
  flag the brief asked for, surfaced as a review warning, not resolved here.
- **Choral Society** (10/5/26–5/15/27): four concert flights, each 15 AM
  drive: 1/weekday the first week, 2/weekday the second (Oct 5–9/12–16;
  Nov 23–27/Nov 30–Dec 4; Mar 8–12/15–19; May 3–7/10–14) = 60 ✓.
- **Emerald Coast Theatre** (9/8/26–5/23/27): six productions with explicit
  AM-drive and ROS dates — 28 AM + 36 ROS, every list reconciling.
- **Live Nation** (5/18–5/22/26): nine dated spots — Mon/Wed/Fri × three
  windows (6–10a, 10a–3p, 3–7p), 30s, $450 total.
- **FPM / USF** (4/6–6/21/26): 2 × Friday 7–8 PM Putumayo World Music, 11
  weeks = 22 ✓; "Separation between spots: 3" (units unspecified).
- **FPM / FPL** (1/26–12/27/26): a week grid, five lines (AM 5a–9a M–F, PM
  3p–6p M–F, RT 9a–3p M–F, WK Sat 8a–12p, BN bonus 5a–12a all week, $0),
  48 columns, four zero weeks (3/23, 5/25, 8/24, 11/23), 108/96/84/72/180 =
  540 ✓; "MAKEGOODS MUST BE APPROVED BY AGENCY. PLS TRY TO AIR YOUR MGS
  WITHIN BROADCAST MONTH".
- **Pensacola Symphony** (updated IO): five flights of 1 AM drive/weekday
  (+ one PM drive spot in three of them); flight #5 (Apr 20–24) cancelled and
  replaced by May 11–15, past the order's April 25 end date — flagged.
- **Armstrong** (cancelled): May 4–Jun 21: 1 AM drive each Mon–Fri + 1 PM
  drive "Wed or Thursday" per week; Jun 22–Jul 5: 1 AM each Mon–Fri + PM
  drive on Jun 24, 25, Jul 1, 2. IO end date printed "July 5, 2027" against
  the agreement's 2026 — flagged.

Every order carries the same standard language: preempted spots
"rescheduled within the program originally sponsored"; "does not run
adjacent to a business with similar services or products".

## 3. Proposed model

**Four typed rule shapes, one table.** `uw_contract_schedule_lines` keeps
its name and its foreign keys (placements, exceptions, makegoods) and gains
`rule_kind`:

| `rule_kind`      | Means                                                                                                                                                       | Columns used                         | Period             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------ |
| `fixed_days`     | `count_per_day` credits on each of `days_of_week` in the date range                                                                                         | days, count_per_day, target_time     | one calendar day   |
| `weekly_quota`   | `quantity_per_week` credits per Mon–Sun week, on any of `days_of_week`, at most `max_per_day` per day                                                       | days, quantity_per_week, max_per_day | one broadcast week |
| `explicit_dates` | the dates and counts in `uw_schedule_allocations` (`period_kind = 'day'`)                                                                                   | allocations                          | one calendar day   |
| `week_grid`      | the week-by-week quantities in `uw_schedule_allocations` (`period_kind = 'week'`, `period_start` a Monday), at most `max_per_day` per day on `days_of_week` | days, allocations, max_per_day       | one broadcast week |

Common to all: `label`, `pool_id` and/or `program_id`, optional
`window_start`/`window_end` (station-local, narrowing the pool),
`target_time`, `duration_seconds`, `start_date`/`end_date`, `flight_id`,
`is_bonus`, `stated_total` (the IO's own number, validated against the
expansion — never used as the target), `source_text` (verbatim nuance,
never interpreted), `status` (`active` | `cancelled`) with
`cancelled_from`. A check constraint enforces exactly the columns each kind
needs. Dated phases are separate lines (Bud & Alley's, 309 Punk,
Armstrong); flights (`uw_contract_flights`: name, dates, status) group a
concert's or production's lines and scope copy — `uw_contract_copy.flight_id`
ties a script to its event, and a line in flight X only ever gets copy
linked to X or to no flight.

**Inventory pools** (`uw_inventory_pools` + `uw_inventory_pool_targets`) are
staff-defined names — AM Drive, PM Drive, Total Program Rotation, Weekend
Edition, Carpool, Mid-day — each mapped to one or more targets: an optional
program, an optional station-local window, optional days. A line's
candidate breaks are the Log opportunity breaks matching any target,
narrowed by the line's own program/window/days. A window with no marked
opportunity (Putumayo tonight) produces a capacity exception, never a
manufactured break — the slot-keyed design already decided that.

**Placements carry their demand unit.** `uw_scheduled_placements` gains
`demand_period_start`/`demand_period_end` (the day or week the placement
consumes) and `makegood_id`. A makegood's placement inherits the missed
placement's period, so a week reads "2 expected, 1 aired, 1 missed, 1
makegood aired" rather than counting the replacement as a third unit.

**One guard, two callers.** `log_place_underwriting_credit()` locks the
schedule line row (`for update`, serializing concurrent staff actions),
derives the break's date and station-local time, and rejects a placement
whose date is outside the line, not on an eligible day, outside the pool/
window, already at the period's quota (`uw_line_period_for_date()`), at the
day cap, in a break that already holds this contract, or using copy linked
to another flight. A makegood placement (`p_makegood_id`) is exempt from the
quota — it replaces a unit — but refused while its exception's
`makegood_approval` is `pending` or `declined`. The TypeScript planner
(`demand.ts` + `inventory-selection.ts`, pure and tested) applies the same
rules before it ever calls the function; the function is the backstop that
makes a manual placement unable to bypass them "unnoticed".

**Preemption and agency policy on the contract.**
`makegood_requires_agency_approval` (FPL) makes every new exception's
`makegood_approval = 'pending'`; staff record the agency's answer on the
exception screen, and neither auto-fill nor manual scheduling will place the
makegood until it is `approved`. `separation_source_text` holds "3" verbatim;
`separation_policy` is `unspecified` until staff choose `none` or
`min_minutes` (with `separation_minutes`) — a contract still `unspecified`
with source text present is skipped by auto-fill with a named reason.
Same-contract-in-one-break is always enforced; same-underwriter/same-category
adjacency within a break stays enforced in the planner as today.

## 4. Planner shape

- **Demand expansion** (`lib/underwriting/demand.ts`, pure):
  `expandDemandPeriods(line, allocations)` → periods with eligible dates and
  quantity; `expectedTotal`; `periodForDate`; per-period fulfillment from
  placements + outcomes + exceptions + makegoods; `describeScheduleLine` (the
  order-entry preview: "2 AM Drive credits each Mon/Wed/Thu",
  "3 Total Program Rotation credits a week on any of Mon–Sun").
- **Inventory selection** (`lib/underwriting/inventory-selection.ts`,
  pure): given open periods, candidate breaks (date, minutes of day, capacity,
  last-item adjacency) and copy, assign breaks to shortfall — closest to
  `target_time`, spread across the week for a quota, distinct breaks for
  same-day multiples, separation minutes, adjacency, rotation fairness,
  flight-scoped copy — and report every unplaceable unit with a reason.
- **Placement** — the guarded RPC, unchanged in role.
- **Provisioning** — `autoFillScheduleLine` probes existing inventory, asks
  Log for rundowns on exactly the dates the plan is still short (from the
  expansion's eligible dates, not a second walk), plans again, executes.

## 5. Migration and test-data reset

One migration, `20260925120000_underwriting_traffic_redesign.sql`. Both
projects were checked on 2026-09-25: production holds 1 draft contract, 0
lines, 0 placements/exceptions/makegoods/affidavits; preview holds the seeded
Autumn contract, 3 lines and 75 test placements whose rundown items were
already deleted by the slot-keyed migration. Underwriters (40 in production)
and copy (67, from program-log imports) are the copy library and stay.

Order: (1) delete every `uw_contracts` row — cascades to lines, placements,
exceptions, makegoods, affidavits and contract-copy links; any Log item still
referenced by an active placement is deleted first (none exist); (2) alter
`uw_contract_schedule_lines` in place (drop `occurrence_count_override`/
`makegood_policy`, add the columns above, add constraints); (3) create the
four new tables with member-level RLS in the initplan convention; (4) add
the placement/contract/exception/makegood columns; (5) replace the two Log
boundary functions and the exception trigger; (6) reseed local sample data
(`seed.sql`) with the Autumn reference plus pools. Then apply to preview,
verify by RLS simulation, apply to production, record in `APPLIED.md`, run
`db:check`.

## 6. Deliberately not supported

- **A general scheduling language** (free-text or JSON rules). Four kinds
  cover every order on file; a fifth gets a fifth enum value.
- **Cross-break or cross-day competitive separation.** Within-break
  adjacency stays; anything wider needs a station rule nobody has stated.
- **Interpreting FPM's "separation: 3".** Stored verbatim, blocks auto-fill
  until staff pick a policy.
- **A legal-document revision ledger.** Cancel/revise records
  `cancelled_from` on the line and clears future placements; the attached
  order document is the history.
- **Broadcast-month makegood preference (FPL).** Recorded in the contract's
  preemption text, honoured by a human choosing the makegood's slot.
- **Rates, billing, non-broadcast benefits.** The brief excludes them.
- **Prorating partial weeks.** A partial first/last week counts its full
  quota and shows a review warning, per the brief's default.

## 7. Decisions taken with the brief's working defaults

Station-local Monday–Sunday weeks (FPL's columns are Mondays; every WUWF
order on file starts on a Monday). Exact placement times are targets within
the pool's window, not promises. "N per week" spreads across eligible days
with `max_per_day = 1` unless the order says otherwise (Choral, USF set it).
Pools are station data, entered once by traffic staff on
`/underwriting/pools`; the migration seeds the six names the orders use, with
targets only where the mapping is unambiguous from Log's current schedule
(AM Drive → Morning Edition 5–9a; PM Drive → All Things Considered 3–5p;
Weekend Edition → the two Weekend Edition programs; the rest are left for
staff to map).

## 8. What shipped, and how it was verified

Two migrations, applied to preview and production on 2026-09-25 and recorded
in `APPLIED.md`: `20260925120000_underwriting_traffic_redesign.sql` (§5's
plan, verbatim) and `20260925130000_underwriting_line_period_fix.sql` — two
bugs the preview scenario run caught after the first was applied: the
period helper's OUT columns collided with `uw_schedule_allocations`' column
names in the explicit/grid branches (PL/pgSQL "ambiguous"), and the
exception trigger's `CASE` for `makegood_approval` needed a cast to the enum
(a missed credit would otherwise have failed to record at all).

Code: `lib/underwriting/demand.ts`, `inventory-selection.ts`,
`schedule-line-form.ts`, `conflicts.ts` (all pure, tested; the fixtures in
`fixtures/insertion-orders.ts`); rewritten `queries.ts`, `auto-fill.ts`,
`rundown-provisioning.ts` (by program id), `placement.ts` (makegood
argument, new error codes); the route's actions and screens (§1 lists
them), a new `/underwriting/pools` screen and nav tab.

Verified: `npm run lint`, `typecheck`, `test` (979 tests: the acceptance
arithmetic in §5 of the brief for every order, the contested planner cases,
the form parser) and `db:check` all pass; a rolled-back, RLS-impersonated
scenario on preview exercised the SQL guard end to end — explicit-date
candidates limited to the listed date, a zero grid week excluded,
`copy_wrong_flight`, a second credit in the period refused
(`period_quota_met`), a PM-Drive line refused a Morning Edition break
(`pool_not_eligible`), a missed airing raising a `pending`-approval
exception, the makegood refused until approved, then refused by the day cap
on the same day, and a cancelled line offering no candidates.

**Not yet exercised**: the TypeScript auto-fill path against a live session
(sign-in is magic-link-only from a sandbox). Its first real click on the
contract page is its first end-to-end run; the SQL guard is what makes that
safe.

**Open operational decisions** (surfaced, not decided here): the unit of
FPM's "separation: 3"; the Carpool and Mid-day pools' Log mappings (seeded
with no targets — a line on either finds nothing until staff map them);
whether Weekend Edition should also admit the Saturday/Sunday All Things
Considered hour; and whether WUWF's broadcast week is Monday–Sunday in
practice (assumed here, matching every order on file).

## 9. Second pass: revisions, eligibility lines, demand buckets (2026-09-25)

A deeper audit of the underwriting archive (1,001 records surfaced; a
page-level audit of the first 100; six sponsors — FPL/FPM, the Symphony,
Phil Hall, Fireman Termite, FDOH Escambia, Open Books — followed across
years) found that §3's four rule kinds were still the wrong primitive.
The durable grammar of a WUWF insertion order is:

> A sponsor owes a quantity of credits within one or more time periods,
> subject to placement eligibility and distribution constraints.

Weekly quotas, every-other-week cadences, event phases, agency matrices
with dark weeks, and exact opening/closing positions are all ways of
writing that. Each rule kind carried its own quantity arithmetic
(`uw_line_period_for_date`), "one per day" was planner doctrine rather
than data, a preferred time and an exact slot were the same column, there
was no revision lineage, and bonus weight was a flag with no behavior. The
boundary moved from

`contract -> recurring schedule line -> expected occurrence math -> auto-fill -> placement`

to

`contract -> revision -> eligibility line -> explicit demand buckets -> auto-fill -> placement`.

### 9.1 Model

- **`uw_contract_revisions`** — one version of a contract's schedule.
  Exactly one is `current` per contract (partial unique index); a `draft`
  is entered beside it; a `superseded` one keeps its lines, buckets,
  placements, exceptions and broadcast events read-only. A contract's
  first revision is created current with it. `effective_from` is the date
  a revision takes over; `supersedes_revision_id`, `received_at`,
  `document_path` and `notes` are the lineage.
- **`uw_contract_schedule_lines` = eligibility only.** Where a credit may
  air: `program_id` and/or `pool_id`, `days_of_week` (empty = any day),
  a `time_mode` of `any` | `window` (`window_start..window_end`, hard) |
  `preferred` (`preferred_time` ranks, never excludes) | `exact`
  (`preferred_time` ± `uw_exact_time_tolerance()`, 3 minutes) | `opening`
  | `closing` (the program's first / last underwriting-permitted marked
  break, derived — see below); `max_per_day`
  (nullable — a cap is data from the order, never doctrine);
  `service_level` guaranteed | bonus; `distribution_preference`;
  `makegood_policy_text`; `duration_seconds`; `start_date`/`end_date`;
  `flight_id`; `stated_total`/`source_text`. `entry_kind` + `entry_spec`
  (jsonb) record how the staffer entered it — fixed days, N a week, N a
  month, every N weeks, explicit dates, a week grid, a range total — for
  display and recompilation only. Nothing schedules from them.
- **`uw_demand_buckets`** — `(schedule_line_id, period_start, period_end,
  quantity_required, status active|superseded|cancelled, source_label)`.
  A day, a Monday week, a calendar month, or the whole range. A dark grid
  week is a real row with quantity 0. Active buckets of one line never
  overlap (`uw_guard_bucket_overlap`). The scheduler asks one question:
  which active buckets are still short, and which eligible breaks fall
  inside them.
- **Placements and makegoods carry `demand_bucket_id`** (replacing the
  period-start/end pair). A makegood placement carries the missed
  placement's bucket, so a miss and its replacement are one contractual
  credit.
- **Opening and closing credits are derived from the clock, not labelled
  on it** (`20260925180000_underwriting_opening_closing.sql`, reversing
  this pass's first cut the same day). The first cut gave
  `log_local_opportunities` a `traffic_key` (`marketplace.opening`,
  `science-friday.closing`) that a producer typed on the clock screen and
  had to retype on every new clock version, and a `slot` time mode whose
  `required_opportunity_key` matched it. Reviewed: every opening/closing
  credit in the archive means exactly "the first / last avail of that
  program", so nothing needs entering in Log. The line keeps a time rule
  — `opening` or `closing`, since the order says which it bought — and
  `uw_break_position_eligible()` resolves it against the rundown: the
  break is eligible when no other marked, underwriting-permitted break of
  the same rundown is scheduled earlier (opening) or later (closing). A
  multi-hour shift's opening credit is its first hour's first avail. A
  named mid-program feature (Wild Birds' BirdNote at 7:42) is an `exact`
  line. `traffic_key` and `required_opportunity_key` are dropped;
  `target_time` stays gone — a time is never a proxy for a position.
- **`uw_industry_categories`** (requested during this pass): the
  underwriter's industry is a typed row (`uw_underwriters.category_id`),
  not free text, and the competitive-adjacency rule compares ids. Sixteen
  starter industries seeded from what the audited orders name; staff
  extend the list on the Underwriters screen.

### 9.2 Compiler

`lib/underwriting/demand-compiler.ts` (pure, tested against the corpus)
turns an `EntrySpec` into buckets: fixed recurrence → one-day buckets;
weekly quota → Monday weeks clipped to the line and flagged `partial`
(counted at full quantity, never prorated); monthly quota → calendar
months; every N weeks → only the weeks a whole number of intervals from
the anchor (Fireman's ROS: 26 alternate weeks, nothing in between);
explicit dates → one-day buckets, same-date entries summed, dates outside
the line dropped and flagged by review; week grid → one bucket per column,
zeros included; range total → one bucket. A week or month with no eligible
weekday yields no bucket. The form (`schedule-line-form.ts`) compiles on
save and refuses a line that compiles to nothing.

### 9.3 Guard and planner

`log_list_placeable_rundown_breaks()` returns, for a line, every marked
break on a date `uw_bucket_for_date()` accepts (inside the line's dates,
not cancelled, an eligible weekday, an active bucket with quantity) that
is on the line's program, inside its pool, and satisfies
`uw_time_eligible()` (window, exact ± tolerance) and, for an opening or
closing line, `uw_break_position_eligible()` — each tagged with the bucket
it would consume. `log_place_underwriting_credit()`
additionally requires the line's revision to be `current`, refuses a
bucket at its quantity (`bucket_quota_met`), applies `max_per_day` only
when the order states one (`day_cap_met`), and attributes a makegood to
its missed bucket. `lib/underwriting/eligibility.ts` is the TypeScript
twin (`bucketForDate`, `isTimeEligible`, `isBreakPositionEligible`,
`EXACT_TIME_TOLERANCE_MINUTES`); keep them in step.

`inventory-selection.ts` plans per bucket: makegoods first; then each
bucket's fresh shortfall spread across its eligible days with inventory,
least-loaded day first, so New South's "10 a week M–F" lands as two a day
rather than ten on Monday; a per-day cap is respected when present and
absent otherwise (Choral's two a day, FDOH's one a day are both data);
distinct breaks per day; separation minutes; same-underwriter/same-
industry adjacency; preferred time ranks within a day; copy rotates by
least use. `datesNeedingInventory()` asks Log for rundowns on the bucket's
own dates. The global one-per-day collapse is gone.

Fulfillment (`demand.ts`) counts per bucket; a bonus line reports but is
never "behind" and never makes the contract read behind; superseded and
cancelled buckets drop out of the expected total.

### 9.4 Revisions

"Create a revision from the current schedule" makes a draft (optionally a
copy of the current lines and their active buckets) beside the current
revision; lines are added to either. The contract page previews exactly
what activation will do — the current revision's active buckets still
open on the effective date that become superseded, the scheduled
placements dated on or after it that are cleared (through
`log_clear_underwriting_credit()`), the earlier placements that stay, the
draft's own buckets before the effective date that are dropped, and any
awaiting-slot makegoods left open — then "Activate revision"
(`lib/underwriting/revisions.ts`, audited as
`underwriting.contract.revision_activated`) applies it. A revision changes
future demand, not historical truth: aired credits, broadcast events and
exceptions stay with the revision they happened under, and affidavits
read placements by contract and period across revisions unchanged. A
draft can be discarded; a draft's lines can be removed (a delete policy
scoped to draft revisions, `20260925170000`).

### 9.5 Acceptance corpus

`fixtures/insertion-orders.ts` now holds 27 orders — the first pass's
fifteen re-expressed, plus Fireman Termite (May 2026 IO), FDOH Escambia
(July 2026 IO), Phil Hall 2020-21, 2022-23 and 2024-25, the Symphony
2021-22, FPM/Atkins San Antonio Shoemakers (10/25–4/26), New South Window
Solutions (rev 3 + IO), Cultural Arts Alliance (April 2026), Wild Birds
Unlimited (Feb 2026), West Moss and International Paper (2026) — every
one read from the original on Drive. `demand-compiler.test.ts` checks each
of the brief's fifteen shapes against its stated totals (the known
document inconsistencies are asserted as review warnings, not resolved);
`inventory-selection.test.ts` covers the contested planner cases (New
South's two-a-day spread, FDOH's cap, Choral's distinct breaks, USF's
undersized break, adjacency by category id, preferred-time ranking,
makegoods first). FPL Q1 2022 was not located in Drive under that title;
the 2026 FPL grid on file already exercises the variable matrix with dark
weeks (#9), and San Antonio Shoemakers the alternating one (#10).

### 9.6 Shipped and verified

Three migrations, applied to preview and production on 2026-09-25 and
recorded in `APPLIED.md`: `20260925150000_underwriting_demand_buckets.sql`
(everything in §9.1 but categories; a clean rewrite — both projects held
zero contracts), `20260925160000_underwriting_industry_categories.sql`,
`20260925170000_underwriting_draft_line_delete.sql`. The DDL and helpers
were dry-run in a rolled-back transaction on preview first; after
applying, a rolled-back RLS-impersonated scenario exercised the rewritten
guard: a weekly-quota line with `max_per_day = 1` placed Monday, refused a
second Monday break (`day_cap_met`), placed Wednesday, refused a third in
the bucket (`bucket_quota_met`); an exact 7:06 line refused a 5:06 break
(`exact_time_mismatch`) and placed the 7:06 one; a slot line refused a
break without its key (`slot_key_mismatch`) and placed the keyed one; a
line under a draft revision was refused (`revision_not_current`).
`20260925180000_underwriting_opening_closing.sql` (both projects, same
day) then replaced the slot/traffic-key mechanism with derived opening/
closing positions; its own rolled-back scenario against a real four-hour
Morning Edition rundown on preview listed exactly one break for an
`opening` line (5:06) and one for a `closing` line (8:19), refused the
wrong positions (`not_opening_break`, `not_closing_break`) and placed the
right ones. `npm run lint`, `typecheck`, `test` (1,015 tests) and
`db:check` pass.

**Not yet exercised**: the TypeScript auto-fill and revision-activation
paths against a live session (sign-in is magic-link-only from a sandbox).
The SQL guard is what makes the first click safe.

**Open with WUWF** (brief §15, unchanged by this pass): the unit of FPM's
"separation: 3"; house rules for distribution inside a daypart when an
order says only "AM Drive"; the default same-day concentration for
high-frequency agency buys with no stated cap (the planner spreads
evenly); whether a revised order's future spots
should supersede automatically (today: previewed, then one explicit
click); whether affidavits must distinguish bonus credits; and whether
"Drive Time" (FDOH, International Paper) should be its own pool spanning
AM and PM Drive — seeded pools are AM Drive, PM Drive, Total Program
Rotation, Weekend Edition, Carpool, Mid-day, and a "Drive Time"/"Weekend
ROS" pool has to be created on `/underwriting/pools` before those lines
find inventory.

## 10. Third pass: fill order, frozen rundowns, bumping (2026-09-25)

Found by comparing the portal against RadioTraffic.com, WUWF's current
traffic system, read-only. Every line there carries a hand-set placement
priority (01 Highest – 10 Lowest, exact-time spots at 01) with a station
tie-break order; competitive separation is "By Avail, 1" for every category
(same break only — what §9's adjacency rule already enforces, so nothing
changed there); and logs are locked before air and reconciled afterward.
Four gaps against that, verified in the code first:

- `log_list_placeable_rundown_breaks()` already reported
  `remaining_seconds` as the break's window minus every item in it,
  credits and host content alike — occupied time was blocked. Correct.
- Every placed credit was treated as fixed: nothing distinguished one
  that could move from one that could not. The host's
  `log_relocate_underwriting_credit()` exists, but it is gated on Log
  access, stays inside one rundown, and skips the contractual checks.
- `runAutoFillOverLines()` filled lines in the order the query returned
  them (`start_date`, then creation) — not random, but with no regard for
  constraint, so an any-time line could take the one break an exact-time
  line needed and the latter then read "no inventory".
- The planner skipped days before today; the SQL guard checked nothing
  about a rundown's state, so a placement could land in a live rundown or
  an earlier-today break, and a manual placement anywhere at all.

### 10.1 Fill order

`lib/underwriting/fill-order.ts` (pure, tested). When more than one line
is filled in one run — a contract's lines, or every active line from the
dashboard — `orderLinesForFill()` sorts most-constrained first: exact /
opening / closing; window (narrower before wider); preferred; any. Within a
tier guaranteed goes before bonus, then the line with fewer open candidate
breaks (counted live from the listing, frozen and full breaks excluded),
then the order given. The constraint itself is the priority: no priority
levels, no rate-based ranking (most WUWF spots are $0), no schema.

### 10.2 Frozen rundowns

Automation — auto-fill, rundown provisioning, bumping — never adds, moves
or clears a credit in a rundown that is `in_progress` or `submitted`, nor
in a break whose start has passed. Host actions (fill, move, aired/missed,
relocate) and a traffic staffer's own manual placement or clear are not
automation and stay unrestricted. Enforced twice, in the twin pattern:

- SQL: `uw_automation_block(break, rundown)` returns `rundown_frozen`,
  `break_in_past` or null. `log_place_underwriting_credit()` and
  `log_clear_underwriting_credit()` gained `p_automated boolean default
  false` (the old signatures dropped, so a caller passing five or one
  arguments still resolves) and refuse with that code when it is true;
  `log_bump_underwriting_credit()` is always automation;
  `log_generate_rundown_for_underwriting()` refuses a date before
  `uw_station_today()` (`air_date_in_past`).
- TypeScript: `lib/underwriting/freeze.ts` (`automationBlockFor()`).
  `CandidateBreak` carries `scheduledAt` and `rundownStatus`,
  `SelectionDemand` carries `nowISO`, and `planInventorySelection()` drops
  a frozen or started break before planning. `placeCredit()` takes
  `automated`, and every auto-fill write passes it.

Deliberately not frozen: revision activation and cancel-from-a-date still
clear future placements through the manual path, since a human previews and
clicks them; if one of those placements sits in a live rundown the clear
goes through. Worth a decision if it ever bites.

### 10.3 Bumping

Movable = a `window`, `preferred` or `any` line's fresh placement with no
recorded broadcast event. Fixed = `exact`, `opening`, `closing`, any
makegood placement, anything with an outcome. When a fixed-position unit
finds every eligible break too full for its shortest approved copy,
`lib/underwriting/bump-plan.ts` (pure, tested) looks in those breaks for a
movable credit with another legal home in its own demand bucket — the
occupant's own listing, filtered to the same bucket, enough room, open to
automation, not already holding that contract, and no same-underwriter or
same-industry adjacency at the destination, plus the seat itself must not
land next to the constrained unit's own identity. It prefers moving bonus
over guaranteed, then the credit with the most alternatives; the
destination is the closest same-day break, else the earliest. One hop,
never a chain. Host content is never displaced (open policy question,
§10.5): a break full of promos or PSAs is reported as exactly that.

Execution (`auto-fill.ts`'s `bumpToSeat()`) runs after the ordinary plan
for a fixed-position line: `log_bump_underwriting_credit(placement,
destination)` clears and re-places inside one subtransaction, so the move
passes every check `log_place_underwriting_credit()` makes — bucket quota
(the cleared unit no longer counts), day cap, one per contract per break,
copy, duration, freeze on both ends — or nothing changes. Then the
constrained unit is placed in the room left. Each bump is audited as
`underwriting.credit.bumped` (the moved placement, from/to break, the line
seated). When no clean move exists, nothing moves and the unit is a named
`CapacityConflict` (`no_eligible_break`, `host_content_only`,
`no_movable_credit`, `no_legal_alternative`) in the auto-fill notice, and
the dashboard's conflict check (`conflicts.ts`, `capacity_conflict`) shows
the same condition without a run: a fixed-position line short in the next
two weeks whose candidate breaks are all too full or frozen.

The listing RPC now also returns each break's `rundown_status` and its
`items` (placement, line, contract, underwriter, category, time mode,
service level, makegood, bucket, has_outcome) so the planner can see who
could make room without a second boundary function.

### 10.4 Dashboard and approval trail

`/underwriting` now leads with a "Needs attention" strip: open exceptions,
makegoods pending agency approval, makegoods awaiting a slot, open units
still unscheduled, and capacity conflicts, each linking to where it is
worked. The rest of the page (auto-fill, counts, conflicts, exceptions) is
unchanged.

A contract records `created_by`; its first revision records
`activated_by`/`activated_at` (set to the creator at creation, since the
first revision is created current); a draft revision's activation records
the same and is audited. Flipping the contract itself from draft to active
was not audited — it is now (`underwriting.contract.activated`, transition
only, mirroring the termination audit). The same person may create and
activate; there is no second-person approval, and none was built.

### 10.5 Open

When a paid credit cannot fit because a break is full of host content,
may it displace that content? Until answered, host content is never
displaced and the conflict is reported. Out of scope, as before: automation
export to ENCO DAD and As-Play import, cross-break or minute-based
separation, per-line separation overrides, billing.

### 10.6 Shipped and verified

`20260925190000_underwriting_frozen_rundowns_and_bumping.sql`, dry-run in
a rolled-back transaction on preview, then applied; a rolled-back,
RLS-impersonated scenario on preview against real Morning Edition rundowns
then exercised the guard end to end — an automated placement refused by a
live rundown (`rundown_frozen`) and by a past break (`break_in_past`), a
manual placement into the live rundown allowed and its automated clear
refused, a 90-second any-time credit filling a 90-second avail, the exact
5:06 line refused there (`too_long`), the bump moving the any-time credit
to the next avail and the exact line seated in its place, and refusals for
a fixed credit (`credit_fixed`), a live destination, a destination in the
next bucket (`different_bucket`), the credit's own break, and a credit
with a recorded outcome (`already_aired`). Tests: tier ordering, the
freeze in the planner, a bump that seats an exact line, refused bumps (no
alternative, frozen, cross-bucket, adjacency, too little room), bonus
before guaranteed, host content named, and the dashboard's capacity
conflict. `npm run lint`, `typecheck`, `test` and `db:check` pass.

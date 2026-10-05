# Bookings — Product & Engineering Design

Status: **Milestone 1, slices 1–2 (the rate model; the term plan and calendar) built 2026-10-05; slices 3–6
designed, not started — see §9, §12 and §13.** Written 2026-10-05 from two
WUWF documents — _University Production Partnerships: capacity, cost
recovery and provisional rate framework_ (revised) and its companion
workbook, `WUWF_Production_Rate_Model_v0.1.xlsx` — and from a reviewed
Design canvas (fifteen artboards, three revisions) at
https://claude.ai/artifact/7XYXoBirnizaaSMsgko11b. The _OUR Voices_
prospectus (a proposed daily 60-second student-research feature) was used
as the stress test for the model in §2.6 and §8.

Read `docs/academic-partnerships-design.md` (the closest precedent for a
public, account-less inquiry form feeding a staff pipeline),
`docs/underwriting-traffic-redesign.md` §9–§10 (eligibility lines, demand
buckets, the placement guard — the airtime side of this tool reads from
them and never duplicates them), and `docs/ui-patterns.md` before touching
any of this. Where this document reuses a precedent rather than inventing
a new answer, it says so.

Every figure in this document is the workbook's v0.1 planning output, not
an approved rate. The capacity figures (100 project days, a 15% reserve)
are the pilot placeholders the framework itself says to replace with a
capacity study.

---

## 1. The problem we're solving

WUWF produces things for the university — Board of Trustees webcasts,
commencement, a coaches' show, field pieces for Marketing &
Communications, student documentary days — and has charged a customary
$500 per webcast for years without knowing what a webcast costs. The
framework replaces the custom with a model: a rate card derived from real
labor, asset and utilization inputs; a defined share of production
capacity the station contributes to university work; and a rule that
price determines what a partner reimburses while **capacity determines
whether WUWF accepts the work at all**. Payment never buys the right to
displace the station's own journalism and programming.

Today that model is a workbook and a Word document. Nothing tracks
requests, nothing checks a date against the reserve, nothing records what
was actually recovered, and nothing can answer the semester-end question
the framework poses: did this produce more student learning,
institutional value and earned-revenue discipline without weakening
public-service work?

This tool is the front door, the guardrail and the ledger for that pilot:
one request form, one calendar, one rate model with a validation gate, one
term report. It is deliberately **not** a general scheduler, an invoicing
system, or a second place to schedule airtime (§6.6).

## 2. Product model

```
Rate model version ─ assumptions, resource pools, service packages, a rate card
Term plan ─ net capacity, the reserve, resources and their windows, the airtime envelope
Partner ─ a UWF unit or an outside organization
└── Agreement (optional) ─ reserve share, funded hours, reserved blocks, deadlines
Project ─ one request, through five stages
├── Estimate lines, priced from facts
├── Bookings ─ resource windows and professional hours, tentative then confirmed
├── Airtime commitment ─ airings × length, honored in Traffic or On Air
├── Hours used ─ prefilled, confirmed
└── Settlement ─ a recharge or an invoice record Finance posts
```

### 2.1 Capacity is professional hours

The framework counts "project days" without defining one, and a studio
half-day, a field day and an edit hour cannot be added. The reserve is, by
the framework's own §4, the professional labor WUWF contributes, so:

**A project day is 8 professional production hours.** Net schedulable
capacity, the reserve, and every draw against them are kept in
professional hours and displayed in days. Each service package already
states its professional hours (a basic webcast is 5), so a package's draw
needs no conversion table. Studio half-days, field days, live days and
edit hours stay separate availability constraints on the calendar; they
are never summed into the guardrail.

At the workbook's placeholders: 100 days = 800 hours a term; the 15%
reserve = 120 hours.

### 2.2 Pricing is derived, never picked

The framework's four capacity pools (core WUWF, baseline institutional,
incremental institutional, open external) are a reporting view. No screen
asks the lead to choose a pool. A project is **priced as** one of three
treatments from facts already on it, and the estimate shows the reason:

| Fact                                                                                                               | Priced as                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| The partner is outside the university                                                                              | **external** — full cost, the 6.71% New Ventures assessment, a 25% contribution margin, floored at market     |
| Under an agreement                                                                                                 | the agreement's terms: its allocated reserve share first, then incremental                                    |
| Qualifies as strategic or applied-learning work **and** the reserve's unused balance covers its professional hours | **strategic internal** — student labor, resources and direct costs; professional labor is WUWF's contribution |
| Otherwise                                                                                                          | **incremental internal** — strategic components plus professional labor at the loaded rate                    |

"Qualifies" is a judgment the lead records and the executive confirms when
contested. The lead may change the derived treatment; a change that
touches the reserve needs the executive's sign-off and is audited.

### 2.3 Five stages

```
request → estimate → booked → delivered → settled
```

Sending an estimate places **tentative** holds on its dates (§6.4);
approving it confirms them, which is why there is no separate "scheduled"
stage. "Delivered" is the lead's click; "settled" is Finance posting the
recharge or invoice. Three dispositions — `deferred`, `declined`,
`withdrawn` — take a project out of the open list, keep the stage it
reached, free every booking, and require a reason. This is Academic
Partnerships' `stage` + `disposition` shape, with fewer stages.

### 2.4 What a request asks for

A request asks for **production**, **airtime**, or both. Production is the
packages (studio, webcast, field, editing — several on one request is
normal, one estimate line per package). Airtime is a commitment: airings
a week, length, dates, and whether it is contributed from the envelope or
paid. See §2.5.

### 2.5 Airtime is a second envelope, read and never placed

Units also ask WUWF to air things — a live read for finals-week library
hours, promos for a coaches' show, a daily feature. The framework prices
production capacity and says nothing about airtime, but the capacity is
real and, unlike the production placeholder, **knowable**: the clocks
define every local avail, and Traffic and On Air already place content
into them with their own guards, screens and proof of performance.

So the term plan carries an **airtime envelope**: how many minutes a week
of university-eligible avail time the station contributes. Eligible
avails are counted from the clocks' marked opportunities (those whose
`permitted_content_types` admit university or station messaging). A
request's commitment is checked against the envelope's remaining minutes
before the executive approves it, the same way a strategic request is
checked against the reserve hours.

The avail itself is scheduled elsewhere, and this tool only records where:

- a **message** (live read, recorded spot, announcement) is honored in
  Traffic — the unit is an underwriter row, the message is copy, the
  schedule line is `service_level = 'bonus'` when contributed (Traffic
  already defines a bonus line as never "behind" and never owed a
  makegood), and a paid line otherwise;
- a **recurring feature** is pinned on the clock in On Air when the
  program director decides the station has promised a slot, as Unearthing
  Florida is today.

This tool holds the commitment and a link, reads consumption back through
two narrow boundary functions (§6.5), and computes **foregone underwriting**
(contributed minutes at the pool's rate) for the term report. It never
writes into either tool. A "draft the Traffic contract" convenience may
come later; it is not part of the model.

### 2.6 How OUR Voices fits

A daily 60-second feature, ~250 episodes a year, host and scripts from the
Office of Undergraduate Research, WUWF recording, editing and airing. In
this model it is an **agreement** (a standing weekly studio block, a
reserve share, funded student hours, incremental beyond), with each
recording session a project producing several episodes, a bespoke
"episode" package with WUWF's actual hours, and an airtime commitment of
5 × 60 s a week. At 1.5 professional hours an episode the guardrail shows
the draw at once — roughly 375 hours, nearly half the placeholder
capacity — which is exactly what the framework wants surfaced before the
executive signs. Nothing about who funds what, who supplies the host, or
where episodes are reused is modeled here; those are the partner's side
of the work.

## 3. Primary user workflows

**A. Finance maintains the rate model.** Edit assumptions on a draft
version, each with a source link and a validation status; see the derived
figures and the rate card recompute; submit for UWF Budget / Controller
validation; the executive adopts. Adoption snapshots the rate card lines.

**B. The director sets the term plan.** Net professional hours, the
reserve share, each resource's units and windows, the contributed airtime
minutes, blackouts (a policy over a date range) and holds (WUWF's own use
of a window).

**C. A request arrives** — from `/book` (or its Grove embed) or typed
in by staff — and lands at stage `request`.

**D. The lead estimates.** Picks packages, adjusts hours and direct
expenses, sees the derived pricing and its reason, runs the capacity check
on every date (§6.4), sends the estimate. Dates are held tentatively for
14 days.

**E. The partner approves; the lead books.** Approval confirms the holds.
A reserved block under an agreement is attached to the project here.

**F. The lead delivers and confirms hours.** Used hours are prefilled from
the package and the bookings; "confirm as planned" is one click, or the
lead adjusts. Used figures feed the term report and the next rate model
version; they never reprice the estimate.

**G. Finance settles.** The settlement drafts itself from the approved
estimate plus direct expenses at actual cost: a recharge to the unit's
index, or an invoice record with the assessment for an external client.
Finance posts it and records the journal entry number.

**H. The executive approves agreements and exceptions.** An agreement
proposal shows its draw — reserve share, hours, airtime minutes, what it
crowds out — before signature. A booking-rule exception is a column on
the booking, with a reason, audited.

**I. Leadership reads the term report** at semester end and applies the
framework's decision rule.

## 4. Screens

Five tabs — Dashboard · Requests · Calendar · Partners · Rates — following `docs/ui-patterns.md`: list pages are a `ListToolbar`
over a table; create and edit are dedicated pages; right columns exist
only on detail pages.

| Route                                                  | Screen                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/bookings`                                            | **Dashboard** — the term's capacity bar (reserve used, reserve to preserve, incremental, external, held, open), the airtime envelope in one line, "Needs your action" filtered by the viewer's roles, this week, term-to-date tiles, a link to the term report                                               |
| `/bookings/report`                                     | The **term report** (under Dashboard): capacity by pool, utilization by resource vs. package assumptions, recovery by partner, foregone margins, airtime contributed, WUWF work delayed or displaced, the decision rule                                                                                      |
| `/bookings/requests`, `/[id]`                          | **Requests** list with stage chips; the **project page** — stage strip, estimate (priced-as strip with reason, lines, the capacity check as one line with "show the check", the legacy-rate delta), bookings, hours used, settlement, scope, activity; an aside with summary, opportunity cost, dispositions |
| `/bookings/intake`                                     | Intake form settings and the embed snippet (under Requests)                                                                                                                                                                                                                                                  |
| `/bookings/calendar`                                   | **Calendar** — week or month, one row per resource plus the production lead's hours lane; blocks for core WUWF, strategic, incremental, external, tentative, reserved, hold, blackout; "find a slot"; the term plan beneath it with the resource table and the airtime section                               |
| `/bookings/partners`, `/[id]`, `/[id]/agreements/[id]` | **Partners** list; a partner's page; an agreement's terms, reserved blocks with release status, consumption bars, projects under it                                                                                                                                                                          |
| `/bookings/rates`                                      | **Rates** — the rate model: version picker and adoption steps; chips for Assumptions · Resource pools · Service packages · Rate card · Assets · Change log                                                                                                                                                   |
| `/book`, `/book/embed`                                 | The **public request form** and its chrome-free embed variant                                                                                                                                                                                                                                                |

No rate appears on the public form. A partner sees a figure only on their
estimate.

## 5. Data model

All tables `bk_*`, RLS enabled, staff-only (§6.2). Columns below are the
load-bearing ones; the usual `id`, `created_at`, `created_by`,
`updated_at` are implied.

### Rate model (built in slice 1 — `20261005140000_bookings_foundation.sql`; the columns below are as shipped)

- **`bk_rate_model_versions`** — `label`, `status` (`draft` | `submitted` | `adopted` | `superseded`), `in_use` (exactly one version is in use for estimates — a partial unique index; separate from `adopted`, so the provisional v0.1 can price estimates before anyone adopts it), `destination_index` (where recoveries go, a Budget / Controller decision, recorded at adoption), `notes`, and `submitted_at/by`, `adopted_at/by`, `superseded_at`.
- **`bk_assumptions`** — `version_id`, `section` (`sourced` | `working`, the workbook's two blocks), `kind` (`shared_pool_line` | `webcast_pool_line` | `model_input`), `key` (one of `lib/bookings/rates.ts`'s `MODEL_INPUT_KEYS`, required for a model input and null for a budget line), `label`, `value numeric`, `unit`, `basis`, `source_url`, `notes`, `owner` (`finance` | `director` | `executive`), `validation_state` (`pending` | `validated` | `accepted_as_is` — a sourced budget line is seeded `validated` with "Current budget" as what validated it, so there is no separate `current_budget` state), `validation_needed` (the workbook's "Confirm with HR"), `validation_note`, `validated_at/by`, `sort_order`. The workbook's "Inputs & Assumptions" sheet, one row each. The two external labor planning rates ($25 and $65 an hour) are model inputs too, since the workbook types them.
- **`bk_resource_pools`** — `version_id`, `pool` (`bk_pool_key`: `studio` | `field` | `live` | `edit`), `allocation_share`, `available_units`, `unit_label`, `basis`, and the same `validation_*` columns as an assumption. Cost per unit is computed, never stored.
- **`bk_service_packages`** — `version_id`, `name`, `unit_label`, `professional_hours`, `student_hours`, `studio_units`, `field_units`, `live_units`, `edit_hours`, `webcast_ops_units`, `market_floor`, `historical_reference`, `application_note`, `notes`, `active`, `sort_order`. `agreement_id` (a bespoke package scoped to one agreement, e.g. an OUR Voices episode) arrives with `bk_agreements` in slice 5.
- **`bk_rate_card_lines`** — `version_id`, `kind` (`package` | `labor`), `package_id`, `line_key`, `name`, `unit_label`, `strategic_rate`, `incremental_rate`, `external_rate`, the three costs behind them, `market_floor`, `historical_reference`, `application_note`, `snapshotted_at`. A snapshot TypeScript writes when a version is **put in use or adopted** (and, for the version in use, on "Record for estimates" once its rows have moved), so an estimate keeps the rate it was priced at when a later version changes an input. A labor line carries its loaded internal cost in `incremental_rate`.
- **`bk_assets`** — `name`, `tag`, `pool`, `acquired_on`, `acquisition_cost`, `annual_cost` (a subscription), `funding` (`station` | `foundation_gift` | `grant_restricted` | `uwf`), `useful_life_years`, `restrictions`, `maintenance_burden` (`low` | `medium` | `high`), `condition` (`good` | `fair` | `worn` | `out_of_service`), `notes`, `active`. Unversioned; feeds a future version's pool allocation; Foundation and restricted-grant assets are never assumed to be prepaid institutional capacity.
- **`bk_rate_model_events`** — the Rates tab's change log (`version_id`, `actor_id`, `kind`, `note`, `metadata`), append-only.

Two guard triggers and two functions hold the lifecycle: `bk_guard_frozen_version()` refuses any write to the assumptions, pools or packages of an adopted or superseded version (a correction is a new version, copied from `/bookings/rates/versions/new`); `bk_guard_version_transition()` refuses to submit a version with anything still `pending` and refuses adoption or superseding unless `private.is_bookings_executive()`; `bk_set_version_in_use()` and `bk_adopt_version()` (security invoker) give the two lifecycle writes atomicity without widening RLS. SQL never computes a price.

### Capacity

- **`bk_term_plans`** — `label`, `starts_on`, `ends_on`, `net_professional_hours`, `reserve_share`, `airtime_contributed_minutes_per_week`, `status` (`draft` | `active` | `closed`).
- **`bk_term_resources`** — `plan_id`, `resource_key`, `available_units`, `unit_label`, `windows jsonb` (studio: `am` 08:00–12:00, `pm` 13:00–17:00, `full`, `evening`; field and live: `day`; edit: from–to), `lead_hours_per_day` (8).
- **`bk_blackouts`** — `plan_id`, `starts_on`, `ends_on`, `resource_keys text[]` (null = all), `reason`. A policy; no partner work; no exception below the executive.
- **`bk_holds`** — `resource_key`, `date`, `window_start`, `window_end`, `professional_hours`, `kind` (`core` | `maintenance`), `label`. WUWF's own use of one window. Entered by the director; nothing is pulled from On Air's broadcast schedule in milestone 1.

### Partners

- **`bk_partners`** — `name`, `kind` (`uwf_unit` | `external`), `contact_name`, `contact_email`, `contact_phone`, `default_funding_index`, `notes`.
- **`bk_agreements`** — `partner_id`, `label`, `starts_on`, `ends_on`, `status` (`draft` | `active` | `ended`), `reserve_hours_allocated`, `funded_student_hours`, `expected_volume` (text), `booking_deadline_days` (14), `release_deadline_days` (7), `blackout_notes`, `direct_cost_treatment`, `capital_notes`, `beyond_envelope_note`, `airtime_minutes_per_week`, `approved_by`, `approved_at`, `document_path` (the signed agreement, in a private `bookings-documents` bucket, as `uw_contracts.agreement_document_path` is).
- **`bk_reserved_blocks`** — `agreement_id`, `resource_key`, `date`, `window_start`, `window_end`, `project_id` (nullable until attached), `released_at`, `kept_by` (a director may keep an unbooked block past its deadline). A block past `date − release_deadline_days` with no project and no `kept_by` **reads as open at query time**; no scheduled job.

### Work

- **`bk_projects`** — `partner_id`, `agreement_id`, `title`, `description`, `requested` (`production` | `airtime` | `both`), `qualifies_strategic` (nullable boolean), `qualification_by`, `priced_as` (`strategic` | `incremental` | `external`), `pricing_reason`, `pricing_overridden_by`, `stage`, `disposition`, `disposition_reason`, `estimate_sent_at`, `estimate_expires_at`, `estimate_approved_at`, `rate_model_version_id`, `funding_index`, `event_starts_on`, `event_ends_on`, `deliverables_due_on`, `location`, `contact_*`, `source` (`public` | `staff`), `editorial_review` (`not_needed` | `needed` | `cleared`), `owner_id`, `delivered_at`, `legacy_rate_delta` (computed at estimate approval: modeled minus the $500 convention per webcast line), `margin_foregone` (set when an external project is declined for capacity: its estimate's margin).
- **`bk_estimate_lines`** — `project_id`, `package_id` (nullable for labor and direct-expense lines), `label`, `quantity`, `unit_rate`, `amount`, `professional_hours_draw`.
- **`bk_bookings`** — `project_id`, `resource_key`, `date`, `window_start`, `window_end`, `units`, `professional_hours`, `status` (`tentative` | `confirmed` | `released`), `expires_at` (tentative only), `exception_by`, `exception_reason`. One resource window on one date.
- **`bk_airtime_commitments`** — `project_id`, `airings_per_week`, `seconds`, `starts_on`, `ends_on`, `treatment` (`contributed` | `paid`), `honored_in` (`pending` | `traffic` | `on_air`), `external_ref` (a Traffic contract id or an On Air assignment id), `notes`.
- **`bk_hours_used`** — `project_id`, `measure` (`professional_hours` | `student_hours` | `studio_units` | `field_units` | `live_units` | `edit_hours`), `planned`, `used`, `confirmed_at`, `confirmed_by`.
- **`bk_settlements`** — `project_id`, `kind` (`recharge` | `invoice`), `amount`, `funding_index`, `assessment_amount`, `journal_entry_number`, `status` (`drafted` | `posted`), `posted_at`, `posted_by`.
- **`bk_project_events`** — `project_id`, `kind`, `actor_id`, `metadata jsonb`. The staff-visible timeline, as `ap_submission_events` is; privileged actions also log `audit_events`.

### Settings

- **`bk_settings`** — singleton (`id boolean primary key default true check (id)`, as `ap_settings`): `is_open`, `intro_copy`, `confirmation_copy`, `closed_copy`, `offered_packages text[]`.

## 6. Architecture

### 6.1 Access and roles

Registry key `bookings`, route `/bookings`,
`default_access = 'invite_only'`. A `tool_access` grant is the ticket in.
Roles **stack** on `tool_access.tool_roles`, so `bookings`
joins `STACKING_TOOLS` in `lib/tool-roles.ts` and the admin grant screen
shows checkboxes:

| Role        | May                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `lead`      | estimate, book, attach reserved blocks, confirm hours, mark delivered, record a declined external request's foregone margin |
| `director`  | the term plan, resources and windows, blackouts and holds, keep or release a reserved block                                 |
| `finance`   | assumptions and their validation, submit a version, post settlements                                                        |
| `executive` | adopt a rate card version, approve agreements, decide contested strategic pricing, record a booking-rule exception          |

A member with no role reads everything. Content & Audience leadership is
the `editorial_review` flag on a project, not a role; a feature hosted by
a university administrator is the case that makes it mandatory.
`private.has_bookings_access()` mirrors
`private.has_academic_partnerships_access()`; `private.has_tool_role()`
(from the broadcast roles) is the one role check.

### 6.2 RLS

Every `bk_*` table is staff-only, keyed off `has_bookings_access()`,
with role-gated `insert`/`update` policies where §6.1 says so — a term
plan is the director's, a rate model version Finance's. Writes that
§6.1 calls privileged (adopt, approve, exception, post) also get a
`before update` guard trigger in the shape of `rd_guard_post_curation()`,
so the boundary holds however the table is written. `audit_events` gains
an `audit_events_insert_bookings` policy for this tool's members, as
every other tool has.

### 6.3 The public surface

`/book` and `/book/embed`, outside `(portal)` and `(auth)`, in the
middleware's `PUBLIC_PATHS`, needing **no session at all** — the same
reasoning as `/partner`: one page load, one submit, nothing read back. Two
`security definer` functions are the whole surface: `bk_public_form_config()`
(read `bk_settings`) and `bk_submit_request(...)` (validates required
fields and the offered packages, applies the per-address-hash rate limit
`lib/academic-partnerships/rate-limit.ts` already implements, inserts the
project at stage `request`, source `public`). No participant-facing RLS
policy on any `bk_*` table, ever. The Grove snippet comes from a pure
`lib/bookings/embed.ts` in the shape of Audience Listening's; the embed
needs no microphone permission, so nothing in it is fragile.

### 6.4 The booking rule (scheduling)

`lib/bookings/scheduling.ts` is pure and tested; `bk_booking_allowed()`
is its SQL twin, run by a trigger on `bk_bookings`, so no writer slips
past it. For one date of a request, in this order:

1. **Blacked out, or a core WUWF hold?** Not available. Name it; offer the nearest open date on the same resource.
2. **Reserved for another partner and not yet released?** Not available until its release deadline.
3. **Window free, with tentative holds counted as taken?** Else propose the next open windows, nearest first.
4. **Room in the lead's day?** `8 − hours booked that day ≥ draw`. Else move prep or edit hours to a neighbouring day.
5. **Capacity for its pricing?** Strategic draws the reserve's unused balance. Incremental and external draw open capacity = net − booked − held − unused reserve. Core WUWF work is never checked; it reduces net.

A request with several dates is a series: every date runs the check and
the result lists the ones that fail, with alternatives, before anything
is held. Sending an estimate places **tentative** holds that expire with
the estimate (14 days); approval confirms them; expiry, decline or
withdrawal frees them. Tentative holds are taken as far as every other
request is concerned.

Two more rules, TypeScript only: the term plan spreads open capacity by
month, and a booking that would take more than half of a month's
remaining open capacity **warns, never blocks** (so January cannot
quietly sell April); and student hours are checked against the
agreement's funded hours and the term's OPS budget, not individual
timetables. Dates are the station's, Central time, through
`lib/log/timezone.ts`.

### 6.5 The airtime boundary

Two `security definer` **reads**, owned by this tool's migration the way
Traffic owns its Log boundary functions, in the shape of
`log_list_programs()`:

- `bk_university_avails_per_week(plan)` — counts the clocks' marked
  opportunities whose `permitted_content_types` admit institutional
  messaging across the plan's schedule, returning avails and minutes a
  week;
- `bk_institutional_airtime_honored(plan)` — the contributed and paid
  placements Traffic has scheduled and the pins On Air carries for the
  plan's commitments, by `external_ref`.

**No function here places an avail, pins content, or drafts a contract.**

### 6.6 Deliberately not built

Any placement of airtime (Traffic and On Air already have two schemes);
Banner or journal-entry integration (a settlement is a record Finance
posts by hand and numbers here); PDF invoices; a market-rate survey; a
general scheduler; episode or deliverable tracking (On Air's content
library and Sourcework exist); partner-side funding splits or labor
(the tool tracks WUWF's capacity and recovery only).

### 6.7 Pure modules

| Module                        | Tested against                                                                |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `lib/bookings/rates.ts`       | the v0.1 workbook as its fixture — every rate card figure must reproduce (§7) |
| `lib/bookings/pricing.ts`     | the derivation table in §2.2                                                  |
| `lib/bookings/scheduling.ts`  | §6.4, with the SQL twin kept in step                                          |
| `lib/bookings/capacity.ts`    | the envelope arithmetic, the month warning                                    |
| `lib/bookings/settlements.ts` | recharge vs. invoice, the assessment, the legacy delta                        |
| `lib/bookings/embed.ts`       | the snippet                                                                   |

## 7. The rate model, from the workbook

The workbook's five sheets become the rate model's tabs. The math, with
v0.1 values, which `rates.test.ts` must reproduce:

- Professional loaded hourly cost = salary × (1 + fringe) ÷ paid hours = 65,000 × 1.35 ÷ 2,080 = **$42.19**.
- Student / OPS loaded hourly cost = wage × (1 + payroll load) = 15.00 × 1.08 = **$16.20**.
- Shared production resource pool = the five budget lines = **$15,940** a year; split 35 / 25 / 30 / 10% across studio (120 half-days), field (80 days), live (60 days) and edit (400 hours) → $46.49, $49.81, $79.70, $3.99 a unit.
- Webcast operations = $6,500 ÷ 20 events = **$325** an event.
- Strategic cost of a package = student hours × $16.20 + resource units × their unit costs + webcast ops. Incremental cost = strategic + professional hours × $42.19. External = the higher of incremental ÷ (1 − 0.25 margin − 0.0671 assessment) and the market floor. Everything rounds **up** to the next $25 on the card.

| Service                      | Unit     | Strategic | Incremental | External |
| ---------------------------- | -------- | --------: | ----------: | -------: |
| Studio access                | half-day |      $100 |        $125 |     $250 |
| Studio access                | full day |      $150 |        $250 |     $450 |
| Basic event webcast          | event    |      $575 |        $800 |   $1,150 |
| Enhanced multicamera webcast | event    |    $1,025 |      $1,350 |   $1,975 |
| Field production             | half-day |      $175 |        $325 |     $500 |
| Field production             | full day |      $325 |        $650 |     $950 |
| Post-production / editing    | hour     |       $25 |         $50 |      $75 |

Pass-through: student / OPS labor $16.20 (external $25), professional
labor beyond the envelope $42.19 (external $65), direct expenses at cost
(external: plus the assessment). Institutional airtime beyond the
contributed envelope is priced per inventory pool by the Executive
Director and billed through a Traffic contract, not here (§10).

**Adoption gate.** A version can be submitted only when every assumption
and pool is `validated` or `accepted_as_is` with a note (enforced by
`bk_guard_version_transition()`, not just the screen); the executive
adopts; putting a version in use or adopting it snapshots
`bk_rate_card_lines`. Changing a value on a draft sends that row back to
`pending`. Until a version
is adopted the tool prices with the provisional one and labels every
figure "provisional", the workbook's own posture. A sensitivity list on
the assumptions screen (re-run the pure math with one input moved) shows
which validations change the card most: fringe load, net capacity,
student wage, webcast volume.

## 8. The term plan and the two envelopes

|                            | Production                                                                       | Airtime                                                            |
| -------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Net capacity               | professional hours, the director's number (placeholder until the capacity study) | university-eligible avail minutes a week, **read from the clocks** |
| The station's contribution | the reserve, 15% of net                                                          | the contributed envelope, the executive's minutes a week           |
| Spoken for                 | bookings, holds, reserved blocks                                                 | station pins, contributed commitments, Traffic's sales             |
| Sellable                   | open capacity, with the unused reserve preserved                                 | the remainder, Traffic's to sell                                   |
| Placed by                  | this tool's calendar                                                             | Traffic or On Air                                                  |
| Opportunity cost           | foregone external margin (a declined external project's estimate margin)         | foregone underwriting (contributed minutes at the pool's rate)     |

The parallel holds at the capacity layer and stops there. The production
calendar exists because nothing else schedules studios and people; the
airtime calendar exists already, twice, and this tool only reads it.

## 9. Milestone 1 in slices

Built in order, one migration each, every migration applied to both
Supabase projects and recorded in `APPLIED.md` before the next slice:

1. **Rate model** — versions, assumptions, pools, packages, the snapshot card, assets; the Rates tab. Replaces the workbook; nothing else can be priced without it. **Built 2026-10-05 (§12).**
2. **Term plan and calendar** — resources and windows, blackouts, holds, bookings, the guardrail, the airtime envelope and its two boundary reads; the Calendar tab. **Built 2026-10-05 (§13); the second boundary read moved to slice 3, which has the commitments it reads for.**
3. **Projects** — five stages, derived pricing, estimate with the capacity check, tentative holds, bookings, airtime commitments; Requests and the project page; the dashboard's action list.
4. **Public intake** — `/book`, `/book/embed`, the two functions, `bk_settings`, the settings page.
5. **Partners and agreements** — reserved blocks, deadlines, release-at-read, the proposal preview.
6. **Hours, settlement, the term report** — and Resources content (a release note and guides per screen, per the "Resources stay in step" rule).

Capabilities for the in-portal agent (`lib/bookings/capabilities.ts`)
follow after milestone 1, as every other tool's did: a read-only capacity
check first.

## 10. Open policy questions, not schema

- The **capacity study**: replace the 100-day placeholder; confirm 8 professional hours as the project day with the Director of Operations.
- The **14-day tentative hold** and the **month-level warning** thresholds.
- The **per-pool rate for paid institutional airtime**, set by the Executive Director, and whether any university messaging should be paid rather than contributed.
- Whether an **airtime-only request** should enter through this tool at all or go straight to Traffic. This design says enter here, because the envelope is what makes the first question answerable.
- The **editorial gate** for a university-hosted feature: who clears it, and whether such a feature is WUWF programming (core work, never recharged) or a production service.
- Where **recoveries are deposited** and the allowable treatment of professional labor, fringe, and Foundation- or grant-funded assets — UWF Budget / Controller, recorded on the adopted version.

## 11. Decision rule at semester end

From the framework, restated so the term report can be read against it:
keep the model only if it produces more student learning, institutional
value and earned-revenue discipline without weakening WUWF's
public-service work. Reset the rates, the capacity envelope and the
partner agreements from the evidence the report holds — not from the
historic $500 convention or from hypothetical demand.

## 12. What slice 1 shipped (2026-10-05)

- `20261005140000_bookings_foundation.sql`: the seven rate-model tables in
  §5, the five `private.*` predicates (`has_bookings_access`,
  `is_bookings_lead/director/finance/executive`), the two guard triggers,
  the two lifecycle functions, RLS (reads for every member; the rate model's
  writes for finance, with the executive admitted to versions and the card
  snapshot; assets for finance or the director; the change log appended by
  any member about their own act), the `audit_events_insert_bookings`
  policy, the registry row (`bookings`, `/bookings`, invite_only, sort 11),
  and v0.1 seeded row for row from the workbook — in use, not adopted.
- `20261005140100_resources_bookings_rate_model.sql`: the release note and
  two guides (`bookings-rate-model`, `bookings-asset-inventory`), with the
  screen keys `bookings.rates` and `bookings.assets` in
  `lib/resources/screens.ts`.
- `lib/bookings/`: `rates.ts` (+ test, the workbook as fixture: every cost
  and card figure in §7 reproduces), `version-card.ts` (rows → card, the
  snapshot shape, staleness), `roles.ts` (+ test), `access.ts`,
  `queries.ts`, `rate-card-snapshot.ts`, `events.ts`, `labels.ts`,
  `paths.ts`. `bookings` is a stacking tool in `lib/tool-roles.ts`.
- `src/app/(portal)/bookings/`: the layout and tab row (Rates alone for
  now), `/bookings` redirecting to `/bookings/rates` until the dashboard
  exists, and the Rates section's six views under a second-level tab row —
  Assumptions (edit in place by `?edit=`, add by `?new=1`, validate per row,
  the derived metrics, the adoption gate, sensitivity), Resource pools,
  Service packages (retire, never delete), Rate card (print, and "Record
  for estimates" when the snapshot is missing or stale), Assets (list,
  `/new`, `/[id]/edit`), Change log — plus `/versions/new`. The version is
  chosen with query-string chips, and every lifecycle action (submit,
  reopen, use for estimates, adopt with the destination index) is a form on
  the header, shown by role.

Verified: the full suite (1,792 tests), lint, typecheck, `db:check`; both
migrations applied to both Supabase projects and the v0.1 seed checked in
each. Not yet verified: a browser click-through — sign-in from this
sandbox is magic-link-only — so the first real validation click is the
first end-to-end test of the lifecycle forms.

## 13. What slice 2 shipped (2026-10-05)

- `20261005150000_bookings_term_plan.sql`: `bk_term_plans` (one active at a
  time, partial unique index; `lead_hours_per_day` lives here rather than on
  each resource, since it is one figure for the lead, not one per pool),
  `bk_term_resources` (pool, units, `windows` jsonb — `lib/bookings/
scheduling.ts`'s `parseWindows()` is the reader, `DEFAULT_WINDOWS` the
  seed every new plan gets), `bk_blackouts`, `bk_holds` (a null pool holds
  only the lead's hours), `bk_bookings` (`project_id` a bare uuid until slice
  3 adds `bk_projects`; `released_at`; `exception_by`/`exception_reason`
  both or neither). `bk_booking_allowed()` is §6.4 as a before trigger —
  steps 1, 3, 4 and 5; step 2 waits for agreements — and skips re-checking
  an update that leaves the booking in place, so confirming an estimate's
  hold cannot be refused by a later hold. Releasing frees the window; an
  exception is the executive's and audited. `bk_university_avails_per_week()`
  is the first §6.5 read: for every recurring schedule entry on the plan's
  reference date (today inside the term, else its first day), the clock
  version then in effect, its active opportunities that permit a
  `university_announcement`, repeated per hour of the block and per weekday,
  with the pinned content's minutes. `bk_institutional_airtime_honored()`
  keys off a project's airtime commitments and ships with them in slice 3.
  RLS: reads for members; plan, resources, blackouts and holds the
  director's; bookings the lead's, the director's or the executive's.
- `20261005150100_resources_bookings_calendar.sql`: the release note and
  the `bookings-calendar` guide (screen key `bookings.calendar`).
- `lib/bookings/scheduling.ts` (+ test): the rule (`checkBooking`,
  refusal reasons and the nearest open windows on the same resource), the
  envelope arithmetic (`capacitySummary`), the lead's day, the month spread
  and the half-a-month warning (`monthlyCapacity`, `monthShareWarning`),
  windows and the 14-day tentative expiry. `lib/bookings/airtime.ts` (+
  test): the boundary payload parsed and netted — eligible − pins −
  contributed = Traffic's to sell.
- `src/app/(portal)/bookings/calendar/`: the Calendar tab — the two
  envelope panels, a week grid (one row per pool plus the lead's day) or a
  month grid, a pool filter, "Find a slot" (a GET form running the rule
  without writing), inline create cards for a blackout, a hold and a
  booking (`?new=`), and the range's items with confirm/release/remove —
  and `calendar/plan/`, the director's term plan form, status (draft →
  active → closed), and per-pool resources with windows one per line.

Verified: 1,821 tests, lint, typecheck, `db:check`; both migrations applied
to both Supabase projects, and a rolled-back scenario on preview as a
lead/director exercised every refusal in the trigger (blackout, hold,
window taken, lead's day, reserve, no resource), confirm-then-release
freeing the window, and the airtime read against the real seeded clocks.
Not yet verified: a browser click-through, for the same magic-link reason
as slice 1. Open: the per-pool concurrency question — a window is one
booking per pool at a time, which is right for the studio and the edit
suite and may be wrong for a field pool with more than one kit.

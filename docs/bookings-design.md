# Bookings — Product & Engineering Design

Status: **Milestone 1 complete — slice 6 (settlement at actual cost, §21) built 2026-10-07; slices 1–5 built — the rate model (slice 1), the term plan and
calendar (slice 2, rebuilt the same day as slice 2b, labor classes and pools as data — §14),
projects (slice 3, 2026-10-06 — §15), the public intake (slice 4, 2026-10-06 — §16), and
partners and agreements (slice 5, 2026-10-06 — §17); the refinement pass (§18–§20) and
settlement (§21) followed — see §9.** **§22 reviews
the reserve's denominator and the term-plan container.** Written 2026-10-05 from two
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

At the workbook's placeholders: 100 days a year = 800 hours a year (a term
takes its share of that); the 15% reserve = 120 hours a year. See §22.2.

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

### Rate model (built in slice 1, rebuilt in slice 2b — `20261005160000_bookings_labor_and_pools.sql`; the columns below are as shipped)

Two unversioned catalogs name what the model prices; the figures for each are versioned.

- **`bk_labor_classes`** — `key`, `name`, `pay_basis` (`salaried` | `hourly`), `charged_in_strategic` (whether this class's hours are charged in a strategic price — students yes, professionals no; data, not doctrine), `sort_order`, `active`. A class of labor: the production lead, student/OPS crew, later a second producer or an engineer. Retired with `active`, never deleted.
- **`bk_pools`** — `key`, `name`, `unit_label`, `costing` (`allocated`: a share of the shared production pool | `own_lines`: its own budget lines), `default_windows jsonb` (what a new term plan's resource for this pool starts with), `sort_order`, `active`. Webcasting is an own-lines pool whose unit is an event, not a special case.
- **`bk_rate_model_versions`** — `label`, `status` (`draft` | `submitted` | `adopted` | `superseded`), `in_use` (exactly one version is in use for estimates — a partial unique index; separate from `adopted`, so the provisional v0.1 can price estimates before anyone adopts it), `destination_index` (where recoveries go, a Budget / Controller decision, recorded at adoption), `notes`, and `submitted_at/by`, `adopted_at/by`, `superseded_at`.
- **`bk_assumptions`** — `version_id`, `section` (`sourced` | `working`), `kind` (`pool_line` | `model_input`), `pool_id` (a pool line's own-lines pool; null means the shared production pool), `key` (a model input's `external_margin_share` or `assessment_share` — `lib/bookings/rates.ts`'s `MODEL_INPUT_KEYS`), `label`, `value numeric`, `unit`, `basis`, `source_url`, `notes`, `owner` (`finance` | `director` | `executive`), `validation_state` (`pending` | `validated` | `accepted_as_is` — a sourced budget line is seeded `validated` with "Current budget" as what validated it), `validation_needed`, `validation_note`, `validated_at/by`, `sort_order`. Budget lines and the two inputs the math reads directly; everything about a person or a pool moved to the two tables below.
- **`bk_labor_rates`** — `version_id`, `labor_class_id`, `annual_salary` + `paid_hours` (salaried) or `hourly_wage` (hourly), `load_share`, `external_rate` (the planning rate an external estimate charges for this class), `basis`, and the same `validation_*` columns. One row per class per version; the loaded hourly cost is computed, never stored.
- **`bk_resource_pools`** — `version_id`, `pool_id`, `allocation_share` (allocated pools only), `available_units` (the pool's **practical capacity**, §20.1), `units_basis`, `capital_annual`/`maintenance_annual`/`asset_basis` (§20.3), `basis`, `validation_*`. Cost per unit is computed, never stored.
- **`bk_service_packages`** — `version_id`, `name`, `unit_label`, `market_floor`, `historical_reference`, `application_note`, `notes`, `active`, `sort_order`, with its parts in **`bk_package_labor`** (`package_id`, `labor_class_id`, `hours`) and **`bk_package_resources`** (`package_id`, `pool_id`, `units`). `agreement_id` (a bespoke package scoped to one agreement, e.g. an OUR Voices episode) arrives with `bk_agreements` in slice 5.
- **`bk_rate_card_lines`** — `version_id`, `kind` (`package` | `labor`), `package_id`, `labor_class_id`, `line_key`, `name`, `unit_label`, `strategic_rate`, `incremental_rate`, `external_rate`, the three costs behind them, `market_floor`, `historical_reference`, `application_note`, `snapshotted_at`. A snapshot TypeScript writes when a version is **put in use or adopted** (and, for the version in use, on "Record for estimates" once its rows have moved), so an estimate keeps the rate it was priced at when a later version changes an input. A labor line carries its loaded internal cost in `incremental_rate`.
- **`bk_assets`** — `name`, `tag`, `pool_id`, `acquired_on`, `acquisition_cost`, `annual_cost` (a subscription), `funding` (`station` | `foundation_gift` | `grant_restricted` | `uwf`), `useful_life_years`, `restrictions`, `maintenance_burden` (`low` | `medium` | `high`), `condition` (`good` | `fair` | `worn` | `out_of_service`), `notes`, `active`. Unversioned; feeds a future version's pool allocation; Foundation and restricted-grant assets are never assumed to be prepaid institutional capacity.
- **`bk_rate_model_events`** — the Rates tab's change log (`version_id`, `actor_id`, `kind`, `note`, `metadata`), append-only.

Two guard triggers and three functions hold the lifecycle: `bk_guard_frozen_version()` refuses any write to the assumptions, labor rates, pools or packages (and their parts) of an adopted or superseded version (a correction is a new version, copied from `/bookings/rates/versions/new`); `bk_guard_version_transition()` refuses to submit a version with anything still `pending` and refuses adoption or superseding unless `private.is_bookings_executive()`; `bk_set_version_in_use()`, `bk_adopt_version()` and `bk_save_package()` (a package and its parts in one transaction; all security invoker) give the lifecycle and package writes atomicity without widening RLS. SQL never computes a price.

### Capacity

- **`bk_term_plans`** — `label`, `starts_on`, `ends_on`, `airtime_contributed_minutes_per_week`, `status` (`draft` | `active` | `closed`), `notes`. Several plans may be active if their dates do not overlap; a date books against the active plan containing it; a closed plan is final (§22.3).
- **`bk_term_capacity`** — `plan_id`, `labor_class_id`, `net_hours` (the hours the class has available for production work that term, with undated core work already left out — dated holds come off it), `reserve_share` (the class's reserve as a share of those hours, or null for none, §22.2), `headcount`, `hours_per_person_day`. One row per tracked class; a class with no row is not capacity-checked that term. The rate model no longer carries a copy of capacity — the term plan is the one place.
- **`bk_term_resources`** — `plan_id`, `pool_id`, `available_units`, `concurrent_units` (how many bookings one window on this pool takes at once — two field kits, one studio), `windows jsonb` (`parseWindows()` in `lib/bookings/scheduling.ts`; a new plan starts from each active pool's `default_windows`).
- **`bk_blackouts`** — `plan_id`, `starts_on`, `ends_on`, `pool_ids uuid[]` (null = all), `reason`. A policy; no partner work; no exception below the executive.
- **`bk_holds`** — `plan_id`, `pool_id` (null holds only hours), `date`, `window_start`, `window_end`, `kind` (`core` | `maintenance`), `label`, with hours per class in **`bk_hold_labor`** (`hold_id`, `labor_class_id`, `hours`). WUWF's own use of one window. Entered by the director; nothing is pulled from On Air's broadcast schedule in milestone 1.

### Partners

- **`bk_partners`** — `name`, `kind` (`uwf_unit` | `external`), `contact_name`, `contact_email`, `contact_phone`, `default_funding_index`, `notes`.
- **`bk_agreements`** — `partner_id`, `label`, `starts_on`, `ends_on`, `status` (`draft` | `active` | `ended`), `reserve_hours_allocated`, `funded_student_hours`, `expected_volume` (text), `booking_deadline_days` (14), `release_deadline_days` (7), `blackout_notes`, `direct_cost_treatment`, `capital_notes`, `beyond_envelope_note`, `airtime_minutes_per_week`, `approved_by`, `approved_at`, `document_path` (the signed agreement, in a private `bookings-documents` bucket, as `uw_contracts.agreement_document_path` is).
- **`bk_reserved_blocks`** — `agreement_id`, `pool_id` (was `resource_key` before slice 2b made pools data), `date`, `window_start`, `window_end`, `project_id` and `booking_id` (nullable until attached — the booking `bk_attach_reserved_block()` wrote), `released_at`, `kept_by`/`kept_at` (a director may keep an unbooked block past its deadline). A block past `date − release_deadline_days` with no project and no `kept_by` **reads as open at query time** (`bk_reserved_block_reserves()`); no scheduled job.

### Work

- **`bk_projects`** — `partner_id`, `agreement_id`, `title`, `description`, `requested` (`production` | `airtime` | `both`), `qualifies_strategic` (nullable boolean), `qualification_by`, `priced_as` (`strategic` | `incremental` | `external`), `pricing_reason`, `pricing_overridden_by`, `stage`, `disposition`, `disposition_reason`, `estimate_sent_at`, `estimate_expires_at`, `estimate_approved_at`, `rate_model_version_id`, `funding_index`, `event_starts_on`, `event_ends_on`, `deliverables_due_on`, `location`, `contact_*`, `source` (`public` | `staff`), `editorial_review` (`not_needed` | `needed` | `cleared`), `owner_id`, `delivered_at`, `legacy_rate_delta` (computed at estimate approval: modeled minus the $500 convention per webcast line), `margin_foregone` (set when an external project is declined for capacity: its estimate's margin).
- **`bk_estimate_lines`** — `project_id`, `package_id` (nullable for labor and direct-expense lines), `label`, `quantity`, `unit_rate`, `amount`, `professional_hours_draw`.
- **`bk_bookings`** — `plan_id`, `project_id`, `pool_id`, `date`, `window_start`, `window_end`, `units`, `treatment` (`strategic` | `incremental` | `external`), `status` (`tentative` | `confirmed` | `released`), `expires_at` (tentative only), `released_at`, `label`, `notes`, `exception_by`, `exception_reason`, with hours per class in **`bk_booking_labor`** (`booking_id`, `labor_class_id`, `hours`). One resource window on one date, taking one of the window's `concurrent_units`.
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

| Role         | May                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `production` | estimate, book, attach reserved blocks, confirm hours, mark delivered, record a declined external request's foregone margin — anyone on the production staff, not one position (slice 2b renamed it from `lead`) |
| `director`   | the term plan, resources and windows, blackouts and holds, keep or release a reserved block                                                                                                                      |
| `finance`    | assumptions and their validation, submit a version, post settlements                                                                                                                                             |
| `executive`  | adopt a rate card version, approve agreements, decide contested strategic pricing, record a booking-rule exception                                                                                               |

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
(the pool checks, a before trigger on `bk_bookings`) and
`bk_check_booking_labor()` (the per-class checks, run from a trigger on
`bk_booking_labor` and again on an update of the booking) are its SQL
twins, so no writer slips past it; `bk_create_booking()` and
`bk_create_hold()` write a parent and its hours in one transaction so a
refusal of any part rolls the whole booking back. For one date of a
request, in this order:

1. **Blacked out, or a core WUWF hold?** Not available. Name it; offer the nearest open date on the same resource.
2. **Reserved for another partner and not yet released?** Not available until its release deadline.
3. **Window free, with tentative holds counted as taken?** A window is taken once holds plus live bookings reach the resource's `concurrent_units`. Else propose the next open windows, nearest first.
4. **Room in each class's day?** For every class the booking draws on: `headcount × hours_per_person_day − hours booked that day ≥ draw`. Else move prep or edit hours to a neighbouring day.
5. **Capacity for its pricing, per class?** Strategic draws the reserve's unused balance, for a class that has a reserve share; a class with none counts every booking against open capacity. Incremental and external draw open capacity = net − booked − held − unused reserve. Undated core WUWF work is never checked; the director leaves it out of net, and dated holds come off it. A class with no `bk_term_capacity` row that term is not checked.

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
| `lib/bookings/scheduling.ts`  | §6.4, with the two SQL twins kept in step                                     |
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
   - **2b. Labor classes and pools as data** — a sanity check before slice 3 found slices 1 and 2 had fixed one professional and four pools into the schema; rebuilt the same day as a clean rewrite (§14). Not in the original plan.
3. **Projects** — five stages, derived pricing, estimate with the capacity check, tentative holds, bookings, airtime commitments; Requests and the project page; the dashboard's action list. **Built 2026-10-06 (§15), with `bk_partners` brought forward from slice 5 because every project names one.**
4. **Public intake** — `/book`, `/book/embed`, the two functions, `bk_settings`, the settings page. **Built 2026-10-06 (§16).**
5. **Partners and agreements** — reserved blocks, deadlines, release-at-read, the proposal preview. **Built 2026-10-06 (§17).**
6. **Hours, settlement, the term report** — **built: the report and hours confirmation in the refinement pass (§19.3, §20.8), settlement at actual cost 2026-10-07 (§21).** And Resources content (a release note and guides per screen, per the "Resources stay in step" rule).

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
as slice 1. The per-pool concurrency question this slice left open (a
window was one booking per pool at a time, right for the studio and wrong
for a field pool with two kits) is closed by slice 2b's `concurrent_units`
(§14).

## 14. What slice 2b shipped (2026-10-05) — labor classes and pools as data

A sanity check before slice 3 asked whether the model could price more
than one staffer's time. It couldn't, and the same inspection found four
more things slices 1 and 2 had built faithfully from this document that
were poorly conceived as schema. Both projects held only the seeded v0.1
rate model — no grants, no assets, no term plan, no booking — so
`20261005160000_bookings_labor_and_pools.sql` is a clean rewrite (every
`bk_*` table dropped and recreated), the same call `20260925150000` made
for Traffic, rather than a patch. §5 above describes the shipped shape;
this section records what changed and why.

1. **One professional → labor classes.** The rate model had one salary,
   one load, one paid-hours figure and one external rate, as named
   assumption keys; the term plan had one `net_professional_hours` and
   one `lead_hours_per_day`; every package had `professional_hours` and
   `student_hours` columns. Now `bk_labor_classes` is a catalog (seeded:
   `production_lead`, salaried, not charged in strategic; `student`,
   hourly, charged in strategic), `bk_labor_rates` carries each class's
   figures per version, a package's hours are rows in `bk_package_labor`,
   the term's capacity is per class in `bk_term_capacity`, and a booking's
   or hold's hours are rows in `bk_booking_labor`/`bk_hold_labor`. Adding
   a second producer or an engineer is a catalog row and a rate row, no
   migration. `rates.ts`'s math generalizes without changing a figure:
   salaried loaded hourly = salary × (1 + load) ÷ paid hours; hourly =
   wage × (1 + load); strategic cost = resources + the hours of classes
   with `charged_in_strategic`; incremental adds the rest. The v0.1
   workbook still reproduces exactly.
2. **Four pools in an enum → `bk_pools`.** `bk_pool_key` (`studio` |
   `field` | `live` | `edit`) is gone, and with it one fixed unit column
   per pool on `bk_service_packages` (`bk_package_resources` replaces
   them), the `resource_key` text on resources, holds, bookings and
   blackouts (`pool_id`/`pool_ids` now), and the `pool` enum on assets.
   A pool carries its own `unit_label` and `default_windows`; the
   `/bookings/rates/setup` page creates one.
3. **Webcasting as a special case → an own-lines pool.** The workbook
   costs webcasting from its own budget lines (software, encoder,
   captioning) divided by its events, which slice 1 modeled as a separate
   assumption kind (`webcast_pool_line`), a separate volume input and a
   separate package column. `bk_pools.costing` says `allocated` (a share
   of the shared production pool) or `own_lines` (its own
   `bk_assumptions` rows, `pool_id` set); a `webcast` pool with
   `own_lines` costing and `available_units` = events is the same math
   with nothing special-cased.
4. **Capacity in two places → one.** `net_capacity_days` and
   `baseline_share` were model inputs that duplicated the term plan's
   `net_professional_hours`/`reserve_share` and were read by nothing a
   rate depends on. Gone from the rate model; the term plan is the one
   place.
5. **One booking per pool per window → `concurrent_units`.** A term
   resource says how many bookings a window takes at once; the rule
   counts holds plus live bookings against it.
6. **`lead` → `production`.** The role named one position; it now names
   the production staff. `private.is_bookings_production()`,
   `isProduction`, `assertBookingsScheduler()`.

The booking rule's substance is unchanged (§6.4) but it now runs in two
triggers — the pool checks on `bk_bookings`, the per-class day and
capacity checks on `bk_booking_labor` — with `bk_create_booking()` and
`bk_create_hold()` writing a parent and its hours in one transaction so a
refusal of any part rolls back the whole booking; an update of a booking
re-runs the labor checks for each of its classes. `bk_save_package()` does
the same for a package and its parts. Screens: the Rates tab gained
**Labor** (`/bookings/rates/labor`, a class's figures per version) and
**Setup** (`/bookings/rates/setup`, the two catalogs); Pools, Packages,
Rate card and Assets read the catalogs; the term plan page has a
capacity-by-class table and `concurrent_units` per resource; the
Calendar's hold, booking and Find-a-slot forms take hours per class, and
the week grid shows one day row per class.

Verified: lint, typecheck, 1,836 tests (the workbook fixture still
reproduces under the generalized model; `scheduling.test.ts` covers
per-class capacity and concurrent units); the migration run end to end
against a local PostgreSQL 16 built from preview's definitions of
everything it references, which caught a short VALUES row in the seed;
both migrations applied to both Supabase projects on 2026-10-06 (through
the SQL editor — the MCP apply path holds every `drop` for a confirmation
that never reached the session); and a rolled-back scenario on preview, as
a production/director member and an executive, exercising every refusal in
the rule (blackout, a taken window at 1 of 1 and 2 of 2 concurrent units, a
class's day, the reserve, open capacity, a hold, a non-executive
exception), release-then-rebook, confirm-in-place after a later hold, and
the version lifecycle (pending rows block submit, finance cannot adopt, an
adopted version is frozen). Not yet verified: a browser click-through, for
the same magic-link reason as slices 1 and 2.

## 15. What slice 3 shipped (2026-10-06) — projects

- `20261006120000_bookings_projects.sql`: `bk_partners` (brought forward
  from slice 5 — every project names a partner and the derivation reads its
  kind; the Partners tab and `bk_agreements` still arrive in slice 5, and so
  does `bk_projects.agreement_id`), `bk_projects` (§5 "Work", without
  `agreement_id`), `bk_estimate_lines`, `bk_airtime_commitments`,
  `bk_project_events`, and `bk_bookings.project_id` as a real foreign key.
  Three security-invoker functions give the lifecycle its atomicity:
  `bk_send_estimate()` (every planned date → a tentative hold until the
  expiry, all or none, since a date the rule refuses raises and rolls the
  whole send back), `bk_approve_estimate()` (holds → confirmed, stage →
  booked, the legacy-rate delta TypeScript computed), and
  `bk_set_project_disposition()` (holds released, the stage reached kept).
  `bk_guard_project()` (before update) keeps `settled` for finance and a
  pricing override onto the reserve for the executive — the
  `rd_guard_post_curation()` shape. `bk_institutional_airtime_honored()` is
  the second §6.5 read: per commitment with an `external_ref`, what Traffic
  has scheduled in the term (placements and seconds, through
  `uw_contracts` → `uw_contract_schedule_lines` → `uw_scheduled_placements`)
  or what On Air pins (the assignment's content and its airings a week on
  the plan's reference date), or `found: false`.
- `20261006120100_resources_bookings_projects.sql`: the release note and
  two guides (`bookings-requests`, `bookings-dashboard`; screen keys
  `bookings.dashboard`, `bookings.requests`, `bookings.project`).
- `lib/bookings/projects.ts` (+ test): stages, dispositions, labels, the
  estimate's state (none / sent with days left / expired / approved), the
  stage actions a project offers, the request form's validation, and the
  dashboard's action list by role. `lib/bookings/pricing.ts` (+ test):
  §2.2's derivation (`derivePricing`), the reserve check
  (`reserveCoversDraw`), a line's rate from the card snapshot by treatment
  (`priceLine` — a baseline-funded class's hours are zero when strategic; an
  expense is at cost, plus the assessment when external), totals, the
  $500-a-webcast delta, and an external estimate's margin.
  `lib/bookings/airtime.ts` gained commitments, the envelope check and the
  honored read's parser. `lib/bookings/estimate.ts` (server-only) is the
  glue: `repriceProject()` re-derives the treatment (unless overridden) and
  writes every line's rate after any write that can change either.
- `src/app/(portal)/bookings/`: the Dashboard (`/bookings`, replacing the
  redirect — the capacity bar, the airtime envelope in one line, Needs your
  action, This week, the stage tiles), Requests (`/bookings/requests`,
  paginated with stage chips and search; `/new` and `/[id]/edit` share
  `request-form.tsx`), and the project page (`/bookings/requests/[id]`): the
  stage strip, the estimate (priced-as strip with reason, the pricing
  control, lines, add-line card by kind), the dates with the capacity check
  as one line and "show the check", airtime commitments with the envelope
  check and what Traffic/On Air actually carry, notes and activity; an
  aside with the stage actions, the Scope summary, the owner and the
  dispositions.

Four decisions worth recording:

1. **A project's date before its estimate is sent is a `planned` booking.**
   `bk_booking_status` gained `planned`: not live, takes no window and no
   capacity, not checked when written (the screen runs the rule for it and
   shows the refusal and alternatives), deletable. Sending flips planned →
   tentative and the triggers check every date for real. The alternative —
   a separate planned-dates table — would have duplicated the booking's
   shape and the calendar's reads for one state. `bk_booking_allowed()` now
   skips the re-check only when the booking **was live** and stays in
   place, so an expired tentative hold is checked again when re-sent or
   confirmed; slice 2's "not released and unchanged" skip would have revived
   a lapsed hold onto a window someone else had since taken.
2. **An estimate line snapshots its package's parts.** `labor_hours` and
   `resource_units` (jsonb, per unit) are copied from the package when the
   line is added, the way `bk_rate_card_lines` snapshots the rate — a later
   draft version's package edit never changes what a sent estimate draws.
   The design's single `professional_hours_draw` became hours per class,
   following slice 2b.
3. **The strategic judgment is the lead's; the override onto the reserve is
   the executive's.** `qualifies_strategic` is recorded on the scope by
   anyone who can edit it, and the derivation reads it. Changing the
   derived treatment by hand records `pricing_overridden_by`; the guard
   refuses an override **to** strategic for anyone but the executive. An
   override away from strategic frees the reserve and is open to production
   staff. Both are audited (`bookings.project.pricing_overridden`).
4. **The reserve check excludes the project's own holds**, so re-deriving a
   project whose estimate is already out does not count its draw twice.

Verified: 1,878 tests, lint, typecheck, `db:check`; both migrations
applied to both Supabase projects and the new tables, functions, policies
and the `planned` status checked in each. Not yet verified: a browser
click-through, for the same magic-link reason as every earlier slice — the
first real request is the first end-to-end test of the send → approve path
against the triggers.

## 16. What slice 4 shipped (2026-10-06) — the public intake

- `20261006130000_bookings_public_intake.sql`: `bk_settings` (§5 "Settings" —
  the singleton behind the form: open or closed, the introduction, the
  confirmation, the copy shown while closed, and `offered_packages`, the
  services the form offers **by name**, since packages are versioned with the
  rate model and the form must keep working across versions; staff read it,
  the director or the executive change it), `bk_projects.requested_packages`
  (what the submitter chose, by those names — a request, not an estimate;
  production staff add the real lines) and `bk_projects.submitted_ip_hash`
  (for the rate limit; null for a staff request), and the two
  security-definer functions §6.3 names: `bk_public_form_config()` (what
  `/book` renders, never the confirmation copy) and `bk_submit_request()`
  (every check in one transaction — open, required fields, email shape, the
  offered packages, dates, the airtime numbers, three a day per email and
  five an hour per address hash — then the partner found or created by name,
  the project at stage `request` with source `public`, an airtime commitment
  when the form gave airings, length and a first date, and the `received`
  project event with no actor). Execute is granted to `anon` and
  `authenticated`; no `bk_*` table has a participant-facing policy.
- `20261006130100_resources_bookings_intake.sql`: the guide
  `bookings-intake` (screen key `bookings.intake`) and the release note.
- `src/app/book/` (`/book`, `/book/embed`): the `/partner` shape exactly — in
  the middleware's `PUBLIC_PATHS`, `frame-ancestors *` for `/book/*` in
  `next.config.ts`, no session at all, one shell for both routes. The form
  (`book-form.tsx`) is a short wizard — About you · What you need · When and
  where · The airtime (only when airtime is asked for) · Anything else —
  following the partner form's two hard-won rules (steps shown or hidden by
  one conditional className and never unmounted; a Next/Send button that is
  always `type="button"`, with `requestSubmit()` on the last step). The
  action (`actions.ts`) adds only what the server alone sees — the honeypot
  and timing check and the salted address hash, reusing
  `lib/academic-partnerships/rate-limit.ts` — and calls the function.
- `lib/bookings/intake.ts` (+ test): the steps, the client-side validation,
  the payload the function reads (fields of a track not asked for are
  dropped), the sentence for each error code, and the offered-packages
  parser the settings form uses. `lib/bookings/embed.ts` (+ test): the
  public URL and the Grove snippet, in `lib/academic-partnerships/embed.ts`'s
  shape. `lib/bookings/public.ts` (server-only): the one public read.
- `/bookings/intake` (under Requests, reached from the Requests toolbar's
  "Public form" link): the settings form for the director or the executive
  (`assertBookingsIntakeEditor()`; `bk_settings_update` is the boundary;
  audited as `bookings.intake.updated`), read-only for everyone else, with
  the public link, the embed snippet and a same-origin live preview as the
  right column. The project page lists a public request's "Services asked
  for" in its Scope summary, and the activity log names the `received` event.

Three decisions worth recording:

1. **A public submission finds or creates its partner by name.** Every
   project names a partner (§5), and a public submitter has no picker, so
   `bk_submit_request()` matches `lower(name)` against `bk_partners` and
   inserts a row — with the submitter as its contact and the kind the form
   asked (UWF unit or outside organization) — only when none matches. An
   existing partner is never changed by a public submission: its kind,
   contact and funding index are staff's to keep, and the submitter's own
   details go on the project's `contact_*` columns. The derivation (§2.2)
   reads the kind, so an outside organization's request prices external
   from the start.
2. **Offered services are names, not package ids, and a request records the
   names.** Packages belong to a rate model version; a form that referenced
   `bk_service_packages.id` would break at every new version. The names are
   what the submitter saw and chose; production staff translate them into
   estimate lines against the version in use, which is the point at which a
   price first exists. No rate appears on the form (§4).
3. **Airtime from the public becomes a commitment only when the form gave
   enough to record one** — airings a week, a length and a first date (the
   event's first date stands in for the airing date when only that was
   given). Anything less stays in the description for staff to read; the
   commitment, when written, is `contributed` with `honored_in = 'pending'`,
   the same state a staff-entered commitment starts in, so the envelope
   check on the project page sees it at once.

Verified: 1,903 tests, lint, typecheck, `db:check`; both migrations applied
to both Supabase projects and the table, columns, functions and grants
checked in each; `bk_submit_request()` exercised directly on preview in a
live run (the grants to `anon` checked, then a closed form, a bad email, a package not
offered, a complete request — partner created, project at `request` with
source `public`, commitment and received event written, the rows then
removed). One tooling note from that run: the Supabase MCP's `execute_sql`
holds a top-level `delete`, a `do` block, and an `update` whose `where`
carries a subquery for a confirmation a non-interactive session cannot give
— they time out without reaching Postgres — while a delete inside a `with`
clause runs. Not yet verified: a
browser click-through of the wizard, for the same reason as every earlier
slice.

## 17. What slice 5 shipped (2026-10-06) — partners and agreements

- `20261006140000_bookings_partners_agreements.sql`: `bk_agreements` (§5
  "Partners" — the terms, `status` draft → active → ended, `approved_by`/
  `approved_at`, `ended_at`, `document_path` in a new private
  `bookings-documents` bucket in `underwriting-documents`' shape),
  `bk_reserved_blocks` (`pool_id`, since pools are data; `project_id` and
  `booking_id` once attached; `released_at`; `kept_by`/`kept_at`),
  `bk_projects.agreement_id` and `bk_service_packages.agreement_id` (the
  bespoke package §5 named — `bk_save_package()` writes it and the Rates
  packages form offers the scope). `bk_reserved_block_reserves()` is the
  one SQL reading of release-at-read (`bk_station_today()` is the station's
  calendar date, Central); `lib/bookings/agreements.ts`'s
  `reservedBlockState()`/`blockReservesWindow()` are its twins. Two guard
  triggers in the `rd_guard_post_curation()` shape: `bk_guard_agreement()`
  keeps draft → active for the executive (stamping who and when), ending
  for the director or the executive, and freezes an approved agreement's
  numeric terms to the executive; `bk_guard_reserved_block()` keeps
  `kept_by` for the director or the executive, refuses a block outside its
  agreement's dates or on an ended agreement, and refuses attaching another
  partner's project. `bk_guard_project()` refuses an agreement of another
  partner. `bk_booking_allowed()` gains **§6.4 step 2**: a block an active
  agreement still holds on an overlapping window, for another partner,
  counts as one of the window's concurrent units, and is the refusal named
  — partner, agreement and release deadline — when the window is full; a
  block whose own booking is live is counted once, as that booking.
  `bk_attach_reserved_block()` (security invoker, §3E) takes a block for a
  project and writes its booking — planned, tentative with the estimate's
  expiry, or confirmed, to match the stage — in one transaction, and puts
  the project under the agreement if it wasn't. `bk_set_project_disposition()`
  now also detaches the project's blocks, releasing each block's own date
  even while it is still planned (a lingering planned date would double up
  on reopen). RLS: reads for members; agreements
  written by production, the director or the executive (a draft may be
  deleted); blocks added and removed by the director or the executive,
  updated (attached) by production too.
- `20261006140100_resources_bookings_partners.sql`: the `bookings-partners`
  guide (screen keys `bookings.partners`, `bookings.partner`,
  `bookings.agreement`), the `bookings-requests` and `bookings-calendar`
  guides updated for what changed on their screens, and the release note.
- `lib/bookings/agreements.ts` (+ test): block state and deadlines, the
  reserving rule, consumption against the terms (`agreementConsumption` —
  professional hours of strategic dates against the reserve share, student
  hours against the funded hours, contributed commitments against the
  allowance, blocks by state), `agreementReserveCovers()` for §2.2's
  agreement row, the proposal draw (`proposalDraw`), the two forms'
  validation, and the dashboard's agreement items. `scheduling.ts` gained
  `reservedBlocks` on `CalendarState`, `partnerId` on a request, the
  `reserved` refusal and `reservingBlocks()`; `estimate.ts`'s
  `derivedPricingFor()` prices a project under an active agreement against
  what its reserve share has left (its other projects' live strategic
  holds excluded, and the project's own), incremental beyond it.
- `src/app/(portal)/bookings/partners/`: the Partners tab (search, kind
  chips, pagination, `/new`, `/[id]/edit` on one `partner-form.tsx`), a
  partner's page (agreements, requests, details aside), and the agreement
  page (`/[id]/agreements/[agreementId]`, with `/new` and `/edit` on one
  `agreement-form.tsx`): the **proposal preview** on a draft — the share of
  the term's reserve and what would be left, the airtime allowance against
  the envelope's remainder, the windows its blocks take, each flagged when
  the term cannot carry it — **consumption bars** once active, the reserved
  blocks with their state and both deadlines (reserve one date or a weekday
  to a date; keep, release, remove), the requests under it, bespoke
  packages, the signed agreement (`agreement-document-upload.tsx`, the
  Traffic contract document's shape), and the aside's approve / end / delete
  draft. The project page gained an **Agreement** panel (the partner's
  active agreements) and the dates section a **Use a reserved block** card;
  the calendar draws a reserved block with a dotted frame until it is taken,
  and the month view counts them; the dashboard's "Needs your action" names
  a draft awaiting the executive and blocks past their booking deadline for
  the director.

Four decisions worth recording:

1. **A reserving block takes a concurrent unit; it does not close the
   pool.** The design's step 2 reads as a flat refusal, which is right for a
   one-unit studio and wrong for a field pool with two kits — the same
   correction slice 2b made for holds. Counting the block as one unit keeps
   both cases right, and the refusal is still named as the reservation when
   that unit is the last.
2. **Only an active agreement's blocks reserve anything.** A draft's blocks
   are part of the proposal the executive reads; they take effect on
   approval. Approving an agreement therefore changes what the rule says
   about windows that may already be planned on other requests — the
   proposal preview shows the windows for that reason.
3. **The agreement's reserve share is checked by the derivation, the term's
   reserve by the triggers.** `derivePricing()` prices work under an
   agreement strategic while the share has hours left; the hold is still
   checked against the term's reserve when it is placed. An agreement whose
   allocation exceeds the term's reserve is flagged on the preview, not
   refused — that is the executive's call.
4. **A block's booking carries the stage.** Attaching a block to a request
   whose estimate is out writes a tentative hold with the same expiry; to a
   booked request, a confirmed one. The block hands itself back when that
   date is released or the request is closed.

Verified: 1,939 tests, lint, typecheck, `db:check`. Both migrations were
applied to both Supabase projects on 2026-10-06 through the MCP's
`execute_sql` in chunks — `apply_migration` held the whole file, and the
one statement it holds on its own (`bk_save_package()`, whose body contains
a `delete`) ran as dynamic SQL from a string — and the migration rows were
recorded by hand. Not yet verified: a browser click-through, for the same
magic-link reason as every earlier slice.

---

# Refinement pass (2026-10-06)

Two reviews of the built tool found the same thing: **the underlying model is
stronger than the production workflow.** Slices 1–5 built a faithful, tested
model, and put every part of it in front of the person who just wants to
estimate a webcast. A few cost-model concepts are also missing or mislabeled.
This pass has three slices, in this order, each designed here before it is
built and tested after:

- **Slice A — the happy path** (§18). Decides whether staff use the tool at all.
- **Slice B — cost transparency** (§19). Changes what an estimate records and what the term report totals.
- **Slice C — model corrections** (§20). Rates tab and `lib/bookings/rates.ts`; production screens unaffected.

A and B change what staff see and record; C changes what the numbers mean.

## Why (the reasoning this pass is held to)

- **Complexity belongs under the hood.** Production staff move requests
  through the workflow — request → package → adjust if needed → price and
  capacity check → send → approve → deliver → settle. They see the answer
  first (price, capacity status, WUWF's contribution) and the machinery only
  on request or when something is unusual. Prepopulate from defaults; make
  every exception explicit and visible; ask for a decision only when the
  system can't derive it. Finance, director and executive surfaces can be as
  detailed as their work needs. **On any screen this document does not name,
  apply this rule.**
- **The pilot exists to show what WUWF contributes to university work and to
  test the legacy $500 webcast price against modeled cost.** Every estimate
  and the term report must therefore show full cost and contribution, not
  just what the partner pays.
- **Unit costs divide by practical capacity, not demand.** Low demand must
  never raise a unit cost; unused capacity is a finding for the term report,
  not a price input. Utilization (actual bookings) is never a pricing input;
  it informs the term report and a deliberate future capacity revision,
  nothing else.
- **Capital consumption is economic**: what must be set aside each year to
  replace the asset over its realistic life, not its accounting depreciation
  schedule.
- **Costs with no real per-use limit are overhead.** Forcing them into a
  per-unit allocation produces false precision.
- **Market benchmarks are a sanity check in both directions.** A price far
  above market signals a model or scope problem to review, not a price to
  accept or to cap silently.
- **Slice A comes first** because it decides whether staff use the tool at
  all. Slices B and C change what the numbers mean, not what staff see.

## Definitions

- **Full economic cost** = modeled labor cost + modeled resource cost +
  direct project expenses. It excludes contribution margin, university
  assessments and general overhead, unless a later adopted policy explicitly
  allocates overhead into project cost.
- **Partner recovery** = what the partner pays.
- **WUWF contribution** = `max(0, full economic cost − partner recovery)`.
  External margin and assessment are shown separately and are never treated
  as a negative contribution.
- **Market benchmark snapshot** = the package's market floor, its ceiling if
  present, and its historical/reference note, as they stood when the estimate
  was priced.

## Standing rules for the pass

- **Schema.** There is no user data or production dependency to preserve, so
  the Bookings schema could be destructively rebuilt. But every earlier
  Bookings migration is applied to both Supabase projects (`APPLIED.md`), so
  nothing applied is rewritten or squashed: every change, including any
  rebuild, is a **new migration**, applied preview first and then production,
  recorded in the ledger, with `npm run db:check` passing. This pass needed no
  destructive rebuild; the changes are additive.
- No backward compatibility, no data migration, no feature flags. Internal
  terms are renamed in code where a clearer name helps.
- **SQL never computes a price.** The SQL twins of the booking rule stay in
  step with `scheduling.ts`.
- `rates.test.ts` still reproduces the v0.1 workbook figures: new cost inputs
  default to zero, so the workbook's rates come out unchanged.
- Seeded figures are the workbook's provisional values; none is invented here.
  Finance supplies new numbers.
- **Validation gate.** The fields this pass introduces (capital/replacement
  inputs, maintenance, market ceiling, package-recipe review status, overhead
  classification) add **no** new submission gates. Existing validation
  behavior is preserved except where a section below says so explicitly.
- **Not built, waiting on UWF policy:** per-line assessment rules, and a
  depreciation switch for donated or grant-funded gear. Both wait on UWF
  policy answers (whether the assessment applies to each cost line, and
  whether donated or grant-funded assets are costed at replacement or not at
  all). Today every asset is costed the same way and the assessment is one
  share of an external price.

## 18. Slice A — the happy path

**Acceptance test.** Time from opening "New request" to a send-ready standard
Basic Webcast estimate for an existing UWF partner, with a valid date and no
exception conditions. **Target: 60 seconds or less, no advanced-model surface
opened, and none of the words pool, labor class, treatment, draw, reserve or
rate model version shown along the way.**

The path is: _New request → pick the partner → tick Basic event webcast → pick
the date → Create_ — one form, one submit, and the project page that follows
is already priced, capacity-checked and ready to send.

### 18.1 One pass: a request that is also an estimate

The staff request form (`/bookings/requests/new`) takes the partner, one or
more **packages** (a checkbox and a quantity each, from the card in use) and
the **event date**, and creating the request produces the priced estimate in
the same submit: the project row, one estimate line per package (snapshotting
the recipe as `addEstimateLine` does), the derived treatment and every rate
(`repriceProject`), and the booking plan (§18.2). The title is optional when a
package is chosen — it defaults to "_Package_ for _Partner_". Everything else
(description, contact, location, funding index, editorial review, "asks for",
deliverables date, an end date) moves under "More details", prefilled from the
partner where the partner has it. A request for airtime only, or with no
package, behaves as before. The separate add-line flow stays for later edits.

### 18.2 A package books itself

A package already says everything a booking needs: its hours per labor class
and its units per pool. `lib/bookings/booking-plan.ts` (pure, tested) turns
the estimate's package lines plus an event date into the full set of bookings
and runs the booking rule (§6.4, `checkBooking`) on each:

1. Pools the lines use are collected (units × quantity). A pool whose term
   resource offers **more than one window** is a _choosing_ pool; a pool whose
   resource has no windows of its own (webcast operations, an own-lines pool
   whose unit is an event) has **no independent window choice** and attaches to
   the primary booking's window automatically. A pool with exactly one window
   needs no choice either.
2. The **primary window** is the staff pick ("Time of day", optional, default
   _first available_) or, when none was given, the first of the anchor pool's
   windows that passes the whole rule. The anchor is the choosing pool with the
   most units (ties: the pool order).
3. Every other choosing pool takes its window that overlaps the primary one
   (the same window if it has it, else the greatest overlap). **If a pool has
   no window that shares the primary timing, the plan is an exception** —
   nothing is created.
4. The lines' hours per class ride on the primary booking, so the class-day
   and capacity checks see each hour once.
5. The rule runs for every booking. **If any is refused, the whole plan is an
   exception**, with the refusal in plain language and the **nearest
   alternatives** (the next dates and windows where the whole plan passes,
   nearest first). The system never creates mismatched or partial bookings;
   it also never silently picks a different day than the one asked for.

A passing plan is written as `planned` bookings (not live, take nothing);
**tentative holds are still placed when the estimate is sent**, by the
unchanged `bk_send_estimate()`. A failing plan writes no bookings; the project
page shows the exception with the alternatives, each one a button that sets the
event date and re-plans. Planning dates by hand — today's "Dates" card — is
the **Adjust scope** path: it sets `dates_mode = 'manual'` and the system then
never regenerates the dates. The plan is regenerated (delete the project's
planned bookings, build again) when the lines or the event date change while
the project is at _Request_ and in auto mode; once the estimate is out the
dates are the holds and change only by hand.

`bk_projects` gains `event_window_start`/`event_window_end` (the primary window
the staff picked, kept so a re-plan honors it) and `dates_mode`
(`auto` | `manual`). No SQL twin is needed: the plan only _chooses_ what to
write, and every write still passes the SQL triggers.

### 18.3 One summary line

The top of the project page is one sentence, built by
`lib/bookings/summary.ts` (pure, tested): _"Basic event webcast · 5 staff
hours, 10 student hours · $575 · Capacity available · WUWF contributes
$202.64 · Estimate expires in 14 days."_ — service(s), hours in two buckets
(**staff** = a class not charged in a strategic price; **student** = one that
is), the partner's price, the capacity status, the contribution in words, and
where the estimate stands. (The brief's example reads "$800 … WUWF contributes
5 staff hours": at $800 the partner is paying the full cost, so there is no
contribution; the figure that goes with contributing five staff hours is the
$575 university rate. The summary prints whatever the math says.) The cost
build-up, the pricing reason, the version and the provisional-rate note sit
behind **Show calculation**, which is closed by default.

### 18.4 Plain-language labels

On production-facing screens the treatments are **University rate**
(incremental internal: the partner pays full cost), **University rate (WUWF
contributing)** (strategic: the partner pays students and resources; WUWF
carries the professional time) and **Outside rate** (external).
`lib/bookings/labels.ts`'s `PRODUCTION_RATE_LABEL` is the one table. The
internal terms (strategic, incremental, external, pool, labor class, draw,
reserve, treatment, rate model version) stay on the Rates tab, in Finance
views and in the Show calculation panel.

### 18.5 The strategic question moves to estimate time

"Qualifies as strategic or applied-learning work?" becomes a single yes/no
with a one-line explanation on the new-request form, **shown only when the
partner is a UWF unit** (an outside organization is never asked). It stays
**a separate judgment from whether the reserve can cover it**:
`qualifies_strategic` is the person's answer and is never overwritten, and a
new `bk_projects.reserve_depleted` records the _system's_ finding that a
qualifying request was priced University rate (incremental) because the
reserve had run out. Such a project stays recorded as qualifying, and the term
report counts it that way. Unanswered stays valid (it prices University rate
and the summary line offers the question inline) — the existing
"not decided" state is preserved, not made a gate.

### 18.6 Tabs and sections by role

`lib/bookings/nav.ts` (pure, tested) decides the tab row from the viewer's
roles. Dashboard, Requests, Calendar and Partners are always shown. **Rates**
is shown inline for finance, director and executive; for production staff and
for a member with no role it sits under a **More** menu — reachable, never
removed (a role-less member still reads everything, §6.1). The **term plan**
link on the Calendar goes under the same More disclosure for the same people.

### 18.7 Unusual cases stand out

`lib/bookings/badges.ts` (pure, tested) derives the warning badges from facts
already on the project and its dates: **Pricing changed by hand**,
**Booking exception** (a date written with an exception reason),
**Reserve used up**, **Dates need attention** (the plan is an exception),
**Above market** (Slice C), **Adjusted scope** / **Custom package** (Slice C).
They show on the project page and in the Requests list. **The routine case
shows no badge.**

### 18.8 Also fixed here

`repriceProject` wrote an expense line's grossed-up rate into the same column
that held the typed cost, so an external project's expense compounded the
assessment on every reprice. Expense lines now keep the typed cost in
`bk_estimate_lines.direct_cost` and the rate is derived from it (Slice B
reads the same column as the line's cost).

### 18.9 Migration

`20261007120000_bookings_happy_path.sql` (additive): `bk_projects.event_window_start`,
`event_window_end`, `dates_mode`, `reserve_depleted`; `bk_estimate_lines.direct_cost`
(backfilled from `unit_rate` for expense lines; nothing is external yet).

### 18.10 What slice A shipped (2026-10-06)

- `20261007120000_bookings_happy_path.sql` (+ `20261007120100_resources_bookings_happy_path.sql`:
  the guide `bookings-new-request` and a release note), applied to both projects.
- `lib/bookings/booking-plan.ts` (the plan, `plainRefusal`, `timeOfDayOptions`),
  `summary.ts` (the line, `hourBuckets`, `capacityStatusFor`), `badges.ts`, `nav.ts`,
  `estimate-lines.ts`, `plan-sync.ts` (server-only: replaces a project's planned dates with the
  plan), `PRODUCTION_RATE_LABEL`/`_HINT`, and `rates.fixture.ts` (the workbook fixture, now
  shared by every test that needs real figures). `derivePricing` also returns `reserveDepleted`;
  `priceLine` derives an expense's rate from `direct_cost`.
- `/bookings/requests/new` is one form (`new-request-form.tsx`): partner, services with quantities,
  event date, optional time of day, the strategic yes/no for a UWF unit, and "More details".
  `createRequest` writes the project, its package lines, reprices and plans in one submit.
- The project page opens with the summary line, the strategic question inline when unanswered, the
  exception panel with one-click alternatives when the plan can't be written, **Show calculation**
  (the estimate section, closed unless a line is being edited) and **Adjust scope** (the old
  Dates card, closed unless it is in use). Sending is disabled while the dates are an exception.
- Plain rate names everywhere production staff read a rate (list, project, partner and agreement
  pages, dashboard, calendar); the internal names remain on the Rates tab.
- `TabNav` takes `forceMore` tabs; Rates and the term plan link sit behind "⋯"/"More" for production
  staff and role-less members.

**Deferred.** Dollar contribution in the summary line (Slice B stores it; the line already prints
dollars when it is given and staff hours until then). The three estimate-level badges (above
market, adjusted scope, custom package) arrive with Slice C; the facts are already in
`projectBadgeFacts`. A package's recipe can't be adjusted per project yet (Slice C item 6). A
multi-day event (an end date later than the start) plans only its first date; the other days are
added under Adjust scope.

**Measured.** The acceptance test needs a person with a stopwatch and a signed-in session; this
environment signs in by magic link only, so the wall-clock figure is **not measured**. What is
measured: the path is partner → tick service → date → Create, which is (counting the "+ New
request" click) eight interactions for an existing partner — open, partner box, type, pick,
service, date field, date, Create — with no advanced surface opened. `new-request-form.test.tsx`
renders the form and asserts none of _pool, labor class, treatment, draw, reserve, rate model
version_ appears and that no field beyond the three is asked up front; `happy-path.test.ts` runs the
workbook's Basic event webcast through the plan, the price and the summary line: $800 at the
university rate, or $575 with WUWF contributing, "Ready to send".

## 19. Slice B — cost transparency

The pilot's question is "what does WUWF contribute, and how does the legacy $500 compare with
modeled cost?" An estimate that records only what the partner pays can't answer it. Every
estimate therefore computes and **stores** the figures in the Definitions above, and the term
report totals them.

### 19.1 What an estimate stores

`lib/bookings/economics.ts` (pure, tested) computes, from the estimate's lines and the card
snapshot, and `repriceProject()` writes onto the project after every pricing write:

| Stored on `bk_projects`                              | Meaning                                                                                                                                                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `labor_cost`, `resource_cost`, `direct_expense_cost` | The three parts of full economic cost, **exact** (six decimals; never rounded to the card's $25 step, never to cents)                                                                                                             |
| `full_economic_cost`                                 | Their sum — the cost of the work whatever the partner pays                                                                                                                                                                        |
| `partner_recovery`                                   | Σ the lines' amounts — what the partner pays                                                                                                                                                                                      |
| `wuwf_contribution`                                  | `max(0, full economic cost − partner recovery)`                                                                                                                                                                                   |
| `external_margin`, `external_assessment`             | External only; zero otherwise. Assessment = the assessment share of what the partner pays (for an expense, of its cost); margin = `max(0, recovery − assessment − full cost)`, what is left after cost and the university's share |
| `market_benchmarks` (jsonb)                          | One entry per package line: the floor, the ceiling (null until Slice C), the reference note and the rate charged, **as they stood when priced**                                                                                   |
| `economics` (jsonb)                                  | The per-line breakdown the Show calculation panel prints (labor, resource, direct cost and amount per line)                                                                                                                       |

A line's cost comes from the card snapshot, so it is the cost **as modeled when the estimate was
first priced**, whatever treatment applies: a package line's `labor_cost` and `resource_cost` per
unit (new, exact, on `bk_rate_card_lines`); a labor line's class's exact loaded hourly cost times its
hours; an expense line's `direct_cost` times its quantity. Overhead is excluded (§20.2) unless a later
adopted policy allocates it.

**Rounding is a pricing policy, applied to the rate only.** The card rounds each rate up to the
next $25; the cost is never rounded. The calculation panel prints both, so the gap between the
rounded rate and the cost is visible (it is why an incremental estimate can recover slightly more
than its cost — contribution then reads $0, never negative, and the excess is not "margin").

The three cases the definition has to get right, on the v0.1 Basic event webcast
(full economic cost $777.6375 = $210.9375 professional + $162.00 student + $79.70 live package +
$325.00 webcast operations):

- **Strategic** ($575): recovery $575, **contribution $202.6375** (the professional time WUWF
  carries, less the card's rounding in the partner's favour).
- **Incremental** ($800): recovery $800 ≥ cost, **contribution $0**.
- **External** ($1,150, floored at market): recovery $1,150, assessment $77.165, margin $295.1975,
  **contribution $0** — the margin and assessment are shown on their own lines and are never a
  negative contribution.

### 19.2 The summary line and the panel

The summary line now prints the contribution in words and dollars — "WUWF contributes $202.64 (5
staff hours)" — and "No WUWF contribution — the partner covers the full cost" when it is zero.
Everything else sits in **Show calculation** (`calculation-panel.tsx`): the per-line cost
build-up, full cost, recovery, contribution, margin and assessment for an outside partner, the
market benchmark per package (floor, ceiling, reference, rate charged), why this rate, the version
and the provisional-rate note, and the rounding note.

### 19.3 The term report

`/bookings/report` (under Dashboard; `lib/bookings/report.ts`, pure and tested) totals, for the
projects of the active term that have been priced, **full cost, WUWF contribution and partner
recovery by partner and by pricing treatment**, with external margin and assessment alongside, and
counts qualifying strategic work by the judgment (`qualifies_strategic`), not by the rate it ended
up priced at: a qualifying project the reserve could not cover is listed as "qualifying, priced at
the university rate" so the reserve's depletion is a finding rather than an absence. It also
carries the legacy comparison (§1): the modeled price per webcast event against $500. Slice C adds
the assumed-versus-observed view (§20.8) to the same page.

### 19.4 Migration

`20261007130000_bookings_cost_transparency.sql`: the card snapshot's exact cost columns
(`labor_cost`, `resource_cost`, `exact_cost`) and the project's economics columns above. Additive.
A rate card snapshot written before this migration has no exact costs; the Rates tab's "Record for
estimates" detects it as stale (`snapshotMatchesCard` compares costs too) and an estimate priced
from one reports that its cost can't be modeled rather than guessing — no snapshot existed in
either project when this was written.

### 19.5 What slice B shipped (2026-10-06)

- `20261007130000_bookings_cost_transparency.sql` (+ `…130100_resources_…`: the guide
  `bookings-term-report` and a release note), applied to both projects.
- `lib/bookings/economics.ts` (`computeEconomics`, the definitions in code; `economicsColumns`),
  `report.ts` (`termReport`, `inTerm`), `PackageCosts.laborCost`/`resourceCost` and
  `LaborLine.exactCost` in `rates.ts`, the exact cost columns in the card snapshot
  (`version-card.ts`, with `snapshotMatchesCard` now comparing them).
- `repriceProject()` writes the economics after every pricing write; an estimate priced from a
  snapshot recorded before exact costs says so and still prices.
- The summary line prints the contribution in dollars; **Show calculation** is now the cost
  build-up (`calculation-panel.tsx`) above the estimate lines; `/bookings/report` is the term
  report (a link at the foot of the Dashboard).

Tests: `economics.test.ts` asserts the contribution definition on the workbook's Basic webcast
under all three treatments (strategic $202.6375, incremental $0, external $0 with margin
$295.1975 and assessment $77.165), an external price below cost (contribution, not negative
margin), an expense counted at its typed cost, labor lines at the exact hourly, and a stale
snapshot; `report.test.ts` totals three estimates by partner and by treatment, the $500 test,
and the qualifying-but-priced-university-rate count.

**Deferred.** The contribution of a _settled_ project at actual cost (needs hours and settlement,
slice 6 as reshaped in §20.9). The report's assumed-versus-observed view (§20.8). An overhead line
in the report (§20.2 records overhead as a decision, not a figure).

## 20. Slice C — model corrections

Rates tab and `lib/bookings/rates.ts`; production screens are unaffected except where a package
line can now be adjusted (§20.6) and where the badges gain their last three facts. Every new
cost input **defaults to zero or blank**, so the v0.1 workbook's rates come out unchanged —
`rates.test.ts` still reproduces them — and none of the new fields adds a submission gate.

### 20.1 Practical capacity

"Available units" on a resource pool is redefined everywhere as **practical capacity**: the
realistic units the resource can deliver in a year after normal downtime and constraints. It is
**not** expected bookings, and **never** a utilization figure — a unit cost divides by it so that
low demand can never raise a price, and unused capacity is a finding for the term report, not a
price input. Every instruction that said "replace the units with a booking analysis" now says
"replace the units with the practical capacity". The webcast pool's **20 events is a volume
forecast, not a capacity**: the number is kept (nothing is invented), but the row is flagged
(`bk_resource_pools.units_basis = 'volume_forecast'`, "Volume forecast — replace with the
practical capacity") on the Pools tab and the rate card, as a review item that gates nothing.

### 20.2 Overhead

A budget line (`bk_assumptions`, kind `pool_line`) can be marked **general overhead**
(`overhead`). An overhead line is kept **out of every pool's per-unit allocation** — it is not in
the shared production pool and not in an own-lines pool — and the Rates tab shows overhead
separately, with a total. Whether and how overhead is recovered is **a recorded decision, with no
default math**: `bk_rate_model_versions.overhead_decision` holds Finance's words and nothing
reads it. This gives the webcast pool's $6,500 operating line somewhere to go once Finance says
what it buys; it is **not** moved by this pass (seeded figures are not changed), so the webcast
rate is unchanged until Finance marks the line.

### 20.3 Capital consumption and maintenance, from the asset register

Assets gain `replacement_cost` and `annual_maintenance`. For each **active** asset a pool's annual
cost adds `replacement_cost ÷ realistic useful life (useful_life_years) + annual_maintenance`;
a blank field adds zero, and an asset with a replacement cost but no life adds nothing and is
listed as needing one. This is **economic** capital consumption — the amount to set aside each
year to replace the asset over its realistic life — not its accounting depreciation.
(`lib/bookings/capital.ts`, pure and tested.)

Assets are unversioned and a version freezes on adoption, so the amounts are **snapshotted onto
the version's pool row** (`bk_resource_pools.capital_annual`, `maintenance_annual`,
`asset_basis`) by an explicit "Refresh from the asset register" on a draft version; a copied
version carries them; the Pools tab says when the register has changed since. The pool's cost
build-up lists **capital set-aside** and **maintenance** as their own lines beside the budget
lines. No depreciation switch for donated or grant-funded assets is built (see the standing
rules): every asset is costed the same way.

### 20.4 Double-count check (advisory)

A budget line may say which pool's replacement it already funds (`funds_pool_id`) and, optionally,
which assets (`bk_assumption_assets`). `lib/bookings/capital.ts`'s `overlapWarnings()` raises a
**review warning** — never a block — when a pool's capital set-aside from the register and a
budget line that funds that pool's replacement both exist ("both recover replacement for the studio
pool — review for a double count"). **A cost is excluded only where the linkage is explicit**: an
asset a budget line names is left out of the capital set-aside and listed as covered by that line;
a line that names only the pool excludes nothing.

### 20.5 Two-way market check

A package gains an optional **market ceiling** (`market_ceiling`) beside the floor. The floor still
feeds the external price. A modeled rate (strategic, incremental or external) **above the ceiling**
raises a review flag on the rate card and the "Above market" badge on an estimate charging it; it
never caps the price. (`rates.ts`'s `rateCeilingFlags`.) The estimate's benchmark snapshot (§19.1)
carries the ceiling.

### 20.6 Packages are default recipes

A package line's hours and units are a **default recipe**. On a project, staff can adjust a line's
hours per class, units per pool or crew, with a **required reason** (Show calculation → the line's
"Adjust scope"). The adjustment is a **project-level override**: it never changes the package or
the rate model version. The line keeps `recipe_labor_hours`/`recipe_resource_units` (the standard
recipe it started from), shows the difference, and the project carries the **Adjusted scope**
badge. (A package scoped to an agreement carries **Custom package**.) An adjusted line is priced
from the same recipe math the card uses (`rates.ts`'s `priceRecipe`) over the version's unit costs,
snapshotted in `bk_rate_card_unit_costs`; the **market floor and ceiling are scaled by the ratio of the adjusted
full cost to the standard full cost** so a lighter scope is not held to a heavier scope's floor.
That scaling is a judgment this pass makes and records here for Finance to confirm or replace.
Its economics (§19.1) are computed from the adjusted recipe's costs. The booking plan reads the
adjusted hours and units, so the dates follow the scope.

### 20.7 Review status on package hours and market floors

A package's hours and its market floor each carry a validation status (`hours_validation_state`,
`floor_validation_state`: pending / validated / accepted as is), shown on the Rates tab with the
same controls as other assumptions. **They add no submission gate**: the adoption gate
(`adoptionGate`, `bk_guard_version_transition()`) is unchanged and does not read them.

### 20.8 Assumed versus observed (term report)

A read-only section on the term report, feeding nothing:

- **Package hours versus confirmed hours** — per package, the hours the recipe assumed against the
  hours confirmed on delivered projects.
- **Resource units planned versus used** — per pool, what delivered projects planned against what
  was confirmed used.
- **Refused or displaced bookings by resource** — the plan's and the rule's refusals, and live dates
  later released, per pool (`bk_booking_events`, written where they happen).

This needs the observed side to exist, so a minimal **confirm hours and units** step (slice 6's
§3F, reshaped in §20.9) is built here: a delivered project's page offers "Confirm as planned" (one
click) or the figures to correct, stored in `bk_hours_used`.

### 20.9 Slices 5–6, reshaped

Slice 5 (partners and agreements) is built; this pass touches it twice. An agreement's priced
work now stores contribution like any estimate, and the agreement page's consumption reads the
contribution it has drawn (§19). Slice 6 (hours, settlement, the term report) is **reshaped**:

- the **term report** is built (§19.3, §20.8) and no longer waits for settlement;
- **hours confirmation** is built in its minimal form (§20.8): prefilled planned figures, one
  click, correctable; it feeds the report and the next version, never the estimate's price;
- **settlement** (the recharge or invoice record, Finance posting, the journal entry number) is
  **still to build**, and now settles **at actual cost**: the settlement drafts itself from the
  approved estimate's price plus direct expenses at actual cost, and its contribution is the full
  cost _as confirmed_ against what was recovered. That is the only part of slice 6 left, and it
  stays unauthorized until its own instruction.

### 20.10 Migration

`20261007140000_bookings_model_corrections.sql`: the columns above, `bk_assumption_assets`,
`bk_rate_card_unit_costs`, `bk_hours_used`, `bk_booking_events`, the v0.1 rows' validation wording
and the webcast flag, with RLS. Additive.

### 20.11 What slice C shipped, deferred, and how it was checked (2026-10-06)

**Shipped.** Every item in §20.1–§20.8: practical capacity wording and the `units_basis` forecast flag (the webcast pool's 20 events kept, flagged); overhead kept out of per-unit allocation with a recorded decision and no default math; capital consumption plus maintenance from the asset register, snapshotted onto the version's pool rows by "Refresh from the asset register" (blank = zero, own line in the build-up); the advisory double-count check (explicit asset linkage only); an optional market ceiling per package with a review flag on the card and an Above market badge, never a cap; project-level Adjust scope with a required reason, the standard recipe kept and the difference shown, a Scope adjusted badge; review status on package hours and market floors with no submission gate; and the read-only assumed-versus-observed view in the term report (hours confirmed after delivery, units planned versus used, refusals and releases by resource). Migrations `20261007140000` (schema) and `20261007140100` (Resources content) are applied to preview and production and recorded in `APPLIED.md`.

**Deferred.** Settlement at actual cost (slice 6 as reshaped in §20.9); per-line assessment rules and a depreciation switch for donated or grant-funded gear (both wait on UWF policy answers); Finance's confirmation that an adjusted line's market floor and ceiling should scale with its cost ratio (a recorded judgment, not a verified rule); `bk_save_package()` still does not write the ceiling — the Rates tab action writes it after the call.

**Checked.** `rates.test.ts` still reproduces the v0.1 workbook figures (new cost inputs default to zero); every new pure function has colocated tests, including the contribution definition on a strategic, an incremental and an external estimate. Preview was reseeded with `[Test]` data exercising the happy path and each warning badge (pricing override, booking exception, depleted reserve, above-market, scope-adjusted, custom package, dates needing attention) plus a delivered project with confirmed hours; the preview database also carries a test 1100 market ceiling on Basic webcast and a bespoke `[Test] OUR Voices episode` package. Production carries no test data. Not exercised: a signed-in browser session, so the Slice A acceptance test's wall-clock time (§18.10) remains unmeasured.

## 21. What slice 6 shipped (2026-10-07) — settlement at actual cost

Slice 6 as §20.9 reshaped it: the term report and hours confirmation were already built,
so what remained was Finance's settlement (workflow G, §3).

- `20261007150000_bookings_settlement.sql` (+ `…150100_resources_…`: the guide
  `bookings-settlement` and a release note), applied to both projects. `bk_settlements`
  (one per project; `kind` recharge | invoice, `status` drafted | posted, the amount, the
  estimate's recovery/cost/contribution kept for variance, actual labor/resource/direct
  cost, contribution, assessment, margin, `expense_actuals`, funding index, journal entry
  number), `bk_guard_settlement()` (insert only for a delivered project; a posted row is
  final; posting is Finance's), `bk_guard_project_settled()` (a project becomes `settled`
  only with a posted settlement) and `bk_post_settlement()` (posts and settles together).
  SQL checks shape only; it never computes a cost.
- `lib/bookings/settlements.ts` (pure, tested against the v0.1 Basic webcast): **amount**
  is the approved estimate's lines with each direct expense at its actual cost (plus the
  assessment when external); **actual cost** is confirmed hours per class and units per
  pool at the card snapshot's exact unit costs, plus actual expenses; **contribution** is
  `max(0, actual cost − amount)`, the estimate's own definition (§19.1); margin and
  assessment are external only and apart. The hours never change the amount charged.
  Drafting is refused until every planned class and pool is confirmed.
- The project page's Settlement panel (`settlement-section.tsx`): the live draft,
  per-expense actual cost, funding index (recharge), notes, "Update the draft", and "Post
  the settlement" with the journal entry number. Others read it. The dashboard lists
  delivered projects for Finance ("Delivered — settle it at actual cost").
- The term report gained "Settled at actual cost": posted settlements' amount, actual cost
  against the estimates' modeled cost for the same requests, and contribution.

**Decisions.** Settlement is Finance's alone (§6.1), including drafting, because it is
their record; a posted settlement is final and a correction is a note, not an edit;
the journal entry number is typed by hand (§6.6); a recharge's index defaults from the
project, then the partner.

**Deferred.** PDF invoices, journal-entry or Banner integration, reversing a posted
settlement, and per-line assessment rules (waiting on UWF policy, §17 standing rules).

**Checked.** `settlements.test.ts` (as-planned settlement reproduces the estimate's
$777.6375 / $202.6375 under strategic, incremental and external; extra hours raise cost
not price; expenses at actual with and without the assessment; unconfirmed hours and a
missing unit cost refuse; the report summary), the extended `projects.test.ts`, both
migrations applied to preview and production with the table, triggers, policies and
function confirmed on preview. Not exercised: a signed-in browser session, or a live
post through `bk_post_settlement()` as a Finance user.

## 22. Design review — what the capacity model is for, and three corrections

Status: **decided; the three corrections in §22.3 are built (see §22.6).** A review of two foundational decisions (the reserve's denominator, and the term plan as the planning container), made after re-reading §2.1, §5, §6.4, §8, §13–§14 and the code (`lib/bookings/scheduling.ts`, `plan-sync.ts`, `bk_booking_allowed()` / `bk_check_booking_labor()`, the plan form). The conclusion is to **keep the model that is built**, fix the three things in it that are wrong, and leave a larger redesign on the shelf (§22.5).

### 22.1 What the model is for

Bookings exists to put constraints on institutional partnerships and recover costs where appropriate. Capacity was layered on top so the station can also answer whether it has room to take outside work. Three rules do everything:

1. **A role has hours, and a share of them is set aside for the university.** The director enters, per labor class and per term, the hours available for production work. A percentage of those hours is the **reserve**: the amount of university work WUWF contributes.
2. **Inside the reserve, strategic work is comped. Beyond it, or when it is not a strategic priority, it is cost-recovered.** The reserve is the only thing a strategic booking may draw. Work priced incremental or external draws what the reserve does not cover. This is the derivation in §2.2.
3. **What is left is sellable.** Whether the station can take outside work is whether its hours fit in what remains after the reserve, the dated holds and the work already booked.

### 22.2 The mechanics, per labor class and term

```
hours      hours the class has available for production work this term.
           Undated core work is already left out of this number; dated WUWF
           holds are not, and come off it below. (entered; "net hours")
share      the class's reserve share, or none.                (entered, optional)
reserve    share × hours                                    (none → no reserve)
open       hours − reserve − dated WUWF holds − non-strategic bookings

a strategic booking     class has a share: refused if strategic hours booked + ask > reserve
                        class has no share: counts like any other booking
every other booking     incremental and external: refused if booked + ask > open
```

- **The share belongs to the class, not the plan.** The 15% is set on the professional class's row. A class partners pay for in strategic work (student and OPS crews, `charged_in_strategic`) has no share, so student hours are never limited by it. "None" is not "0%": a 0% share would refuse every strategic hour of that class, whereas none means every booking of that class draws open capacity. Before this change a tracked student class took 15% of its own hours as a "reserve".
- **Core work is not tracked here.** The director leaves it out of the hours figure. A dated block WUWF wants kept clear (a pledge drive, maintenance) is a hold; holds reduce `open` and never the reserve. Do not enter a hold for hours the figure already left out, or they come out twice.
- **The reserve is protected whether or not it is used.** Incremental and external work cannot draw it, so an unused reserve does not become sellable.
- **Percentages are values in the database**, per class and per term, edited on the term plan. They are not in code.
- **Hours are a term figure.** The workbook's 100 project days is a year (800 hours); a term takes its share of that, and the form says so. The workbook's 15% is of that net figure, so 120 hours a year. If the intent is 15% of a larger figure, the director types the larger figure and accepts that `open` then includes hours core work will use. That is a policy choice (§22.4), not something the model forces.

### 22.3 The three corrections

**1. A share per class.** `bk_term_capacity.reserve_share`, nullable. `classCapacity()` and `bk_check_booking_labor()` apply the reserve only where a class has a share; a class without one counts every booking against open capacity. `bk_term_plans.reserve_share` is removed, so there is one place for the number. Existing data: each plan's share moves onto the classes that are not `charged_in_strategic`; the others get none.

**2. Plans resolved by date, not by "the one active plan".** Before, one plan could be active and any date outside it was refused (`outside_plan`), so a September event could not be booked in April and a winter-break blackout could not span two terms.

- A plan is **bookable when it is active**. Several plans may be active at once provided their dates do not overlap; a trigger refuses to activate an overlapping one.
- A booking's plan is **the active plan whose dates contain its date**. A date no active plan covers is refused, as before, with a message that says to ask the director to add the term.
- Screens that show "the" term (dashboard, report, agreement page) show the active plan containing today, else the next one to start, else the latest.
- A blackout spanning two terms is stored as one row per plan, each clipped to that plan's dates, by the action that creates it.

**3. A closed plan is final.** A trigger refuses edits to a closed plan's dates, share, airtime and capacity and resource rows, refuses reopening it, and refuses new or moved bookings into it; releasing an existing booking stays allowed. A correction is a new plan. This is what makes "past bookings stay interpretable" true: the numbers a closed term was judged by cannot change afterwards.

Also fixed: the doc's two statements about core work (§5 and §6.4 said net is after core work and that core work reduces net, while `open` also subtracts holds) now say what §22.2 says, and the plan form's hours field says what it means.

### 22.4 Decisions that stay with the executive and director

- **The percentage and the figure it applies to.** Today: 15% of a net figure. The framework's 120 hours is the commitment; 15% of a larger figure would be more. The model makes either a plain number the director can read as hours.
- **Whether unused reserve opens to paid work** near the end of a term. Today it stays protected.
- **Who may change a share.** Today the director does, on the plan form. An executive-only guard, as for adopting a rate version (§6.1), is easy to add if the share is to be a signed figure.
- **The capacity study** replaces the placeholder hours; nothing here changes how it feeds in.

### 22.5 Deferred: the larger redesign

A fuller design was worked through and set aside: one standing calendar with effective-dated capacity revisions (prospective, frozen once in force, hours as a weekly rate, fiscal-year bounds), blackouts, holds, bookings and resources owned by no plan, and reporting by date range; and, separately, an explicit core percentage with the role's hours derived from headcount and a weekly schedule. Neither is needed to meet the objectives above, the pilot's natural review cycle is the semester, and the corrections in §22.3 remove the practical problems terms cause today. Revisit it if the pilot shows terms getting in the way (a mid-term staffing change that cannot be expressed, or a year-long agreement that the term boundary keeps cutting).

### 22.6 What was built

**Built** (all three corrections; the schema migration is written and verified, not yet applied to the hosted projects — see below).

- **A share per class.** `scheduling.ts` (`CapacityLike.reserve_share`, `ClassCapacitySummary.hasReserve`, the strategic check only where a class has a reserve), `pricing.ts` (`reserveCoversDraw` covers nothing for a tracked, non-charged class with no share), the plan form (a share per class row, blank for none, a note on a charged class; the plan-level field is gone) and the capacity panel ("None" where a class has no reserve).
- **Plans by date.** `lib/bookings/plans.ts` (pure, tested): `planForDate`, `currentPlan`, `splitBlackoutAcrossPlans`. `getActivePlan()` became `getCurrentPlan()` plus `getPlanForDate()`. Plan sync, the estimate's reserve check and "Plan a date" resolve the plan from the date; the project page checks each planned date against the calendar of the term it falls in; a blackout spanning terms is stored once per term, clipped.
- **Closed plans final.** The plan page no longer offers "Reopen as a draft"; the trigger enforces it.
- **Migrations.** `20261007160000_bookings_capacity_rules.sql` (adds `bk_term_capacity.reserve_share`, moves each plan's share onto its non-charged classes, restates `bk_check_booking_labor()` and `bk_booking_allowed()`, drops `bk_term_plans.reserve_share` and the one-active index, adds `bk_guard_term_plan()` and the closed-plan guards) and `20261007160100_resources_bookings_capacity_rules.sql` (the updated `bookings-calendar` guide and a release note).

**Checked.** Lint, typecheck, and the full suite (2,136 tests, including the new scheduling, pricing and `plans.ts` tests; the existing reserve tests pass unchanged with the share set on the lead class). The schema migration was run against a scratch PostgreSQL 16 built from the real Bookings migrations in order (portal tables stubbed), seeded like preview: it reproduced the old behaviour first (a strategic student booking refused against a 15-hour student "reserve"), then, after the migration, the share moved onto the lead only; a strategic student booking drew open capacity and was refused only once open capacity was spent; the lead's reserve and open limits held; an overlapping active plan, moving an active plan onto another, reopening or editing a closed plan, editing a closed plan's capacity or resources, and a new booking into a closed plan were each refused; two non-overlapping plans were active together; notes on a closed plan and releasing its bookings still worked. Production holds no plan rows; preview holds one `[Test]` plan.

**Not done.** The migrations are not applied to either Supabase project, and `APPLIED.md` has no rows for them (so `npm run db:check` fails on exactly those two files until they are). The migration drops a column and an index, and the session's Supabase tool holds any `drop` for a confirmation that never arrives (the same limit slice 2b recorded), so it must be run in each project's SQL editor, preview first. A signed-in browser pass of the plan form has not been done.

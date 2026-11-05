# Starting a new station: what a fresh install must not inherit

**Status (2026-11-05): a new station installs from a generated baseline, `supabase/baseline/`, not by replaying
WUWF's migrations.** The migrations cannot be replayed from nothing (see "Why a baseline"), so the plan below that
clears WUWF's data from a replayed database is now how the baseline is _made_ and what defines its contents, not what a
station runs. The first administrator script and `INSTALL.md` are written. CI has not yet run end to end on a real
Supabase stack; expect a first run to need small fixes.

## The constraint

WUWF's data stays exactly where it is. The existing migrations, `supabase/station/wuwf/`, the fixtures and
both hosted databases are not edited, trimmed or reset by anything in this document. Whatever clears data
runs **only on a fresh database a new station has just built from the migrations**, and refuses to run on
anything that already holds a station (see "The guard").

The reason a fresh install needs anything at all: about 275 migrations replay in order, and roughly 170 of
them insert WUWF's clocks, schedule, rates, editorial criteria or procedures. Applied migrations cannot be
edited, so a station replaying them starts with WUWF's operational data.

When the upstream repository is created, the intended end state is a squashed **baseline** schema with only
the product seed rows, with WUWF's old migrations kept as WUWF's own history. The classification below is
the same classification that baseline needs (which rows are product, which are WUWF), so this work is not
thrown away when the reset script is retired.

## What is in the database (production, 2026-11-04)

145 tables in `public`. By tool prefix: `bk` 33 (Bookings), `sw` 28 (Sourcework), `log` 21 (On Air),
`uw` 17 (Traffic), `ep` 10 (Editorial Planning), `rc` 6 (Resources), `ri` 5 (Remote Interview), `al` 4,
`ap` 4, `ei` 4, `tw` 4, `rd` 3, and six platform tables.

Production's row counts for the data a Traffic pilot would meet: 45 programs, 65 schedule entries, 29
clocks (354 slots), 173 local opportunities, 935 content items, 10 inventory pools, 47 underwriters, 35
contracts. These are WUWF's, they are in the database because WUWF uses the tools, and the migrations seed
a good part of the clocks and schedule.

## Proposed classes

| Class                             | What happens on a fresh install                                | Tables                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform**                      | Left as the migrations made them.                              | `profiles`, `tools` (the 12 registry rows), `tool_access`, `access_requests`, `audit_events`, `station_settings`                                                                                                                                                                                                                                                                    |
| **Product content**               | Kept.                                                          | Resources guides and their versions, embeddings, screenshots, the release-note→guide links (`rc_articles` guides, `rc_article_versions`, `rc_article_embeddings`, `rc_media`, `rc_release_note_guides`); Sourcework's prompts and piece formats (`sw_prompt_*`, `sw_piece_format*`); `uw_industry_categories` (19 generic categories); `ep_form_fields` (the pitch form, 19 fields) |
| **Starting copy that names WUWF** | Needs a decision (below): replace with neutral copy, or clear. | `ap_settings`, `ap_email_templates` (7 of 7 name WUWF), `bk_settings`, `ep_settings`, `ep_pillars` (6, WUWF's), `ep_criteria` (15, 5 name WUWF)                                                                                                                                                                                                                                     |
| **Everything else**               | Emptied (`truncate … cascade`).                                | Every other table: the 21 `log_*`, the 16 other `uw_*`, the 32 other `bk_*`, the operational `sw_*`, `tw_*`, `ri_*`, `al_*`, `ei_*`, `rd_*`, the rest of `ep_*` and `ap_*`, and `rc_pinned_procedures`                                                                                                                                                                              |

Resources `rc_articles` is split by kind in production: **68 guides** (17 name WUWF, UWF or Pensacola),
**26 procedures** (21 do; they are WUWF's own station procedures), **99 release notes** (5 do; they are
WUWF's change history). A fresh install should keep the guides and drop the procedures. The 99 release notes
read as WUWF's history, not the new station's.

## Keeping the classification honest

A test reads the migrations and fails when a table has a prefix that is not in the classification, so adding
a module forces a decision about what a fresh install does with its rows. It classifies by prefix (with a
short list of exceptions) rather than by table, so it does not break on every new table in an existing tool.

## The guard

The script is destructive by design, so it must be impossible to run against a station that has data. It
checks three things, all before it changes anything and inside one transaction:

- `public.station_settings` has its one row (this is a Portal database with every migration applied),
- `public.profiles` is empty (a fresh database has no one yet; the first administrator is created after it
  runs), and
- `public.station_settings.display_name` is not set (WUWF's is).

A refusal leaves the database exactly as it was. Running it a second time on a database that is still fresh
is harmless: it finds nothing left to do.

## What is built

- `supabase/baseline/` — `schema.sql` and `product-data.sql` (what a station installs), the scripts that make and prove
  them (`replay-history.sh`, `generate.sh`, `verify.sh`, `fingerprint.sql`, `local-stubs.sql`), `BASELINE_THROUGH` (the last
  migration it contains) and a `README.md`. `src/lib/baseline.test.ts` keeps the recorded migration list exactly equal to
  the files up to that version.
- `supabase/install/clear-seed-data-for-new-station.sql` — the script. It keeps 23 tables (the platform
  tables, Resources guides and what hangs off them, Sourcework's prompts and piece formats, the pitch form,
  the generic industry categories, and four settings singletons), empties every other table in `public`
  (`truncate … restart identity`, never `cascade`: a kept table pointing at an emptied one fails loudly),
  removes Resources release notes and procedures and every superseded article version, and rewrites the
  starting copy. It also clears `ap_settings.google_appointments_url`, which in production is WUWF's real
  calendar link, rewords three pitch-form fields and two tool descriptions that named WUWF, and closes the
  Academic Partnerships and Bookings public forms until the station opens them.
- `.github/workflows/fresh-install.yml` — two jobs. One installs the baseline into a local Supabase stack with no migrations
  and checks what a station is left with (every other table empty, row level security everywhere, one version per article,
  no kept table naming a station except the ten Bookings guides and the two WUWF-tooling guides, and `supabase db push
--local` finding nothing pending). The other replays the history on plain Postgres 17, proves both refusals of the
  clearing script (a named station, an account), clears, and proves the baseline is the same schema and data. It runs only when the migrations
  or install files change, or by hand. It holds no credentials, and fails at its first step if the database
  address is ever not this machine.
- `src/lib/install-script.test.ts` — keeps the script's guard before its first change, forbids `cascade`,
  forbids a station name in its copy, requires every table prefix in the migrations to be known (so a new
  module has to be classified before it ships), and keeps the workflow local-only.

**How the script was tested here.** The Docker daemon is not available in this environment, so the CI job
could not be run. The script's own SQL was instead run against the preview project inside a transaction that
always rolls back, after emptying `profiles` and the station name so its guard passed. That run exercised the
real schema, foreign keys and cascades; every non-kept table came back empty and only the guides remained.
The workflow's shell steps were syntax-checked and its two assertion queries executed against preview.

## Decisions (agreed 2026-11-04)

1. **Guides that name WUWF: remove the name where it is not needed**, rather than render a placeholder.
   Done for the core tool guides in `20261105230000_resources_guides_say_the_station.sql`: Editorial
   Planning's workflow overview, On Air's content library, Sources, and Read a clock, and Sourcework's
   overview (the content library at WUWF is flagged for an editor, who had changed it). **Left on
   purpose:** the ten Bookings guides, whose wording mirrors labels on Bookings screens that still say WUWF
   (a station without Bookings never sees them, and they change together with the screens); `log-dad-log`,
   which gives the DAD export's real file name; and `underwriting-migrate-legacy-copy`, which documents
   WUWF's own one-off migration.
2. **Release notes: dropped on a fresh install.** "What's new" starts at the new station's own install.
3. **Editorial Planning pillars and criteria: cleared**, with "set your pillars and criteria" as a step in the
   install guide. The pitch form needs at least one pillar before anyone can pitch.
4. **Public-form copy (`ap_settings`, `bk_settings`, `ap_email_templates`): neutral wording** that says "the
   station", written once and applied by the script.
5. **Bookings' rate model and salary assumptions: cleared** in every case.

### Two things the script must also do

- **Resources version history.** `rc_article_versions` keeps every earlier revision of each guide, including
  the wording from before this change. A fresh install keeps only each article's current version.
- **A fresh install is not production.** The counts above are production's, which include content editors
  created in the live database (the 26 procedures, a few release notes). A database built from the migrations
  has only what the migrations write: the guides (68 distinct, from 161 revisions), 92 release-note calls, and
  the seeded clocks and schedule. The reset is checked against a real replay in CI, not against production.

## Why a baseline (2026-11-05)

Replaying the 278 migrations into an empty Postgres was run for real, then the clearing script and its checks against the
result. Three findings:

1. **Two migrations cannot replay.** `20260914130000_rls_initplan_wrapping.sql` and
   `20260914140000_rls_initplan_wrapping_advisor_form.sql` alter policies on `sw_data_point_excerpts` and other Sourcework
   research tables. The files that create those tables carry prefixes `20261012…` and later: WUWF's projects had older
   versions of those tables in August, the files for them were later rewritten, and the September wrapping ran against the
   old ones. Applied migrations are never edited or renumbered, so the history stays as it is.
2. **Six guides were marked "edited since release" in a replay although no person touched them** (early migrations updated
   guides in a way that trips the flag), so every later release migration, including the one that removes the station's
   name from the core guides, skipped them.
3. **Two bugs in the CI job itself**, fixed: the newest Supabase CLI rejects the old `[inbucket]` section of `config.toml`,
   and the assertion helper printed the `DO` command tag before its answer.

The answer is the end state this document always described: a **baseline** schema with only the product's seed rows, with
WUWF's old migrations kept as WUWF's own history. It lives in `supabase/baseline/` (`README.md` there has how it was made
and checked). It was compared with WUWF's production database object by object: identical for every table, column,
constraint, index, enum, view, security policy (including Storage's), function privilege and bucket; function bodies
differ in comments, line endings and layout only; the remaining differences are Postgres 17's `MAINTAIN` privilege and
Supabase's own storage triggers. The clearing script is unchanged and is now the definition of what the baseline keeps.

## What is not in scope here

The ENCO DAD export (parked), the legacy-copy migration for WUWF's own spreadsheet, and WUWF's data scripts
under `supabase/station/wuwf/`, which stay as they are.

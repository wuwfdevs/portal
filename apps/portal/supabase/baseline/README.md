# The new-station baseline

A station that sets up its own Portal does **not** replay WUWF's migrations. It installs two files:

- `schema.sql` — the whole database schema (tables, policies, functions, grants, triggers, storage policies), and a
  record of WUWF's migrations as applied so a later `supabase db push` applies only newer ones.
- `product-data.sql` — what every station starts with: the tool registry, the product's Resources guides, Sourcework's
  piece formats, the pitch form, generic industry categories, neutral settings rows and the storage buckets. No
  account, no station name, none of WUWF's data.

`INSTALL.md` has the steps. Everything in this folder is generated; do not edit `schema.sql` or `product-data.sql` by hand.

## Why a baseline and not the migrations

WUWF's 278 migrations cannot be replayed into an empty database in file order, so `supabase db push` fails part way
through. `20260914130000_rls_initplan_wrapping.sql` and `20260914140000_rls_initplan_wrapping_advisor_form.sql` alter
policies on Sourcework tables that the files create a month later; WUWF's projects applied them while older versions of
those tables existed. Applied migrations are never edited or renumbered, so the history stays as it is, WUWF's own, and
new stations start from a snapshot of where it ended.

## How it was made and proved

1. `replay-history.sh` replays all 278 files, in order, into an empty database that has Supabase's `auth` and `storage`
   schemas. It differs from a plain replay in two documented ways (see the script): it runs the two September files
   statement by statement and ignores their failures, and it stops `rc_articles` from marking guides "edited since
   release", which early migrations trip although nobody edited anything.
2. `../install/clear-seed-data-for-new-station.sql` removes WUWF's operational data from that database.
3. `generate.sh` writes `schema.sql` (`pg_dump` plus what `pg_dump` cannot see) and `product-data.sql`.
4. `verify.sh` installs the files into a second empty database and compares it with the replay: the same definition for
   every one of ~4,000 schema objects (`fingerprint.sql`), and the same rows in every kept table.

The result was also compared **with WUWF's production database** (2026-11-05), object by object, using the same
fingerprint run on both. Identical: columns, constraints, indexes, enums, views, row level security policies (all 406,
including Storage's), function privileges, table list and storage buckets. Differences, all understood:

- **Function bodies** differ from production in comments, line endings and layout only (some files were edited after
  they were applied, and some were applied with Windows line endings). With comments and whitespace removed, all 167
  functions match.
- **Table privileges** differ by `MAINTAIN`, a privilege Postgres 17 adds to `GRANT ALL`; the generating server was
  Postgres 16. Installed on a Postgres 17 project the grants are the same.
- **Triggers**: production has eight more, all Supabase's own on `storage.objects` and `storage.buckets`. The two on
  `auth.users` that the Portal adds are in the baseline.

## What CI checks

`.github/workflows/fresh-install.yml` runs two jobs when migrations, the baseline or the install files change:

- **Install from the baseline** — a local Supabase stack with no migrations gets `schema.sql` and `product-data.sql`,
  then any migration newer than `BASELINE_THROUGH`; the result must hold only product data, have row level security on
  every table and no accounts, and `supabase db push --local --dry-run` must find nothing left to apply.
- **Baseline equals WUWF's history** — plain Postgres 17 replays the history up to `BASELINE_THROUGH`, proves the clearing
  script's refusals, clears, and runs `verify.sh` against a database built from the baseline.

`src/lib/baseline.test.ts` checks without a database that the files still have their safeguards and that the list of
recorded migrations is exactly the files up to `BASELINE_THROUGH`.

## Keeping it current

A migration added after `BASELINE_THROUGH` needs nothing here: it applies on top of the baseline (CI does this) and on top
of WUWF's history. Regenerate the baseline (a Postgres 16+ server with `local-stubs.sql` applied, then
`replay-history.sh`, the clearing script and `generate.sh`; `verify.sh` to confirm) when you want newer installs to
start from newer files, and always before an upstream repository is cut. The upstream repository keeps only the
baseline as its first migration; the replay scripts here stay with WUWF's history.

# Installing the Portal for a new station

This is for a station setting up **its own** Portal: its own Supabase project, its own Vercel project, its
own domain. One deployment serves one station. It is not for WUWF, whose two projects have their own
history (`supabase/migrations/APPLIED.md`) and must never be touched by anything here.

**Status.** This guide is written against the code and checked by reading it, by tests, and by running the
clearing script's SQL against a copy of the schema. A complete install from nothing has not been done yet;
the first one will find things to correct here. Where a step depends on a dashboard, the names of settings are
given because the labels move.

You will need: a Supabase account (a new project on Postgres 17), a Vercel account, a domain, a GitHub copy
of this repository, [Node 20+](https://nodejs.org), the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
and `psql` (or the Supabase SQL editor). Docker is not needed for an install.

## 1. Create the Supabase project

Create a new project and note, from **Settings → API**: the project URL, the publishable key, and the
secret key (treat it like a password), and from **Settings → Database**: the database password and the
connection string.

In **Authentication**, set (these are not optional):

- **Allow new users to sign up: off.** Access is by invitation or by an administrator approving a request;
  nobody can create an account for themselves. (Inviting still works with sign-up off.)
- **Anonymous sign-ins: on.** Audience Listening's public page and Remote Interview's guest join both bind
  a visitor to an anonymous session; without it, pressing Begin or opening a guest link fails.
- **URL configuration:** Site URL = the Portal's address (`https://tools.your-station.org`); add
  `<that address>/auth/callback` to Redirect URLs.
- **Email:** the built-in sender is rate-limited to a few messages an hour, which is enough to try the
  invitation and not enough to run. Set up your own SMTP provider before you invite staff.

## 2. Build the database from the migrations

From `apps/portal`, with the CLI signed in:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This applies every file in `supabase/migrations/` in order to your **new, empty** project and records them
in its own history. Do **not** use `supabase/seed.sql`: it is sample data for local development.

> **Never run `supabase db push` against WUWF's projects.** Their migration history does not line up with
> the files (see `supabase/migrations/APPLIED.md`), and the CLI would try to apply nearly all of them again.

## 3. Clear WUWF's data from your new database

The migrations replay in order, and many of them insert WUWF's own clocks, schedule, rates, editorial
pillars and criteria, and Resources content. Applied migrations cannot be edited, so your database starts
with that data. Remove it, **once, now, before anyone signs in**:

```bash
psql "<your database connection string>" -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/install/clear-seed-data-for-new-station.sql
```

(Or paste the file into the SQL editor and run it.) It refuses to run if the database already has any
account or a named station, and it is one transaction, so a refusal changes nothing. Read the comments at the
top of the file for exactly what it keeps and clears. In short: the tool registry, the product's Resources
guides, Sourcework's prompts and formats and the pitch form stay; every clock, program, schedule entry,
underwriter, contract, rate, pillar, criterion, procedure and release note goes; the Academic Partnerships and
Bookings public forms are given neutral copy and closed.

**If you are not in US Central time,** set your zone in the database now. The deployment has its own setting for
the same fact (step 4) and the two must match:

```sql
update public.station_settings set time_zone = 'America/New_York' where id;
```

## 4. Deploy to Vercel

Import the repository as a Vercel project and set **Root Directory to `apps/portal`** (a dashboard setting).
Set these environment variables for Production:

| Variable                               | Value                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | the project URL                                                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key                                                          |
| `SUPABASE_SECRET_KEY`                  | the secret key — mark it **sensitive**                                       |
| `NEXT_PUBLIC_SITE_URL`                 | the Portal's address                                                         |
| `NEXT_PUBLIC_STATION_TIME_ZONE`        | your IANA zone, if not `America/Chicago` (must equal the database's)         |
| `NEXT_PUBLIC_STATION_LOGO`             | optional: a path under `public/` or an https address; default is WUWF's logo |
| `OPENAI_API_KEY`                       | needed for the assistant, Editorial Inquiry and Sourcework's analysis steps  |

Each module that talks to an outside service has its own keys (AssemblyAI for Sourcework, Daily for Remote
Interview, and so on). You do not need to memorise them: after step 6, **Administration → Tools** lists what
each module is missing. `.env.example` and the README's "Environments" section describe each one.

Point your domain at the project, deploy, and make sure the address matches the Site URL from step 1.

## 5. Create the first administrator

A new database has nobody who can sign in, and every other way of inviting someone needs an administrator.
Run this once from `apps/portal`, with the project URL and the secret key in the environment (not on the
command line):

```bash
node --env-file=.env.production scripts/bootstrap-admin.mjs \
  --email you@your-station.org --name "Your Name" --site-url https://tools.your-station.org
```

It sends the same invitation Administration → Users sends, with the administrator role. Open the link in the
email; the account becomes active the first time you sign in. The script refuses to run if the database
already has an administrator or an account for that email, so it cannot add a second administrator behind
the app's back: after the first, invite people from Administration → Users.

## 6. Set up the station

Signed in as the administrator:

1. **Administration → Station.** Enter your station's name, short name, call sign, city, support email and the
   line under public forms. Add a notice for public pages if your licensee needs one. If you will use On Air
   weather, enter the studio's latitude and longitude and the counties whose alerts you relay. Nothing falls
   back to another station's name: what you leave empty reads neutrally ("the station").
2. **Administration → Tools.** Switch on only the modules you will use. The page refuses to enable a module
   whose required module is off (Traffic needs On Air; Editorial Inquiry needs Editorial Planning) and shows
   any keys a module is missing. Leave **Bookings** and **Academic Partnerships** off for now: their screens
   still say "WUWF" and model a university licensee. Leave **Website** off unless you run the Payload site.
3. **Administration → Users.** Invite your staff and give each person access to the tools they need.
4. **Editorial Planning → Settings** (if you use it). Define your coverage pillars and criteria. The pitch form
   needs at least one pillar before anyone can pitch. These were cleared in step 3 on purpose: they are your
   editorial policy, not the product's.
5. **On Air and Traffic** (if you use them). Build your clocks and programs (Programs and Clocks), or import a
   day's program log. Traffic places credits into the inventory On Air defines, so On Air comes first.

## 7. Check it worked

- The sign-in page and the browser tab say your station's name, and the page footer notice is yours or absent.
- Administration → Tools shows no unexpected "missing" keys for the modules you switched on.
- Administration → Station shows no time-zone warning.
- Resources → Help guides are present (the product's guides); there are no WUWF procedures or release notes.
- Audience Listening, if used: open a query's public page in a private window and press Begin (this proves
  anonymous sign-ins are on).

## Upgrading

Upgrading an installed station (checking out a newer release, `supabase db push`, deploying) is not written
up yet, because there are no releases to take. It arrives with the upstream repository.

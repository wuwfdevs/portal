# Roadmap and handoff

This file is how a new session picks up without the previous conversation. Rules live in `CLAUDE.md`; design in
`ARCHITECTURE.md`; the event spec in `ANALYTICS.md`. This file holds **state, order of work, and lessons**.
Keep it current: update it in the same commit as the work.

Branch: `claude/new-session-x1z9so` in `wuwfdevs/portal`. The brief this follows (the "project brief") and the
design canvas are described under *Sources* below.

## Where things stand (Milestone 1)

| Area | State |
|---|---|
| Workspace conversion (Portal to `apps/portal`, pnpm) | **Done**, verified identical to baseline |
| Payload Website starter in `apps/site`, PostgreSQL | **Done**; boots, typechecks |
| Shared packages (design-tokens, listening-core, content-blocks, portal-contracts) | **Done**, 167 tests |
| Content model, staff roles, access control | **Done**, integration-tested |
| Underwriting resolution + Coastal Futures / Example Foundation demonstration | **Done**, 26 unit + integration tests |
| Initial production migration | **Done**; matches the dev push exactly |
| Docs (README, ARCHITECTURE, ANALYTICS, this file) | **Done** |
| Staff sign-in from the Portal: Portal half (`website` registry row + token route) | Not started |
| Staff sign-in: site half (verify, provision user, refuse reused `jti`, session) | Not started |
| Publish-candidates endpoint (+ status webhook) | Not started |
| Homepage, article, fellowship hub, giving page (boards 1–4, 14) | Not started |
| Audience listening: collections, flow, private storage, staff review | Not started |
| Analytics foundations | Spec only (`ANALYTICS.md`) |
| Supabase Auth, audience profile + RLS, passwordless sign-in, entitlements model | Not started |
| Starter lint errors (Header, Card, Theme provider) | Known, to fix when rebuilt |

Milestones 2–4 are unchanged from the project brief (shows platform and Barefoot Mary, member feeds, the
listening hub, short video, sponsorship section and measurement, membership sync, intelligent publishing). Nothing
in them has been started.

## Next, in order

1. **Node.** Run the toolchain on a Node Payload supports (`^22.23.4` or `>=24.22.1`); pin it for Vercel
   (`.node-version` / project setting). Re-run the Portal and site checks on it.
2. **Portal migration** adding the `website` tool-registry row (`status = 'available'`,
   `default_access = 'invite_only'`, stacking roles `editor`, `publisher`, `administrator`, `sponsorship`,
   `membership` via `tool_access.tool_roles`, the shape On Air and Bookings use) plus a Resources release note.
   Write it, apply to **preview first**, verify, then production; record both dates in
   `apps/portal/supabase/migrations/APPLIED.md`; `pnpm db:check`. The owner has approved applying it.
3. **Portal token route** (`apps/portal`): authorizes via the existing tool-access check, mints
   `mintIdentityToken` for the signed-in profile, redirects to the site. Audited. Follow the Portal's rules.
4. **Site sign-in route:** verify with `verifyIdentityToken`; store `jti` (a table with a unique constraint and
   a short expiry sweep) and refuse a second use; upsert the Payload user by `portalUserId`; set `roles` from the
   token; start a Payload session. Test: replay refused, expired refused, role escalation by edit refused.
5. **Publish-candidates endpoint:** verify `verifyRequestSignature`; `parseContentDocument`; create a draft or add
   a version for the same `pieceId`; return `PublishCandidateResponse`. Store provenance. Strip nothing at
   write time; strip editor notes at render time with `toPublicDocument`.
6. **Pages**, built to the boards with `@wuwf/design-tokens`: wire the tokens into the site's CSS first
   (replace the starter's Header/Card/Theme provider, fixing their lint errors), then homepage, article,
   fellowship hub, giving. Every acknowledgment through `getAcknowledgments`, fetched inside a cache entry using
   `resolveUnderwriting(...).tags`.
7. **Listening:** collections (no public read), server actions with Local API writes, signed upload URLs to a
   private bucket, the Inline ask then the full flow, staff review in Payload.
8. **Analytics foundations** per `ANALYTICS.md`.
9. **Supabase Auth** with `@supabase/ssr`, audience profile + RLS, entitlements with manual grants.
10. Final pass: acceptance criteria (project brief §17), browser verification at phone width, update every doc.

## Lessons (these cost real time)

- **Never use one shared pnpm lockfile.** It made pnpm resolve the Portal's optional peers from the site
  (esbuild, sass, tsx, `@playwright/test`), changing how Portal tests were transpiled; 6 failed with empty error
  messages while every resolved version stayed identical. `sharedWorkspaceLockfile: false`. After any change to
  `pnpm-workspace.yaml`, run the **Portal's** full test suite.
- **Payload's slug field fails programmatic creates.** It generates the slug in `beforeChange`, after the
  `required` check; the admin UI hides this by pre-filling in the browser. `ensureSlug` (beforeValidate) fixes
  it. Use it on any collection with `slugField`.
- **`next/cache` throws outside a Next request** ("static generation store missing"). Use `src/lib/revalidate.ts`
  in hooks, never `next/cache` directly.
- **Next's dev server rewrites `AGENTS.md`/`CLAUDE.md` in the app.** `apps/site/CLAUDE.md` starts with
  `@AGENTS.md` for that reason; commit the generated block.
- **Template versions:** use the release tag's template, not `main`. `create-payload-app` could not be used (the
  git host's tarball URL is blocked); the template was cloned with git and `workspace:*` versions replaced with
  `3.92.1` by hand.
- **Starter lint:** `FlatCompat` crashes with eslint-config-next 16; the config uses its native flat exports.
- **Don't dump package sourcemaps** when reading dependency code; grep the `.js`, not the `.map`.
- **`pkill -f` can kill your own shell** if the pattern is in the command line.
- A passing test proves little until you have broken the code and watched it fail. The underwriting tests were
  mutation-checked.

## Running things in a fresh sandbox

The sandbox is ephemeral; nothing below survives. Postgres 16 is installed but not running, and it will not run
as root:

```bash
D=/var/tmp/wuwf-site-pg; PGBIN=/usr/lib/postgresql/16/bin
mkdir -p $D && chown postgres:postgres $D
su postgres -c "$PGBIN/initdb -D $D -U wuwf --auth=trust -E UTF8"
printf "port = 5433\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '/var/tmp'\n" > $D/postgresql.auto.conf
chown postgres:postgres $D/postgresql.auto.conf
su postgres -c "$PGBIN/pg_ctl -D $D -l $D/log.txt -w start"
psql -h 127.0.0.1 -p 5433 -U wuwf -d postgres -c "create database wuwf_site;" -c "create database wuwf_site_test;"
```

Then `pnpm install` at the root and create `apps/site/.env.local` from `.env.example` (`DATABASE_URL=postgresql://wuwf@127.0.0.1:5433/wuwf_site`).

## Needs the owner (cannot be done from the repository)

- **Vercel, Portal project:** set Root Directory to `apps/portal` **at merge time**, not before (the default branch
  still has the old layout). Until then this branch's Portal preview build fails.
- **Vercel, new project for the site:** Root Directory `apps/site`, Node pinned, own env vars.
- **Not yet confirmed:** that Vercel's install handles one lockfile per project in a pnpm workspace. Check the
  first preview build.
- **A Supabase project for the site** (separate from the Portal's two) and its keys.
- WUWF's own numbers marked `[N]` on the sponsorship boards, and unpriced products marked `[Rate]`.
- Legal and university review (IT-04 notice, privacy, retention) before production.

## Sources

- The project brief (revised) for this work, supplied by the owner.
- Design canvas "WUWF.org Home Redesign" (26 boards) and the "WUWF Design System" (claude.ai artifacts named in the
  brief). Read: boards 1–6, 14, 15, the phone homepage, the tokens. **Not yet read:** the Grove migration memo, the
  RadioLive site canvas, and boards 7–13 and 16–25 (Milestone 2–3 material).
- The Portal: `apps/portal/CLAUDE.md`, `docs/audience-listening-design.md`, `docs/underwriting-design.md`,
  `docs/ui-patterns.md`, `docs/logic-patterns.md`.
- `wuwfdevs/barefootmary` (content and identity for the first themed show, Milestone 2) — not read yet.

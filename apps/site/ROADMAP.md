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
| Shared packages (design-tokens, listening-core, portal-contracts) | **Done**, tests in each |
| Visual foundation: tokens → CSS, self-hosted fonts, header/footer driven by their globals, no dark theme | **Done**; checked in a browser at 1440 and 390 px |
| Article page (board 3) with the acknowledgment panel | **Done**; checked in a browser, and the edit-the-agreement loop verified on a production build |
| Content model, staff roles, access control | **Done**, integration-tested |
| Underwriting resolution + Coastal Futures / Example Foundation demonstration | **Done**, 26 unit + integration tests |
| Initial production migration | **Done**; matches the dev push exactly |
| Docs (README, ARCHITECTURE, ANALYTICS, this file) | **Done** |
| Staff sign-in: Portal half (`website` registry row, access predicate, audit policy, `/website` token route, roles) | **Done**; migration applied to preview and production (2026-10-30). Tool is registered **disabled** |
| Staff sign-in: site half (verify, refuse reused `jti`, sync account, session cookie + strategy, revocation) | **Done**, 27 tests incl. replay, race, takeover, tampering |
| Sourcework-to-CMS publish channel | **Deferred and removed** (owner decision, 2026-10-30); see *Deferred* below |
| Homepage, article, fellowship hub, giving page (boards 1–4, 14) | Not started |
| Audience listening: collections, flow, private storage, staff review | Not started |
| Analytics foundations | Spec only (`ANALYTICS.md`) |
| Supabase Auth, audience profile + RLS, passwordless sign-in, entitlements model | Not started |
| Starter lint errors (Header, Card, Theme provider) | **Fixed** (components replaced); 3 warnings remain in the starter's e2e tests |

Milestones 2–4 are unchanged from the project brief (shows platform and Barefoot Mary, member feeds, the
listening hub, short video, sponsorship section and measurement, membership sync, intelligent publishing). Nothing
in them has been started.

## Next, in order

1. ~~**Node.**~~ Done: 22.23.4 (the Payload minimum) pinned in `.node-version`/`.nvmrc`, and `engine-strict`
   in the root `.npmrc` makes an unsupported Node fail the install. Portal, site and packages all re-verified on it.
   Still to do on Vercel: set the project's Node version to 22.x for both projects.
2. ~~**Portal migration**~~ Done and applied to both projects (`20261105140000_website_tool_registry.sql`). The tool
   is registered `available` but `enabled = false`, so the dashboard card reads "Unavailable". **At launch:** an
   administrator enables it at `/admin/tools`, and the Resources release note ships in the same step (it was
   deliberately not written yet: announcing a tool nobody can open adds noise to "What's new").
3. ~~**Portal token route**~~ Done: `apps/portal/src/app/(portal)/website/route.ts`. Needs `WEBSITE_ORIGIN` and
   `WEBSITE_IDENTITY_SECRET` set in the Portal's environment (see its `.env.example`); unset, it answers that sign-in
   "isn't set up on this server yet" and logs why. The site must hold the same secret as `PORTAL_IDENTITY_SECRET`.
4. ~~**Site sign-in route**~~ Done (`src/lib/portal/`, `src/app/api/portal/sso/route.ts`, `portal-sign-ins` collection).
   Needs `PORTAL_IDENTITY_SECRET` (= the Portal's `WEBSITE_IDENTITY_SECRET`). Create the break-glass admin first.
5. **Pages**, built to the boards with `@wuwf/design-tokens`. Done: the foundation, the article. **Next: the
   fellowship hub** (`/fellowships/[slug]`, board 4: the article's "About the fellowship" and "Explore the project"
   links already point at it), then **giving** (`/support`, board 14: the header's Donate and the article's
   appeal point at it), then the **homepage** (boards 1-2, editor-curated placements, no hard-coded arrays, and
   emergency coverage as a first-class state). Every acknowledgment through `getAcknowledgments`.
6. **Listening:** collections (no public read), server actions with Local API writes, signed upload URLs to a
   private bucket, the Inline ask then the full flow, staff review in Payload.
7. **Analytics foundations** per `ANALYTICS.md`.
8. **Supabase Auth** with `@supabase/ssr`, audience profile + RLS, entitlements with manual grants.
9. Final pass: acceptance criteria (project brief §17), browser verification at phone width, update every doc.

## Deferred

- **Sourcework-to-CMS publish channel** (owner decision, 2026-10-30). Designed and built, then removed: the
  `packages/content-blocks` package (a strict block schema and parser, with editor notes that could never publish)
  and the publish/status/transcript-delivery messages in `portal-contracts`. Nothing used them. The last commit that
  contains them is `1936171`: `git show 1936171:packages/content-blocks/src/parse.ts`. Do not rebuild without a new
  instruction. The open design question was whether a piece's blocks become Lexical rich text with an `audioExcerpt`
  block (one editing experience, some structure lost) or are kept as received with their own renderer (lossless,
  edited differently); editor notes must be stored apart from public content either way.

## Known gaps in what exists

- The article page is built to board 3 except: the "This story started with your answers" strip, the audio player
  button and the inline listening ask (listening and the player are later work), the sponsor message unit
  (Milestone 3), and the pull quote and inline audio excerpt (they have no editor block yet).
- The acknowledgment's "Our editorial independence policy" link shows only once an administrator sets the page in
  **Site settings**; until then it is absent rather than a link to nowhere.
- A story previewed as an unsaved draft does not show its acknowledgment (it resolves from the saved story).
- **"Listen live"** is deliberately not in the header: it would be a button that does nothing until the persistent
  player exists (Milestone 2). Do not add it as a link to nowhere.
- The header links only to pages that exist. The boards' full navigation (Podcasts, Video, RadioLive, Unearthing
  Florida, WUWF Listens, The Voyager) arrives with those pages, as header-global entries.
- Dev-mode Payload pushes schema changes and can stop at an interactive prompt (a script then hangs silently with
  its database session idle). Rebuild a dev database with `pnpm payload migrate` on an empty one instead.

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
- **A public read of a story cannot populate agreements** (they are staff-only), so a page that resolves its
  own acknowledgment shows none, silently. Caught in a browser, not by a type or a unit test; the page now uses
  `getAcknowledgments` and a test pins the boundary.
- **Test caching on a production build.** `pnpm dev` re-renders every request, so it cannot show whether a page
  refreshes. `pnpm smoke:agreement` does it properly.
- **A script run outside Next does not load `.env.local`, and Payload reads its secret when the config module is
  evaluated**, so load the environment, then `await import()` the config (see `scripts/seed-demo.ts`).
- **`next/image` only serves what `images.localPatterns` allows** (the starter allows `/api/media/file/**`). A new
  static image needs a pattern, or every page that renders it returns 500. Typecheck cannot catch it; a browser does.
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

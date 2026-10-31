# Architecture

Each section is marked **Built** (exists and is tested), **Specified** (designed, not built) or **Planned**.
Product decisions are in `CLAUDE.md`; this file says how the parts fit together.

## The system

```
 WUWF Portal (apps/portal)                          WUWF.org (apps/site)
 staff tools, own Supabase projects                 one Next.js app, own Postgres
 ┌──────────────────────────┐   signed contracts    ┌─────────────────────────────────┐
 │ tool registry: `website` │ ───── identity ─────▶ │ Payload auth strategy            │
 │ Sourcework pieces        │ ── publish candidate ▶│ draft + versions                 │
 │ Sourcework transcription │ ◀─ transcription req ─│ audience answers / episode audio │
 │ Traffic (dayparts)       │ ◀── daypart names ───▶│ sponsorship rate card            │
 └──────────────────────────┘                       └─────────────────────────────────┘
          shared only through packages/ (pure TypeScript):
          design-tokens · listening-core · portal-contracts
```

The apps share **no database, deployment or dependency resolution** (each project has its own lockfile; see the
root `CLAUDE.md` for why). They exchange only the contracts below, never table reads.

## Three domains (Built as collections; Specified for the rest)

Share identifiers, not tables. Join through ids.

1. **Editorial publishing** — posts, pages, contributors, publishing identities, topics, fellowships,
   series, productions, media. *Built.*
2. **Audience identity and participation** — Supabase Auth accounts, audience profile, listening queries,
   submissions, answers. *Specified* (the rules package is built; the collections and flow are not).
3. **Commercial** — sponsors, underwriting agreements *(built)*; campaigns, placements, products, delivery
   commitments, measurement, entitlements, membership feeds *(specified)*.

## Content relationships (Built)

```
Post ──▶ Fellowship ──▶ Agreement[] ──▶ Sponsor        only fellowships, series and productions
     ──▶ Series     ──▶ Agreement[] ──▶ Sponsor        can carry an agreement
     ──▶ Production ──▶ Agreement[] ──▶ Sponsor
     ──▶ Topic (categories)                            navigation only, never underwritten
     ──▶ Publishing identity                           attribution only, never underwritten
     ──▶ Contributor[]                                 public bylines (not staff users)
```

A story is attached to collections, never given a pasted sponsor line.

## Underwriting resolution (Built)

`src/lib/underwriting/resolve.ts`, pure. Input: a content item with the collections it belongs to and each
collection's agreements, plus a placement and a timestamp supplied by the caller. Output: the lines to show, the
overflow, and cache tags.

- Only fellowships, series and productions count. One line per agreement, however many routes reach it.
- Order: fellowship, then series, then production; then earlier start date; then id. Two lines inline at most;
  the rest go to the hub page.
- **Recognition** agreements are decided by the content's *publication date*: work published during the term
  carries the line forever; work before or after does not. **Campaign** agreements are decided by *now*.
- An agreement applies only to the formats and placements it names. Promo cards use the short form.
- A draft carries no recognition.

`load.ts` maps populated Payload documents onto this and treats an unpopulated relationship as absent.

**Cache invalidation (Built, verified against a production build):** articles are pre-rendered and refreshed by *path*. An
edit to an agreement, or to what a fellowship/series/production points at, runs `lib/underwriting/invalidate.ts` to
find every story and hub page it reaches (through the funded collections that carry the agreement) and
revalidates exactly those paths, so one edit updates every affected page and nothing else. The article page also
revalidates hourly (a campaign agreement starts and stops by date, and a *deleted* agreement can no longer name the
pages it reached). Hooks go through `src/lib/revalidate.ts`, which logs instead of throwing outside a Next request.
`pnpm smoke:agreement` runs the whole loop against a running production build.

**Pages must resolve acknowledgments server-side.** Agreements are not readable by the public, so a public read of a
story returns a fellowship whose `agreements` are bare ids. The article page therefore calls `getAcknowledgments`
(which reads with server access and returns only the approved line); a page that resolved from its own public read
would silently show no acknowledgment. An integration test pins that boundary.

## Staff identity and access (Partly built)

- **Built:** roles on `users` (`editor`, `publisher`, `administrator`, `sponsorship`, `membership`), mapped to
  permissions by `@wuwf/portal-contracts`. Collections check permissions, not role names. Nobody can grant
  themselves a role. The first user created in Payload is the break-glass administrator.
- **Built (package):** the identity token — HS256, algorithm fixed in code, issuer/audience/lifetime (≤120 s) and
  clock skew checked, a `jti` on every token.
- **Built (both halves):** the Portal's `/website` route mints a 60-second token (audited as `website.sso.opened`) and
  redirects to `/api/portal/sso` on the site. That route verifies it, **records the `jti` under a unique
  constraint and refuses any second use** (including simultaneous ones), syncs the account, and sets a signed
  HttpOnly session cookie (8 hours) that a custom Payload auth strategy accepts. Payload's own login stays for the
  break-glass administrator.
- **Linking rule:** a Portal identity is linked to a CMS account by the Portal's profile id, never by email. An
  existing unlinked account with the same email is not taken over; the sign-in is refused (403) for an
  administrator to resolve. Roles are replaced wholesale on every sign-in, so a role revoked in the Portal
  disappears at the next one.
- **Revocation:** a session issued before the user's `sessionsValidAfter` is dead. Logout sets it, and an
  administrator can set it to sign someone out everywhere. Access the Portal revokes otherwise lasts at most the
  8-hour session. An account with no roles cannot enter the admin.
- **Not yet done:** the tool is registered but disabled in the Portal until launch; no browser-level check has been
  made of the redirect between two real deployments.

## Contracts with the Portal

All typed in `packages/portal-contracts`, signed server to server, versioned (`x-wuwf-contract-version`), one
secret per channel and direction (≥32 characters). Requests are signed over version, method, path, timestamp and a
hash of the exact body; the window is 5 minutes.

| Channel | Direction | Status |
|---|---|---|
| Identity token | Portal → site | package built; both routes specified |
| Transcription request | site → Portal | Milestone 2; request/response types only (the shape of the returned transcript is not designed yet) |
| Traffic daypart names | shared vocabulary | specified |

There is **no Sourcework-to-CMS publish channel** (deferred by the owner, 2026-10-30; see `ROADMAP.md`). Its block schema
and messages were designed, built and then removed rather than left as dead code.

## Audience listening (Specified; rules Built)

`@wuwf/listening-core` holds the Portal's pure rules (115 tests, ported). The site models queries, questions,
submissions and answers in Payload with **no public read access**. Public writes go through server actions and
route handlers that validate on the server and use the Local API (the equivalent of the Portal's
security-definer functions) — never Payload's REST API. Participants use a Supabase anonymous session; audio goes
straight to a **private** bucket through signed upload URLs scoped to the participant's submission, with size and
type enforced. Rules carried from the Portal: answers snapshot their question's wording and position; one
in-progress submission per participant per query and three in total; duration and size caps at completion;
open/close dates checked on every write; wording editable after responses exist, removal and reordering not.

## Membership and entitlements (Specified)

Entitlements (who holds which level, on which scope, from which source, with an expiry) are separate from
payment records; access checks read entitlements only. Until a sync from the membership database exists, staff
grant them by hand in Payload. Private feeds are per-person tokenized RSS per show, revocable by reset. The site is
not the ledger: gifts are made on WUWF's donation form with an attribution code. Never link an account to a donor
record on an email match alone.

## Identities that stay separate

Authentication (Supabase) · audience profile (this app, keyed to the Supabase user id, RLS) · behavioral
analytics (consent-governed) · membership and giving (the membership database) · staff (Payload).

## Design system (Built as tokens)

`@wuwf/design-tokens` carries the WUWF Design System palette, type scale, spacing, radii and shadows, a CSS-variable
generator, scoped per-show theme overrides (values validated so a theme cannot break out of a declaration), and a
contrast helper whose tests pin the design system's own accessibility notes. The values must stay equal to the
Portal's `src/lib/design-tokens.ts`. The site's Tailwind/CSS is not yet wired to it.

## Migrating from Grove, and body-block flexibility (Partly built; mostly Specified)

Source: the owner's memo *Grove to Payload: Archive Portability and Migration Feasibility* (2026-10-16). It
recommends **not committing to a replacement until a read-only proof of concept passes four gates** (completeness,
media, fidelity at 95% of sampled bodies, and NPR's written permission), and treating the new site as a pilot beside
Grove until then. This section is what the site does so it can take Grove's content without loss when that
happens. It is *not* a migration; none has been run.

**The memo's own rank-8 risk is the one this site has to design for:** body fidelity loss (embeds, galleries, pull
quotes, inline images dropped in HTML conversion), likelihood High. Its mitigation is custom block mapping, and
**unmapped content preserved, never dropped**.

| | State |
|---|---|
| Story and page bodies are Lexical, which takes custom blocks (`BlocksFeature`); starter blocks Banner, Code, Media | Built |
| `legacy.legacyPath` and `legacy.nprId` on posts and pages, unique and indexed (stable identity; a re-run cannot duplicate) | Built, tested |
| `source` on posts (`wuwf`, `npr`, `wire`): NPR and wire stories are not WUWF's to archive separately or alter | Field built; **read-only enforcement not built** |
| Redirects plugin (from, to) in the starter, for the Grove-path redirect map | Built (starter); the import is not |
| Block inventory from a real sample of Grove pages | **Not done**; needs wuwf.org access (blocked in the build sandbox) |
| Body blocks for parity with Brightspot's documented rich-text elements: Gallery, Pull quote, Embed, Promo, Preserved HTML (see the table below) | **Built and tested**; tuned against the real archive later |
| Importer: snapshot → upload media → `convertHTMLToLexical` with per-block converters → render diff | **Not built** |
| Timestamps preserved from the source, never import time; podcast feed URLs, GUIDs and enclosures preserved | Specified |
| CDS sync for NPR content (poll inbound, PUT outbound; NPR items read-only, re-pulled, never archived separately) | Specified (Milestone 3) |

**Body blocks (built).** Parity target: the rich-text elements Brightspot documents. Brightspot's docs could be read
only through search summaries (the pages themselves are blocked from the build sandbox), and Grove is a customised
instance whose Studio is behind a login, so this is a *documented-capability* inventory, not yet a *Grove-actually-uses*
inventory. Checking it takes about five minutes in Grove: open any story in the editor and list the large toolbar
buttons and the module picker.

| Brightspot element | Here | Notes |
|---|---|---|
| Image | Media block (starter), with caption and credit on the media | |
| Gallery (basic, advanced; list or grid) | **Gallery** block: title, grid or list, images with caption and credit | Dynamic galleries (by tag, date, site) not built |
| Pull quote (text, attribution, image) | **Pull quote** block | |
| Video | **Embed** block (YouTube, Vimeo); hosted video later | Grove video is embed-only (memo §C) |
| HTML embed, Iframe | **Embed** block: a URL plus an allowlist, never free HTML | Spotify, Apple Podcasts, SoundCloud built in; any other host must be approved in Site settings; https only; checked on save and on render |
| Promo | **Promo card** block: points at a story, page or fellowship, showing its current headline | |
| List, Video playlist | Not built | Lexical lists exist; a playlist is several embeds |
| Ad | **Deliberately not migrated** | No ads inside story text (site rule) |
| Table, audio player, social posts | Not built / unknown | Needs the Grove inventory |
| Anything unmappable | **Preserved HTML** block | Sanitized on save and on render; administrators only; see below |

**Preserved HTML is the one place the site renders HTML from a string.** `lib/sanitize.ts` keeps typographic structure
(paragraphs, headings, lists, quotes, tables, https images, links) and removes scripts, styles, frames, forms, handlers,
inline styles and any non-https image or `javascript:`/`data:` link. Verified in a browser against deliberately
hostile input: no script, frame, handler or `javascript:` link reached the page and no alert opened. Because
Payload does not apply a block's field-level access inside a rich-text field (found by test: an editor could write
it), the administrators-only rule is a document-level hook comparing the incoming body with the stored one
(`lib/legacy-html-guard.ts`); a save with no signed-in user (the importer) is allowed.

**Decisions the block set still needs (open):**

1. *Inventory first.* Which Grove components actually occur, in what share (memo §G samples about 100 items:
   10 with embeds or galleries, 10 podcast episodes, 10 events, 10 NPR-sourced, 10 older, 10 from the 2022 migration
   window, 10 with redirects). Building blocks before this is guessing.
2. *Raw-HTML fallback:* **decided and built** (sanitize allowlist, administrators only). What remains is how much of a
   typical old body falls into it; the fidelity gate measures that.
3. *Embeds:* **decided and built** (URL plus allowlist). What remains is which other hosts the archive actually uses,
   so they can be approved up front.
4. *URL scheme.* `/posts/[slug]` is a placeholder. The memo advises keeping Grove's path pattern so most redirects
   are identity; the Content Report's `path` column shows what that pattern is. Either way every Grove path gets a
   redirect from `legacyPath`.
5. *Pilot beside Grove vs. replace* is the owner's call, per the memo's gates. The site is built to run in parallel.

## Platform (Specified)

Vercel (own project, root `apps/site`), Supabase (own project) for Postgres, Auth and Storage; Payload's storage
adapter against Supabase's S3-compatible endpoint, private buckets for audience audio. Analytics and error
reporting behind interfaces. The site must stay usable if analytics, sponsorship serving or personalization is
down; emergency coverage is a first-class homepage state.

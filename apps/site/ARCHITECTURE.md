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
          design-tokens · listening-core · content-blocks · portal-contracts
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

**Cache invalidation (Built):** every result carries tags (`agreement:<id>`, `collection:<id>`, `content:<id>`).
Hooks on agreements and funded collections call `revalidateTag` for them, so one edit refreshes every page that
resolved through it. Pages that render an acknowledgment must fetch through a cache entry using those tags
(*Planned*: no public page does yet). Revalidation goes through `src/lib/revalidate.ts`, which logs instead of
throwing outside a Next request.

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
| Publish candidate (`ContentDocument`) | Portal → site | schema + strict parser built; endpoint specified |
| Publish status webhook | site → Portal | message type built; endpoint specified |
| Transcription request / transcript delivery | site ↔ Portal | message types built; endpoints specified |
| Traffic daypart names | shared vocabulary | specified |

A publish candidate creates a CMS draft and returns its id and admin URL. A later send of the same piece adds a
version and never overwrites. The parser refuses rather than repairs and returns every problem. **Editor notes
never publish:** the only way to render blocks is through `publicBlocks` / `toPublicDocument`.

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

## Platform (Specified)

Vercel (own project, root `apps/site`), Supabase (own project) for Postgres, Auth and Storage; Payload's storage
adapter against Supabase's S3-compatible endpoint, private buckets for audience audio. Analytics and error
reporting behind interfaces. The site must stay usable if analytics, sponsorship serving or personalization is
down; emergency coverage is a first-class homepage state.

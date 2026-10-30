@AGENTS.md

# CLAUDE.md — apps/site

Guidance for Claude Code (and future human developers) working on WUWF.org. Workspace rules are in the
root `CLAUDE.md`; the Portal's are in `apps/portal/CLAUDE.md` and **do not apply here** (its design-token,
UI-primitive, migration-ledger and Resources-release-note build rules scan `apps/portal` only).

## What this is

The public website of WUWF Public Media (the NPR member station at the University of West Florida,
Pensacola), replacing the Grove platform. It is **one Next.js app**: Payload CMS's content model, admin
and the public frontend live together, as Payload's Website starter ships them, so a schema change and the
screens that render it are always in one place. Do not split the admin out, and do not move the CMS into
the Portal.

It is built on Payload's official Website template, pinned to the **v3.92.1 release tag** (not `main`,
which runs ahead of the published packages). Next and Payload versions here are this app's own; never
change them to match the Portal, and never touch the Portal's dependencies from here.

## Decisions that are made (do not reopen)

The reviewed design canvas ("WUWF.org Home Redesign", 26 boards) and the WUWF Design System are the source
for layout, copy and tokens. Where the brief and the boards differ, the boards win on layout and copy.

- Shows live at `wuwf.org/shows/<slug>`; a marketing domain (e.g. barefootmary.com) redirects into it.
- **There is no podcast subscription product.** Supporting a show means becoming a WUWF sustaining member;
  member benefits arrive as private podcast feeds. The language is "donate to get", never "subscribe".
- Audience listening is native to this site, not an embed of the Portal's tool; it reuses the Portal's
  logic through `@wuwf/listening-core`.
- Sponsorship is sold by the sponsor's objective. Digital is a small set of fixed, labeled, direct-sold
  placements, not an ad network: **no leaderboards, no autoplay, no pop-ups, no third-party tracking.**
- **No polls or public tallies on open listening questions. No "sponsor-free" claims about WUWF originals.**
- Asking for member support on a page that carries a sponsor message is fine.
- The site is **not the ledger**. Gifts are made on WUWF's donation form; membership status comes from
  WUWF's membership database.
- The Portal is the identity provider for the CMS admin. A break-glass local Payload administrator exists;
  Payload's own login is for that account only.

## Boundaries

Three domains share identifiers without tight coupling: **editorial content**, **audience identity and
participation**, and **commercial (sponsorship, membership)**. Do not let one reach into another's tables;
join through ids. Third-party integrations sit behind interfaces so they can be replaced.

Five identities stay distinct and are linked only by verified relationships: authentication (Supabase),
audience profile (this app, keyed to the Supabase user id), behavioral analytics (consent-governed),
membership/giving (the membership database), and staff (Payload). **Never link an account to a donor
record on an email match alone.**

Nobody must register to read, listen, subscribe to a newsletter, answer a listening question or give.

## Contracts with the Portal

Documented, versioned, signed server to server, typed in `packages/portal-contracts`; never a read of the
Portal's tables. Both halves live in this repository.

- **Identity** (Portal → site): a short-lived signed token (`mintIdentityToken` / `verifyIdentityToken`),
  verified here, mapped to Payload users and roles. The site must record each token's `jti` and refuse a
  second use.
- **Publish candidates** (Portal → site): **deferred; there is no Sourcework-to-CMS export for now** (owner
  decision, 2026-10-30). `packages/content-blocks` and the message types exist as dormant, tested definitions.
  Do not build an endpoint without a new instruction. If it is built: a draft per piece, later sends add
  versions, and **editor notes never publish** (go through `toPublicDocument`/`publicBlocks`).
- **Transcription** (site → Portal): Milestone 2; a signed request. Message types exist, no endpoint.
- **Traffic**: on-air sponsorship uses Traffic's daypart names (Morning Drive, Afternoon Drive, Midday,
  Weekend, Total Program Rotation, Carpool).

Use a distinct signing secret per channel and direction. Secrets are at least 32 characters.

## Underwriting rules

Model: content → fellowship / series / production → underwriting agreement → sponsor. Editors **attach**
content to collections; the acknowledgment comes from the agreement record, so changing the wording
updates every page. Nobody pastes a sponsor line into a story.

- One line per agreement, deduplicated across collections; fellowship before series; two at most (a third
  goes to the hub page).
- Dates are enforced: work published during the term carries the line forever; work published after it
  ends does not.
- Kept visibly separate from reporting: sans type on a neutral panel labeled "Support for this reporting",
  linked to the editorial independence policy. Never in a sponsor's brand colors.
- Topics and shows' own attribution are navigation/identity, never underwritten.

The resolution logic is pure and tested independently of presentation.

## Listening rules

Staff read and review listening data **in Payload only**; public read access to those collections is
none. Public writes do **not** go through Payload's REST API: they go through server actions and route
handlers that validate on the server and write with the Local API (the equivalent of the Portal's
security-definer functions). Answers snapshot their question's wording and position; one in-progress
submission per participant per query, at most three in total; duration and size caps enforced at
completion; open/close dates checked on every write. Audio goes directly to a **private** bucket through
signed upload URLs scoped to the participant's submission. One listening component per page. Every send
names who receives it; nothing promises a reply. Participant identity is a Supabase anonymous session.

## Privacy

Collect the minimum. Analytics are consent-aware; never put raw user text or audio in analytics or logs;
sponsors receive aggregates, never personal data. Public pages that collect information carry the UWF IT-04
policy notice. Service-role credentials stay server-side; privileged Local API operations enforce
authorization themselves rather than relying on RLS.

## Database

PostgreSQL, **this app's own** Supabase project in hosted environments — never the Portal's two projects.
Locally: `pnpm db:up` (docker compose, port 5433) or any Postgres 16 at `DATABASE_URL`. In development
Payload pushes schema changes; **production runs only committed migrations** (`src/migrations`, created
with `pnpm payload migrate:create`). Never run a destructive database operation without being asked.

## Commands

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test:int` (Vitest) · `pnpm test:e2e`
(Playwright) · `pnpm generate:types` · `pnpm generate:importmap` · `pnpm db:up` / `pnpm db:down`.
After changing a collection, run `pnpm generate:types` and `pnpm generate:importmap` and commit the output.
Run typecheck, lint and tests before calling a change done.

## Engineering rules

- Strict TypeScript and generated CMS types. Loading, empty and error states on every data screen.
- Server-side validation of all public input. Access control on every collection and every route.
- Logic separate from presentation: pure, tested modules for publishing, revenue, entitlement and
  listening logic; components stay thin.
- Colours, type and spacing come from `@wuwf/design-tokens`; no one-off hex values or pixel sizes.
- Accessible by default: real buttons and links, labelled controls, 16px minimum on any focusable text
  field on a phone, touch targets of at least 44px, text contrast of at least 4.5:1.
- The site must stay usable if analytics, sponsorship serving or personalization is down. Emergency
  coverage is a first-class state of the homepage.
- Distinguish what is implemented from what is a demonstration. Incomplete integrations are represented
  honestly, never faked.
- Do not deploy to production, apply migrations to the Portal's Supabase projects outside its ledger, send
  live communications, or create paid services without authorization.

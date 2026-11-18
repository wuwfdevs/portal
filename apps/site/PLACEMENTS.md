# Sponsor and promo placements

The design of the fixed places on wuwf.org where a sponsor message or a house promotion sits, what is built, and what is deliberately not.
Rules live in `CLAUDE.md`; state and history in `ROADMAP.md`. The registry is `src/lib/placements/registry.ts`; this file explains it.

## What a placement is

A placement is a **fixed, named place in a page's layout** that holds one sponsor's message or one of WUWF's own promotions. It is sold
directly by corporate support (`/sponsor/digital` is the price list), not by an ad network.

Rules every placement follows (they restate `CLAUDE.md`, "Decisions that are made", and the digital sponsorship page's promises):

- **Fixed and labeled.** The same place every time. A sponsor tile says **"Sponsor message"** above it. A house promotion (WUWF's own app,
  weather, Book Club, advocacy) is not labeled as a sponsor, and a sponsor is never drawn as a house promotion: a tile with no kind is
  labeled, because labeling a promotion is the safe mistake.
- **No leaderboard** across the top of a page, **no autoplay**, no sound or motion, **no pop-up or overlay**, no ad-network tag, **no third-party
  tracking**. A tile is a picture and a link: no script, no frame, no request to anyone else's server.
- **Never above the news.** The first thing on a page is the story, the emergency notice or the player.
- **Nothing empty.** A placement with nothing running draws nothing, not a box. The page closes up.
- **Sponsor links** are marked `rel="sponsored"` and send no referrer; a link must be a page on this site or a secure https address.
- **Separate from underwriting.** The "Support for this reporting" panel is editorial acknowledgment, resolved from an agreement and kept in sans
  type on a neutral panel. A placement is a sponsor's own message in the sponsor's own artwork. They never share a component and never sit
  inside each other.
- **Proposed, not yet a rule:** no placement inside a members-only story, a live blog, an emergency page, a listening question or the giving
  pages (`/support`), where asking for a gift should not compete with a sponsor. (`CLAUDE.md` says asking for member support on a page that
  carries a sponsor message is fine; this is about not putting a sponsor inside those pages.)

## The places

| Key | Where | Holds | Artwork | Sells as | Built |
| --- | --- | --- | --- | --- | --- |
| `home.rail` | Beside the news on the home page; after the news on a phone | up to 10 tiles | 880 × 704 | Display ad | **Yes** |
| `home.band` | A slim band after the news sections, before the podcasts | 1 | 1200 × 200 (phone 800 × 400) | Banner | **Yes** |
| `section.rail` | Beside the stories on a section, topic or reporter page | up to 4 | 880 × 704 | Display ad | Designed |
| `story.rail` | Beside the story text (wide screens); after the story on a phone | up to 2 | 880 × 704 | Display ad | Designed |
| `story.inline` | One band after the opening paragraphs of a story | 1 | 1200 × 200 (phone 800 × 400) | Banner | Designed |

- **The banner is not a leaderboard.** It sits in the page's flow after the news, at most one sixth as tall as it is wide (the registry's test
  holds that), never at the top. The website "Banner" row on `/sponsor/digital` is priced "on request" because its size is unconfirmed: **the
  artwork sizes above are proposals** (880 wide is what the live rail serves today), and corporate support must confirm them before a sponsor
  is sent a spec.
- **One tile is one booking.** A band holds one message: it is not a rotation. A rail tile is its own booking, in the order corporate support
  sets. Order is a courtesy, not a price tier, until a decision says otherwise.
- **A tile's reference** is `<placement>.<position>` (`home.rail.3`), counted among the tiles that run. It is in the page as
  `data-placement` so a booking, a screenshot and a support request can name the same tile. It is a reference, not a tracker.
- **Designed, not built:** `section.rail`, `story.rail` and `story.inline` have a spec in the registry (`built: false`) and no admin fields and
  no screen. Build one with the screen that draws it (a story page is cached and shared by every reader; a placement there must not break that
  caching). The registry's `built` flag is what the admin and the tests read.

## What fills a placement

**Today (interim):** corporate support or a publisher enters each tile in the admin, **Pages & hubs → Sponsor and promo placements**: kind (Sponsor
or House promotion), the sponsor's name, the picture, what the picture says (read aloud, so kept to 160 characters), where it goes, optional first
and last day (whole days, judged on the station's Central-time calendar day), and a Show switch. A tile that is off, outside its dates, missing its
picture or with an address the site would refuse is left out, and the rest close up (`lib/placements/pick.ts`, tested). Who may edit: the
`sponsorship.manage` permission (corporate support) or `content.publish` (publishers, who run the home page).

**Later (open, and not a site-only job):** the Portal holds the deal (contract, sponsor, approved wording, proof of performance); see
`ROADMAP.md`, "Sponsorship direction". The site stays the delivery surface and the registry above stays the vocabulary: the Portal's booking names
a placement key, the site receives a signed, versioned snapshot after a signed notice and keeps a last-known-good copy (never a per-request call:
the site must stay usable when sponsorship serving is down). The resolver gives a booked sponsor the tile, and falls back to the house promotions
this global holds, so a placement is never empty only because a booking lapsed. **Do not build booking, billing or placement logic in Payload.**

## Outside the website

These are sold on the same page but are **not website placements** and are not in the registry; the website must not pretend to hold them.

| Product | Where it lives |
| --- | --- |
| App banners (640 × 100, 640 × 200) and pre-roll | The WUWF app, not this site |
| Stream audio pre-roll | The stream, scheduled in Traffic |
| Podcast spot | The podcast feed and audio, a Traffic and production matter |
| E-newsletter message | The newsletter tool; "labeled, delivered to members" |
| On-air credits | Traffic's dayparts (`CLAUDE.md`, "Contracts with the Portal") |

## Decisions that are open

1. **Artwork sizes** for the banner and the rail (above), and the website Banner's price. Corporate support.
2. **Proof of performance.** No third-party tracking means no impression or click counts from an ad server. Whether WUWF reports views and clicks to
   sponsors is undecided (`/sponsor/digital` promises nothing about it). A first-party, consent-aware count of rail views and clicks is possible
   behind `ANALYTICS.md` and is not built; do not add it without a decision.
3. **Ten tiles on a phone** is about 3,000 pixels of tiles after the news. Consider showing the first four, or a "Sponsors" disclosure, once
   there is data on how far people scroll.
4. **House promotions versus sponsors** in the rail: today they share the column in the editors' order, as on the live site. A rule that house
   promotions only fill unsold slots is a policy for corporate support to set.
5. **Whether a members-only reader sees fewer placements** (a membership benefit). Nothing here says so; the product claim "sponsor-free" about
   WUWF originals is never to be made (`CLAUDE.md`).

## The one-time import of the live rail

`scripts/placements/import-rail.ts` copied the ten tiles of the live wuwf.org home page into the media library and the rail (owner-approved,
2026-11-18; pictures, links and what each says are in `scripts/placements/rail-tiles.ts`). Which were sponsors and which were WUWF's own was read
from where each goes and what each says: **corporate support confirms each kind.** It imports the Sinfonia Gulf Coast tile **held**, because its
picture advertises a concert on Saturday, Nov. 14, which had passed, and two tiles name dates (Emerald Coast Theatre, December 3 to 20; the Santa
Rosa County tourism tile, "Sept. to Nov.") that need a last day set. It never overwrites a rail an editor has filled (`--replace` does), reuses
pictures it already has, fetches only from the live page's picture host, three seconds apart, with a neutral client name, and is a dry run unless
given `--apply`.

# Sponsor and promo placements

How sponsor messages and WUWF's own promotions reach the site: what a **zone** is, what a **placement** is, who may make one, what is built and what is
not. Rules live in `CLAUDE.md`; state and history in `ROADMAP.md`. The zones are `src/lib/placements/registry.ts`; the collection editors use is
`src/collections/PlacementItems.ts` (admin: **Sponsorship → Placements**); what runs on a page is decided by `src/lib/placements/resolve.ts`.

## Two layers, so rethinking placements never needs a deploy

- **A zone is code.** A fixed, named place in a page's layout: its shape (tile or band), how many it holds, the artwork size, whether a placement
  can be aimed at particular pages. A zone needs layout and a screen that draws it, so a developer adds one. There are few, and they are generous.
- **A placement is content.** One message in one zone, made, changed, aimed and retired by editors in the admin: kind, sponsor, picture, link, order,
  dates and, in a zone on the list pages, which sections, topics or reporters it appears on. A new mix, a new sponsor, a different idea of what to
  sell: none of it needs code.

**The site knows nothing about packages, prices or how a placement was sold** (owner, 2026-11-18). A placement is delivery only: where, what, when.
Packaging and price are the Sponsorship pages' and, later, the Portal's.

## Rules every placement follows whatever an editor configures

They are enforced in code, not by configuration (they restate `CLAUDE.md`, "Decisions that are made"):

- **Fixed and labeled.** The same place every time. A sponsor tile says **"Sponsor message"** above it, on a strip in the site's own type, with the sponsor's
  name. A house promotion (WUWF's own app, weather, Book Club, advocacy) says **"From WUWF"** in the same place and is never labeled as a sponsor
  (changed 2026-11-20: it used to carry no label, so a reader could not tell it from an ad). A placement with no kind is labeled as a sponsor, because labeling a promotion as a sponsor is the safe mistake.
- **A top unit: a slim strip, not a tall billboard** (changed 2026-11-20): the one exclusive unit of `home.top` and `list.top`, in a slim strip the width of the page's content (1600 by 200, eight wide for one tall: about 150 px tall; changed the same day from a 970 by 250 billboard, which was narrower than the page and about 290 px tall with its label), directly under the header and the banner, is allowed. **No autoplay**, no sound or motion, **no pop-up or overlay**, no ad-network tag, **no third-party
  tracking**. A tile is a picture and a link: no script, no frame, no request to anyone else's server.
- **The emergency notice always comes first.** Changed 2026-11-20 (it was "never above the news"). Under the header a page may carry its one top unit, and on a phone the unit follows the lead story's headline and picture (or the list's title), so a story is always what the first screen shows. **While an emergency banner is on (for that page) the top unit is not drawn** (`exclusions.ts`); a quiet notice banner does not hold it back. Nothing else is above the news: the band, the rail and the tiles still sit after or between it.
- **Nothing empty.** A zone with nothing running draws nothing, not a box. The page closes up.
- **Never everywhere by accident.** A placement in a zone that can be aimed runs only on the pages it names, unless the editor chooses "every page".
- **Sponsor links** are `rel="sponsored"` and send no referrer; a link must be a page on this site or a secure https address.
- **Separate from underwriting.** The "Support for this reporting" panel is editorial acknowledgment, resolved from an agreement. A placement is a
  sponsor's own message in the sponsor's own artwork. They never share a component and never sit inside each other.
- **Proposed, not yet a rule:** no placement inside a members-only story, a live blog, an emergency page, a listening question or the giving pages
  (`/support`). (`CLAUDE.md` says asking for member support on a page that carries a sponsor message is fine; this is about not putting a sponsor
  inside those pages.) The story zones below are not built, so nothing yet reaches them.

## The zones

| Zone | Where | Holds (per page) | Can be aimed | Artwork | Built |
| --- | --- | --- | --- | --- | --- |
| `home.top` | Directly under the header on the home page (on a phone, after the lead story's headline and picture); held back while an emergency banner is on | 1, exclusive | no | 1600 × 200 (phone 640 × 200) | **Yes** |
| `home.rail` | Between the news sections (rows of three); after the news on a phone | 9 (target 6) | no | 880 × 704 | **Yes** |
| `home.band` | A slim band after the news sections, before the podcasts | 1 | no | 1200 × 200 (phone 800 × 400) | **Yes** |
| `list.top` | Under the title of a section, topic, reporter or all-stories page: **a section's presenting sponsor**; held back while an emergency banner is on | 1 per page, exclusive | **yes** | 1600 × 200 (phone 640 × 200) | **Yes** |
| `list.rail` | Beside the stories on a section, topic, reporter or all-stories page | 4 | **yes** | 880 × 704 | **Yes** |
| `story.inline` | A band after a story's fourth paragraph (a story of at least six) and, in a story of at least sixteen, a second after its twelfth | 2 | yes | 1200 × 200 (phone 800 × 400) | **Yes** |
| `story.rail` | **Retired 2026-11-20** (owner): a rail beside the text scrolled away after the first paragraphs, needed its own artwork, crowded the band and pushed the text off the story's centred column. Removed from the zones and from the database's zone list (migration `story_rail_retired`; the demonstration placements that used it were deleted) | 0 | n/a | n/a | No |

- **Top units and the rail's glide (owner, 2026-11-20).** Everything is sold **at a flat rate for a period**; a top unit is the highest tier, then a section's presenting
  sponsor, then a rail tile, then the band. The rail's capacity is **nine** (three full rows, so no gap-filling promotion is needed) and is meant to **glide to six** as bookings
  end: lower the number in `registry.ts` only when fewer placements than that are running, because the admin refuses a placement past capacity and a lower number must never
  displace a sponsor who is running. A **presenting sponsor** is a placement in `list.top` aimed at the section, drawn as the same labeled "Sponsor message" tile as any other,
  **never in the acknowledgment panel's voice** and never "presented by" copy of ours: a section is navigation and is never underwritten (`CLAUDE.md`). The sponsor's
  contract must say it conveys no editorial approval; counsel confirms whether such a placement is advertising or qualified sponsorship before the first sale.
- **The banner (`home.band`) is not a leaderboard.** It sits in the page's flow after the news, at most a sixth as tall as it is wide (a test holds that), never at
  the top. **The artwork sizes are proposals** (880 wide is what the live rail serves today): corporate support confirms them before a sponsor is
  sent a spec.
- **A zone holds a fixed number, and a band is not a rotation.** The home page zones are one page each, so the admin **refuses a placement past the
  capacity** and says what to do (switch one off, set its last day, delete one); a placement that is switched off or has ended does not count, so a full
  rail can be rotated. `list.rail` is counted per page by the resolver (different placements aim at different pages and may overlap on some): it runs
  them in order and shows the first four.
- **A tile's reference** is `<zone>.<position>` (`list.rail.2`), counted among the tiles that run, and is in the page as `data-placement` so a booking,
  a screenshot and a support request can name the same tile. It is a reference, not a tracker.
- **The story zone (built 2026-11-20; the rail retired the same day)** is drawn by the story template, **never placed by an editor in a story**: `StoryView` asks `loadStoryPlacements` and draws a
  band after the fourth paragraph with words in a story of at least six, and a **second after the twelfth in a story of at least sixteen** (`lib/placements/story.ts`, `splitForBands`, pure and
  tested), each only when a placement runs for it, so a short story never carries two and a long one is not one band for its whole length. The story's text, author box and the modules after it
  stay in one centred column. A placement is aimed at the sections, topics and reporters a story is filed under (the all-stories page choice does not apply to a story). **A live blog, a members-only
  story and a story whose editor ticked "No sponsor messages on this story" carry none** (`storyZonesAllowed`), a themed show's episode page carries none, and a preview carries none.
  The story page is cached and shared by every reader, as the lists are, and a failed read leaves the bands out so the story still draws.

## How the home page lays the tiles out (built 2026-11-20, reworked the same day)

Designed on the canvas "Sponsor Rail Redesign" (option B). The pieces are `lib/placements/flow.ts` (pure, tested), `components/Placements`, and `Homepage/HomepageView.tsx`.

- **One frame.** Every tile is the same card (8 px, a hairline) with a label strip above the artwork and the artwork in the zone's recommended **5:4** frame, whatever
  shape the picture is. The picture is always shown **whole**, never cropped, stretched or recolored (sponsors' artwork carries their words).
- **No white box around small art.** Where the picture does not fill the frame (`fillsFrame`, within 3%, and a picture with no recorded size counts as not filling it),
  the rest of the frame is a heavily blurred copy of the same picture, so the artwork sits on a wash of its own colors. The copy is decorative (`aria-hidden`), is the same file
  (small size requested), and needs no script and no request to anyone else's server. The banner does the same in its own frame. The goal is still to receive artwork of the right
  shape; this covers the edge cases.
- **Rows, not a side column.** The first version put a pair of tiles in a side column beside each news section. A real section is about 1,800 px tall (a lead story and two rows of
  cards) and a pair about 660 px, so two thirds of every section had blank space beside it, and the video row had none. The tiles are now **full-width rows of three between the sections**:
  the first row just after the short videos, the next above the second section, and so on. Nothing sits in a side column, so no section has a gutter at any height, story count or tile count.
  Tiles are a fixed 22rem and wrap, centered: three fill a wide screen's row, a tablet shows two and one, a phone a stack. The page is cached and shared by every reader, so the server
  never needs a screen's width.
- **A paid tile is never held back.** Every tile that runs is drawn. Rows that do not fit above a section (more rows than sections) follow the last section. Capacity (nine for the
  home rail) is the only limit, as before.
- **A short last row is completed by WUWF's own promotions, which are optional.** On a house promotion in the home rail the admin shows **Can fill a gap**. Those promotions are held
  apart from the rail's tiles: they take no place from a sponsor, do not count toward the rail's capacity, are used only to complete the last row (at most two, since a row of three needs at most
  two), and are keyed `home.rail.fill.N`. With none marked, the short row's tiles are **centered at the same size**. The flag on anything but a house promotion in the home rail is
  cleared on save (and ignored by the resolver).
- **The news cards are a lead row and an even grid.** With no side column a news run's first story has a row of its own (`LEAD_ROW`, `lib/homepage/modules.ts`) and the rest run in
  a grid under a rule (`restGridClass`: two stories two across, four stories four across, otherwise three; two across on a tablet). A run holds 3 to 7 stories, so only a run of six
  ends in a short row (two). This replaced the first story spanning columns (`leadSpanClass`, 2026-11-22), which put a card beside the lead and made it read as part of it.

## Making a placement (Sponsorship → Placements)

Name (for staff), kind, sponsor (chosen from **Sponsorship → Sponsors**, so a sponsor is one record across underwriting and placements), zone,
picture (and a phone picture for a band), what the picture says (read aloud, so kept to 160 characters), where it goes, **order** (lower runs first,
ties go to the one made first), first and last day (whole days, judged on the station's Central-time calendar day), and a Show switch. In a zone that
can be aimed: **only the pages chosen** (sections, topics, reporters, the all-stories page) or **every page**.

- **Who may:** corporate support (`sponsorship.manage`) and administrators make and change anything. Publishers (`content.publish`), who run the home
  page, make and change **house promotions only**; they cannot make a sponsor placement, change one, or turn one into one. Everyone else, and the
  public, cannot. The public reads only what is switched on.
- **What is left out of a page:** a placement that is off, outside its dates, missing its picture, with an unsafe address, aimed elsewhere, or past the zone's
  capacity. The rest close up.
- **When a change shows:** saving, deleting or switching one refreshes every page that reads placements. A **first or last day** takes effect when the page
  next refreshes (the home page within five minutes, a section or list page within the hour), **and a scheduled refresh just after Central midnight** (`/api/placements/day-boundary`,
  called at 05:05 and 06:05 UTC by `vercel.json`, so it lands after the station's midnight in both summer and winter) redraws the pages that read placements, so a flat-rate
  sponsor whose week starts on Monday starts on Monday. **An exclusive place (a top unit) is booked by dates**: the admin refuses a second placement for the same place and page
  whose dates overlap one already booked, naming it (`lib/placements/conflicts.ts`), and lets next week's sponsor be booked while this week's runs.

## Where the placements come from

**Today (interim):** the records above. **Later (open, and not a site-only job):** the Portal holds the deal (contract, sponsor, approved wording, proof of
performance); see `ROADMAP.md`, "Sponsorship direction". The pages never read the source: they call the resolver with a page and get tiles, so the
Portal's signed, versioned booking snapshot (kept with a last-known-good copy, never a per-request call: the site must stay usable when sponsorship serving
is down) can become a second source without touching a page, and this collection becomes the house promotions and the manual override.
**Do not build booking, billing or proof of delivery in Payload.** The collection records what runs, not what was sold.

## Outside the website

These are **not website zones** and are not in the registry; the website must not pretend to hold them.

| What | Where it lives |
| --- | --- |
| App banners (640 × 100, 640 × 200) and pre-roll | The WUWF app, not this site |
| Stream audio pre-roll | The stream, scheduled in Traffic |
| Podcast spot | The podcast feed and audio, a Traffic and production matter |
| E-newsletter message | The newsletter tool |
| On-air credits | Traffic's dayparts (`CLAUDE.md`, "Contracts with the Portal") |

## Decisions that are open

1. **Artwork sizes** for the banner and the rails (above). Corporate support.
2. **Proof of performance.** No third-party tracking means no impression or click counts from an ad server. Whether WUWF reports views and clicks to
   sponsors is undecided. A first-party, consent-aware count of tile views and clicks is possible behind `ANALYTICS.md` and is not built; do not add it
   without a decision.
3. **Ten tiles on a phone** is still about 3,000 pixels of tiles, now spread between the news sections (two after each tall one) and a "More from our sponsors" row, instead of
   all after the last story. A paid tile is never hidden to shorten it; if it needs shortening, sell fewer places. Revisit once there is data on how far people scroll.
4. **House promotions versus sponsors** in a rail: they share the column in the order editors set, as on the live site. Promotions marked **Can fill a gap** are the
   one case where a house promotion only fills what a sponsor did not (the foot row's short last row). Whether other house promotions should yield to sponsors is a policy for
   corporate support to set.
5. **Exclusions** ("every section except Commentary") and **targeting by story format or show** are not built; add them when a sale needs them.
6. **A "where this placement shows" preview and a conflicts view** (two placements competing for a place) are not built. The resolver is deterministic
   (order, then age), the home zones refuse overflow, and a list zone shows the first four; an admin overview is the next step if editors need to see it.
7. **Whether a members-only reader sees fewer placements** (a membership benefit). Nothing here says so; "sponsor-free" is never to be claimed about
   WUWF originals (`CLAUDE.md`).

## The one-time import of the live rail

`scripts/placements/import-rail.ts` copied the ten tiles of the live wuwf.org home page into the media library, **Sponsors** and **Placements** (owner-approved,
2026-11-18; pictures, links and what each says are in `scripts/placements/rail-tiles.ts`; staging was seeded the same day). Which were sponsors and which were
WUWF's own was read from where each goes and what each says: **corporate support confirms each kind.** The Sinfonia Gulf Coast tile is held (its picture
advertises Saturday, Nov. 14, which had passed), and two tiles name dates (Emerald Coast Theatre, December 3 to 20; the Santa Rosa County tourism tile,
"Sept. to Nov.") that need a last day set. The import never overwrites placements made by hand (`--replace` clears the zone first), reuses pictures it
already has, does not make a placement twice, fetches only from the live page's picture host three seconds apart with a neutral client name, and is a dry run
unless given `--apply`.

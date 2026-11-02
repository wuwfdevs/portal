# Template census (Grove, local news stories)

What this is: an inventory of every `_template`, typed object and field shape in Grove's `?_renderer=json` pages for
WUWF's local news stories, so the block set can be derived from data (ROADMAP → *Grove migration*, step 3). The owner
approved it on 2026-11-02, limited to local news stories, plus a small legacy probe and about 10 `?_renderer=styleguide`
pages.

## What is committed here

| File | What it is |
|---|---|
| `plan.json` | The seeded order of pages: the stratified sample (`main`), the legacy probe, and the size of each stratum. Lets a fresh sandbox resume without re-reading the sitemaps. |
| `manifest.jsonl` | One row per page requested: path, HTTP status, bytes, sha256, fetched-at, `_template`, published date, origin class, canonical host, Grove `contentId`, whether raw JSON was kept. **No response bodies.** |
| `tally.json` | The frequency tables (templates, typed objects, shapes, key paths, HTML tags and classes, URL hosts, origin signals, date and section checks) with up to 3 example paths each, and the "new types per 100 pages" curve per group. |

**Not committed, ever:** raw responses. They are kept in the work directory (outside the repository; the tooling refuses a
directory inside any git work tree), content-addressed by sha256, and only for pages classified WUWF-originated or
ambiguous. NPR and wire pages keep a manifest row and nothing else (CLAUDE.md: they are not ours to archive; plan §2).
The sandbox keeps nothing across restarts, so `archive` zips them and the session sends the zips to the owner.

## Rules the tooling enforces (all tested in `src/lib/census`)

- Neutral User-Agent `WUWF-migration-research`, an `Accept` header, nothing else of ours: no email, URL, `From`,
  `Referer` or session link. Anything else throws before a request is made.
- `robots.txt` is read at the start of every run; disallowed paths are skipped and recorded; a `Crawl-delay` larger than
  3 s is honoured.
- One request at a time, at least 3 s apart (redirect hops and retries included).
- 429 and 5xx: retry with 10 s, 20 s, 40 s, 80 s backoff, honouring `Retry-After`. Five pages in a row failing stops the
  run; a 403 stops it at once. A 404 is an answer, not a failure.
- Redirects are followed only on `www.wuwf.org`.
- Resumable: working state is written atomically after every page; the committed files are written every 100 pages and
  at the end of every run, and a fresh sandbox rebuilds its state from them (`import`). The two committed files must be
  from the same checkpoint or the tool refuses to resume.

## Running it

```bash
# From apps/site. The work directory must be outside the repository.
export CENSUS_WORK=/var/tmp/wuwf-census        # raw responses, working state, zips
pnpm census plan                               # robots.txt + sitemaps -> census/plan.json   (once)
pnpm census run --stage pilot                  # 5 pages: check the tally looks sane before going on
pnpm census run --stage styleguide             # the same first 10 pages via ?_renderer=styleguide
pnpm census run --stage main --max-minutes 100 # a chunk; run again to continue
pnpm census run --stage probe                  # the legacy probe
pnpm census archive                            # zip new raw files -> $CENSUS_WORK/archives/census-raw-NNN.zip
pnpm census status
```

After a sandbox restart: pull the branch, set `CENSUS_WORK`, and run the same `run` command; it rebuilds its state from
`manifest.jsonl` and `tally.json`. Raw files from before the restart are gone unless the owner has the zips.

Background jobs in a session are capped at 2 hours, so a chunk uses `--max-minutes` and is re-run until it says `done`.
Against localhost (tests) `CENSUS_BASE_URL`, `CENSUS_OUT` and `CENSUS_MIN_INTERVAL_MS` are honoured; against the real site
the base is fixed to `www.wuwf.org` and the interval never goes under 3 s.

## Caveats

- The first sample's JSON is gone, so field names are known only from the ROADMAP's prose. The walker is structure-
  agnostic (it labels any object by `_template`, `class`, `_type`, `type` or `__typename`), and where a name is a guess
  (published date, primary section) the key that matched is recorded in the tally. Run the 5-page pilot and read it
  before the main run.
- Origin classification (`wuwf` / `external` / `ambiguous`) uses the canonical host and `sourceOrganizationName`, never
  the path (plan §3). It is provisional until checked against real pages.
- A sample can miss a rare template: at about 30% sampling, one present on 5 pages is missed with probability 0.7⁵ ≈ 17%.
  The "new types per 100 pages" curve says whether to go on; the order is a prefix of the whole set, so extending
  wastes nothing.

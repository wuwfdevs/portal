# Gap probe: the scripts behind `census/url-inventory/`

These are the throwaway-but-reusable scripts that produced the URL inventory and the origin counts (2026-11-04). They are kept so the counts can be
**refreshed before cutover** (new stories, changed canonicals) without rebuilding them from the ROADMAP. They are plain bash and Python; nothing here
is part of the app.

Rules every fetch script follows (the census's, owner-approved): neutral User-Agent `WUWF-migration-research` (no contact information), robots.txt read,
**at least 3 s between requests**, no redirect followed, resumable (a status file per page), stop on a 403 or five failures in a row. **Ask the owner before
running one**: each is a request volume against wuwf.org.

A work directory outside the repository holds everything they write (`GAP_WORK`; raw pages are never committed, and raw pages of non-WUWF stories are
deleted as soon as they are classified).

| Step | Script | Reads | Writes (in the work directory) |
|---|---|---|---|
| 1. All 276 monthly sitemaps | `fetch-sitemaps.sh <work>` (needs `index-locs.txt`, the `<loc>`s of `https://www.wuwf.org/sitemap.xml`) | | `sitemaps/` |
| 2. The inventory | `../../../census/url-inventory/inventory.py <work>/sitemaps <work>/ledger` | `sitemaps/` | `ledger/ledger.csv`, `summary.json` |
| 3. What to probe | `make-plan.py <work>` (first sample), `make-plan2.py <work>` (the rest of `news`, `music-arts`, the small sections, `florida-news`) | `ledger/` | `gap-plan.tsv`, `gap-plan2.tsv` |
| 4. Fetch pages | `fetch-pages.sh <work>`, `fetch-pages2.sh <work>` (uses `drop-external.py`) | the plans | `raw/`, `raw2/`, `gap-manifest*.tsv` |
| 5. Classify | `analyze.py <work>` then `GAP_WORK=<work> classify-gap2.py <out dir>` | manifests, `raw*/` | `gap-records.json`; `probe-manifest.tsv`, `probe-results.json` in the out dir |
| 6. Standalone pages | `GAP_WORK=<work> dispositions.py <csv>` | `gap-records.json` | `standalone-dispositions.csv` |
| 7. Show pages and feeds | `probe-shows.sh <work>` (needs `shows-plan.txt`: the `show-page` rows of the ledger plus the two `/podcast/` pages) | | `raw3/`, `shows-manifest.tsv` |

Then the converter checks: `pnpm exec tsx scripts/grove/convert-corpus.ts --raw <dirs> --manifest <jsonl> [--link-map census/url-inventory/link-map.json]`, and the
link map: `scripts/grove/resolve-links.ts` (its cache, `census/url-inventory/link-cache.json`, lets a re-run ask only about new addresses).

**Sandbox lessons.** A background fetch only keeps running while a tool call is active in the session, and a container restart kills it (the disk survives, so
the scripts resume). A background watcher is capped at 2 hours. Another session's uploads are not visible; ask the owner to upload into the session that needs
them. The raw pages for everything fetched on 2026-11-04 went to the owner as `census-raw-005` to `-007` (the zips are the only copy).

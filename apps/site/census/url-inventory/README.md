# URL inventory (2026-11-04)

What this is: every URL in WUWF's 276 monthly Grove sitemaps, classified by shape and section, plus the results of
a gap probe that fetched 794 pages (page JSON read for template and origin only, then discarded; no raw pages are
kept here, and raw pages of non-WUWF stories are deleted as soon as they are classified).

| File | What it is |
|---|---|
| `summary.json` | Counts by shape, section and year. |
| `ledger-non-wire.csv.gz` | Every URL that is not a bare wire story (15,575), with shape, section, year, lastmod and a `disposition` column (all `undecided`). The 185,389 wire URLs are counted in the summary only; rebuild the full list with `inventory.py`. |
| `standalone-dispositions.csv` | The 411 standalone pages with template, title, a cluster and a **proposed** disposition (by name; not read). |
| `probe-manifest.tsv` | The gap probe and the extended fetch: path, status, template, canonical host, origin class. |
| `convert-full-strata-summary.json` | The converter run over the WUWF pages of `news`, `music-arts` and the small sections (no page content). |
| `probe-results.json` | Origin counts per probe group. |
| `inventory.py` | `python3 -I inventory.py <dir of sitemap-*.xml> <out dir>` rebuilds the ledger and summary. |

Fetch rules are the census's (README one level up): neutral User-Agent `WUWF-migration-research`, 3 s apart, robots.txt
honoured, stop on a 403 or five failures in a row.

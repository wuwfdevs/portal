# Data visualization system

Reusable charts, maps and tables for stories and pages, made from uploaded datasets. Built 2026-11-22. Rules for working on it are in `CLAUDE.md` ("Data visualization").

## The three parts, kept apart

| Part | What it is | Where |
|---|---|---|
| **Dataset** | An identity (title, source, methodology) and its **versions**: each an immutable CSV, JSON or GeoJSON upload, parsed once when saved and stored with its columns | collections `datasets`, `dataset-versions` (`collections/Data`) |
| **Visualization** | A configuration: kind (chart, map, table, embed), which dataset (follow the latest, or pin a version), which columns do what, caption, accessible description, credit, notes | collection `visualizations` |
| **Engine** | Turns a configuration plus a dataset snapshot into a plain model a component draws. Knows nothing of Payload, caching or pages | `lib/dataviz/engines` |

Pure code (`lib/dataviz`): `csv`/`parse` (files to typed tables, strict, with sentences an editor can act on), `spec` (the configuration and its validation), `version` (latest or pinned), `shape` (stored record to spec; trusts nothing), `classes`/`palette`/`format`, `svg-tree` (a drawing becomes a tree React draws; **never injected as HTML**). Payload reads are in `read.ts` (takes a Payload instance, so hooks can use it) and `load.ts` (the cached public read).

## How it is drawn

| Kind | Server | Browser |
|---|---|---|
| Chart | Observable Plot against a small DOM (linkedom), read back as a tree of allowed SVG tags. Drawn twice, for a phone and a wide screen, so text stays readable. Legend and a "View the data as a table" disclosure are plain HTML. | no script |
| Map | The same shapes as an SVG (Plot geo marks), with legend and data table. | Optional MapLibre GL JS ("Explore the map", loads only when pressed). No basemap tiles unless `MAP_STYLE_URL` is set. |
| Table | Semantic table, first page server-rendered. | TanStack Table (sort, search, page), a client component, loads with the figure. |
| Embed | The existing `EmbedBlock` (approved host list, click-to-load, sandbox). | as embeds are today |

## Editors

Data & charts in the sidebar: **Visualizations**, **Datasets**, **Uploaded versions**. Add a dataset, add a version from its page (upload a file), tick "published" (publishers only) when the numbers are ready, then make a visualization: columns are chosen from the file's own, never typed (`components/admin/ColumnSelect`). Preview opens `/data-preview/<id>`, which draws the draft with the newest version of the data, staged or not, and lists what stops it publishing. A story gets one with the "Chart, map or table" body block; a page with the "Chart, map or table" section.

Controls: a version's file cannot be replaced (upload a new one); only a publisher publishes a version or a visualization; **a version that would break a live visualization that follows the dataset cannot be published** (the message names it); a visualization cannot publish without an accessible description, a source, and columns that exist; a dataset in use, and a version a figure is pinned to, cannot be deleted.

## Caching

`loadVisualization` is `unstable_cache` under tags `dataviz` and `viz:<id>`. Saving a visualization, publishing or withdrawing a dataset version, and deleting refresh `viz:<id>` for every visualization that follows the dataset (or uses it as boundaries, or pins the version), so every page holding the figure rebuilds, and no other page does.

## Limits (all stated to the editor at upload or publish)

10,000 rows, 60 columns, 6 MB; GeoJSON 2,000 features and 250,000 points of geometry (60,000 for an interactive map); a chart draws at most 6 series; a table carries 1,000 rows to the browser, the download has all.

## Not built, on purpose

- Charts have no hover tooltips or animation (static, accessible, cacheable); the data table and legend carry the detail.
- No grouped (side-by-side) columns: several series stack. A new chart type is one case in `engines/chart.ts` and one option in `lib/dataviz/spec.ts`.
- Point maps have no basemap by default (no request to a map provider on a reader's behalf). Set `MAP_STYLE_URL` (https) to give the interactive map one, after deciding which provider may see visits.
- "Where is this used" lists for stories: the story body is rich text, so references are not queryable. Visualizations list their dataset; datasets list their visualizations.
- Joined boundary pinning for maps is by version (`map.boundaryVersion`); a map's boundary dataset otherwise follows the latest.
- Xlsx uploads (save as CSV).

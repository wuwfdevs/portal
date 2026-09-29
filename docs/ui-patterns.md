# UI patterns

Conventions for how a screen in the portal is laid out. `CLAUDE.md` points here; read this
before adding a list page, a create or edit form, or a right column, so a new screen doesn't
copy a layout the rest of the portal has moved off.

## List pages, create, edit, and right columns (2026-09-27)

Many list pages used to be a two-column layout: the list in `min-w-0 flex-1`, and a
permanent "New X" form in a `lg:w-80` / `lg:w-96` right column. That pattern is retired.
The problems it had:

- The create form, used rarely, permanently took 320–384px from the list.
- Below `lg`, the form stacked under the whole list and effectively disappeared.
- Create lived in the sidebar, edit on a `[id]` page or in an inline `<details>`, and
  delete or deactivate in a row button — three places for one record's lifecycle.
- `failWith` errors from the sidebar form rendered at the top of the left column, away from
  the form that caused them (`log/programs` rendered them twice).
- Pages accumulated unrelated jobs (Industries CRUD on the Underwriters page).

### The rule

1. **List pages** use the Contracts layout: a `ListToolbar` (search, optional `FilterChips`,
   spacer, secondary links, primary `PrimaryLink` "+ New X") above a full-width `TableFrame`
   table or card list. Filters are plain query-string links; search is `ListSearch` (see "Search").
2. **Create** depends on the size of the record:
   - **Dedicated page** (`/x/new`) when the record has about five or more fields or has
     prerequisites. Underwriters is the reference.
   - **Inline create card** (`InlineCreateCard`) at the top of the list when the record is
     small, even if it has child rows (a pool plus its targets). Pools and Industries are the
     references. It opens with `?new=1` and closes with a Cancel link to the bare path — no
     client state for opening and closing; only a repeating-rows widget like
     `PoolTargetRows` is a client component.
3. **Edit** uses the same form as create: `/x/[id]/edit` rendering the same form component
   for records with a dedicated page (`underwriters/underwriter-form.tsx`), or the inline
   pattern for small records.
4. **Secondary lookups** get their own view instead of sharing a list page (Industries lives
   at `/underwriting/underwriters/industries`, not on the Underwriters list).
5. **Right columns stay only on detail pages**, for context, read-only summaries
   (`DetailSummary`) and actions. Examples: the `contracts/[id]` aside, the rundown's live
   layout, the schedule-line editor rail, the help panel on `contracts/new`, the Details
   summary on `underwriters/[id]`.

### Errors

An error renders inside the form that caused it, never at the top of the page. A Server
Action bounces back to the form's own URL: `?new=1&error=…` for an inline card (`failWith`
appends `&error=` when the path already carries a query string), or `/x/new?error=` and
`/x/[id]/edit?error=` for a dedicated page. Where the message belongs under one field, the
action names it (`&field=name`) and the screen swaps that field's `FieldHint` for a
`FieldError`; anything else renders as an `Alert` at the top of the form.

### Behavior notes

- **Pending state** comes free: `Button` disables and shows a spinner through `useFormStatus`.
- **Mobile**: search is `w-full sm:w-80`, toolbar items wrap, form grids collapse to one
  column below `sm`. Every control keeps `MOBILE_SAFE_TEXT_SIZE` by being an
  `Input`/`Select`/`Textarea`.
- **Keyboard focus**: `autoFocus` on the first field of an opened inline card or a dedicated
  form.
- **Success**: a create or save may land on the detail page with `?saved=…`, shown as a
  `Badge` beside the heading — never a page-top alert.

### Shared components (`src/components/ui/`)

| Component          | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `ListToolbar`      | The toolbar every list page opens with; search + chips + spacer + actions |
| `PrimaryLink`      | A primary-styled `<Link>` — the "+ New X" action                          |
| `InlineCreateCard` | The `?new=1` inline create form for a small record                        |
| `DetailSummary`    | Read-only field list with an Edit link, for a detail page's aside         |
| `SearchableSelect` | Search-to-select for a form field whose options grow with the data        |
| `Pagination`       | "26–50 of 132" and page links under a list that grows without bound       |
| `ProgressBar`      | A thin bar: done plus pending of a total, or indeterminate for busy work  |
| `Steps`            | Numbered steps for a flow; the current step can be busy                   |
| `BusyPanel`        | Title, time hint and a sliding bar for a long server step                 |

### Pickers (2026-09-27)

A `<select>` is for a handful of fixed options: a status, a pool, an industry, a time rule.
A field whose options grow with the data — an underwriter, a program, a content item, a
contract — is a `SearchableSelect` (`components/ui/searchable-select.tsx`): a text box that
filters as you type over a keyboard-navigable listbox, posting the chosen id through a hidden
input so the surrounding form stays an ordinary `<form action>`. The threshold is "more than
a few records now, or likely to be". In Underwriting it is every such picker: the underwriter
on the order step, the program in the schedule editor (controlled, since its options follow
the chosen pool), the existing-copy link on the policy step, the contract on the affidavit
form, the open break on a line card and on a makegood (a break that already holds the
contract is shown disabled), and the program on a pool target. Pools, industries, statuses,
time rules and a contract's own handful of linked copy stay native selects. It is the rundown
builder's insertion-point combobox lifted into a primitive, so the two behave the same.

### Row details and row actions (2026-09-28)

A list row's less-frequent actions go in an `ActionMenu` ("⋮"); what people look for
does not. Two rules came out of the contract page's schedule lines
(`docs/underwriting-traffic-redesign.md` §11.7):

- **A read-only view is never a menu item.** If a row has detail worth showing (a line's
  periods and placements), the row expands to it, opened by a query string
  (`?details=<id>`) the way an inline card opens with `?new=1` — never client state. The
  normal-path action lives in that detail or as a visible button, not in the menu.
- **The menu holds what is rare or destructive**, each destructive item opening a confirm
  step below the row rather than acting on the click. `ActionMenu` items can be a link
  (`href`), a submit for a form declared elsewhere on the page (`formId`), or greyed with
  a reason (`disabled` + `hint`); `dividerBefore` separates the destructive group.
- **A row's failed action renders in that row.** The action bounces to the page with
  `?line=<id>&error=…` (or the equivalent) and the page hands the message to the row that
  raised it, not to a page-top alert.

### Rollout

Done (2026-09-27, in two passes):

- Shared components; Pools (inline create with targets, atomic via
  `uw_create_inventory_pool()`); Underwriters (list, `/new`, `/[id]/edit`, read-only detail
  aside); Industries (own view, inline create row); Contracts (already on the layout, now on
  `ListToolbar`).
- `underwriting/copy`: list on the toolbar with an approval filter; `/copy/new` and
  `/copy/[id]/edit` share `copy/copy-form.tsx`; the detail page is read-only (script, linked
  contracts, a `DetailSummary` with Edit) and keeps the approval-status control in its aside,
  since that is a workflow action, not an edit. Since 2026-09-27 the contract setup wizard's
  own copy step (`/contracts/[id]/copy`) and the contract page's Copy tab share one panel
  (`contracts/[id]/copy-panel.tsx`): create and link is an `InlineCreateCard` (`?new=1`),
  linking existing copy is a second card (`?link=1`), and edit is the same fields in place
  (`?edit=<id>`), all rendering `copy/copy-form.tsx`'s `CopyFormFields` — the card owns the
  form, the fields component renders only fields. `SearchableSelect` gained `detail` (a
  second line per option) and `groups` (a secondary tier that surfaces only through search) for
  the underwriter-first copy picker.
- `log/programs`: a program is created inline; each program now has its own page
  (`/log/programs/[id]`) listing its schedule with a read-only summary aside, and "Schedule a
  program" became `/log/programs/[id]/schedule/new`, a producer-only dedicated page.
- `log/clocks`: a template is created inline; versions and slots stay on the template's page.
- `editorial/settings/form`, `pillars`, `rubric`: the Active/Retired view tabs became
  `FilterChips` on a `ListToolbar`, and each "Add a …" side form became an inline card. The
  two client components that show or hide a field by type (`AddFieldFields`,
  `CriterionFields`) now render only their fields; the card owns the `<form>`.

Detail-page asides reviewed against rule 5 and kept as they are: `exceptions/[id]` (the
resolution form is the triage action), `log/library/[id]` (approval status),
`academic-partnerships/[id]` (owner, stage, disposition, delete — all actions). None held a
create form or a duplicate of an edit page.

`log/library` moved onto `ListToolbar` with search and pagination on 2026-09-29.

## Search (2026-09-29)

Every `ListToolbar` search box is `ListSearch` (`components/ui/list-search.tsx`). It used to
be a GET form that only searched on Enter, and clearing the box did nothing until Enter was
pressed again — the browser's own clear button (×) included. Now:

1. **It searches as you type**, 300 ms after the last keystroke
   (`LIST_SEARCH_DEBOUNCE_MS`). Enter searches at once.
2. **Clearing the box resets the list immediately**, whether the text is deleted or the ×
   is used.
3. **The URL stays the source of truth** (`?q=`). Each search is a `router.replace`, not a
   push, so typing doesn't add one Back entry per keystroke; the box follows the URL when
   it changes some other way (Back, a link without `q`). A new search drops `page` and
   keeps the list's filters (`hidden`) — `listSearchHref()` in `lib/list-search.ts`, pure
   and tested.
4. It is still a plain GET form underneath, so it works before hydration.

Search-as-you-type is right here because each of these searches is one cheap
query over a list of hundreds to low thousands of rows. A search that is expensive or
calls a model (Resources' hybrid search, Sourcework's `tw_search`) is a different case and
keeps Enter-to-search.

## Pagination (2026-09-28)

No list in the portal was paginated. Every list page selected every row and filtered in
JS, which has two costs beyond a long page. The cost grows with the table. And PostgREST
caps a select at `max_rows` (1000, `supabase/config.toml`) with no error, so past that point
a list silently drops rows. The Log content library is about 900 items. The audit log
hides the problem another way: it is capped at 100 rows with no way to see older ones.

### The rule

A list whose rows grow with use — records people create, not configuration — is
paginated by page number, with the lib and component below. The Resources procedures list
(`/resources/procedures`) is the reference.

1. **URL:** `?page=N`, alongside the list's other parameters (`q`, filters). Page 1 is the
   bare URL. A filter or search link always drops `page`, back to page 1.
2. **Query:** filters, search, and sorting happen in the query, never in JS after the
   fetch. The same select asks for `{ count: "exact" }` and applies `pageRange(page)` with
   `.range(from, to)`, sorted by the list's order plus `id` as a tiebreaker so rows never
   repeat or skip across pages. Past the end, PostgREST answers 416 (`PGRST103`), not an
   empty page; the query treats that as no rows (`listProcedures` in
   `lib/resources/queries.ts`).
3. **Chip counts** come from their own `{ count: "exact", head: true }` queries, one per
   chip, run in parallel. Never count the rows of the page you fetched. If a list needs
   many counts, write a grouped count function instead.
4. **Screen:** `parsePage(searchParams.page)`, then `pageInfo(page, total)`. If
   `isPastLastPage(info)` (a bookmark after rows were deleted), redirect to the last page.
   Render `<Pagination info path params noun>` under the list, where `params` are the
   list's other query parameters. It is plain links, so no client JavaScript is needed.
5. **Page size** is `DEFAULT_PAGE_SIZE` (25). Don't add a page-size picker.
6. **Page numbers, not cursors.** These lists sort by name or date. People want a count
   and a way back to page 3, and none of them is large enough for `OFFSET` to cost
   anything. A feed that is only ever read newest-first, and could reach tens of thousands
   of rows, is the case where a cursor would be worth it. None exists yet.

Search results that come from a ranked RPC (`rc_search_articles`, `tw_search`) keep their
fixed cap: relevance falls off quickly, so a second page of results is not useful. Small
configuration lists (tools, pillars, rubric criteria, clocks, programs, pools) are not
paginated.

### Rollout

Done: Resources procedures (2026-09-28), `log/library` (2026-09-29 — search over title,
DAD cart and script, status chips with counts, type chips, components fetched for one
page's items; `listContentLibraryPage` in `lib/log/queries.ts`).

To do. Each is its own change, because each has to move its filters and counts into the
query first. Roughly in order of urgency:

- `admin/audit`: currently truncated at 100 rows.
- `underwriting/exceptions`, `underwriting/affidavits`, `underwriting/makegoods`: these
  grow with every airing. Exceptions filters in JS.
- `sourcework` projects, sources, and excerpts tabs.
- `underwriting/contracts`, `copy`, `underwriters`: these filter and count in JS.
  Contracts' "needs attention" filter depends on rollups, so it needs a view or function
  before it can be paged.
- `editorial` pitches: the "stale" view filters in JS. `editorial/meetings`.
- `resources/whats-new`: grouped by day, with the tool filter in JS.
- `roadmap`: sorts by votes in JS, so paging needs the sort done in SQL.
- `academic-partnerships/all`, `remote-interview`, `audience-listening` (the list, and one
  query's submissions).

## Progress, steps, and busy states (2026-09-29)

Three primitives, used together. Pick by what is true about the wait:

- **Under a second or two**: nothing but the pending `Button` (`useFormStatus`).
- **A flow with named stages** (contract setup; the program-log and library imports):
  `Steps`. Across screens each step has an `href`; within one screen `current` is derived
  from state (`plan ? 1 : 0`) and a `current` past the last step marks every step done.
  Give the list a `label` when "Steps" is too generic ("Import steps").
- **A long server step with no honest percentage** (a model reading a PDF, a single-request
  upload): `BusyPanel` — a title in the noun form ("Reading the log"), a soft hint ("This can
  take a minute") and a note saying what has and hasn't happened. Mark the current step
  `busy` with a `busyNote` of a few words. Never fake a percentage.
- **A measured quantity** (spots delivered against an order): `ProgressBar` with `done`,
  `pending` and `total`. Give it a `label` (its accessible name) — callers show their own
  visible text beside it — and let `valueText` default ("12 of 26, plus 6 pending") unless the
  screen's own wording is better.

Motion stops under `prefers-reduced-motion`: the bar's segment and the step's ring sit still, so
the words carry the meaning. A busy region that hides its input (the import's upload form) keeps
it mounted and only toggles `hidden`, so a failed run leaves the chosen file in place.
`Alert` has `warning` (asks for a decision — a date that doesn't match) and `success` (confirms
a finished action on the screen it lands on) beside the older variants.

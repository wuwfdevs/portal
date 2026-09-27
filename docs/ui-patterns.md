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
   table or card list. Search and filters are plain query-string forms and links.
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

### Rollout

Done (2026-09-27, in two passes):

- Shared components; Pools (inline create with targets, atomic via
  `uw_create_inventory_pool()`); Underwriters (list, `/new`, `/[id]/edit`, read-only detail
  aside); Industries (own view, inline create row); Contracts (already on the layout, now on
  `ListToolbar`).
- `underwriting/copy`: list on the toolbar with an approval filter; `/copy/new` and
  `/copy/[id]/edit` share `copy/copy-form.tsx`; the detail page is read-only (script, linked
  contracts, a `DetailSummary` with Edit) and keeps the approval-status control in its aside,
  since that is a workflow action, not an edit. The contract setup wizard's own copy step is
  unchanged — it links the copy to the contract in the same submit.
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

Not on the old layout, and not touched: `log/library` filters with two selects and a Filter
button rather than a search box and chips. It is a candidate for `ListToolbar` when next
worked on, not a sidebar to remove.

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

### Rollout

Done: shared components; Pools (inline create with targets, atomic via
`uw_create_inventory_pool()`); Underwriters (list, `/new`, `/[id]/edit`, read-only detail
aside); Industries (own view, inline create row); Contracts (already on the layout, now on
`ListToolbar`).

Still on the old layout, to move in this order when touched:

1. `underwriting/copy` (dedicated page); `log/programs` (the "Schedule a program" form
   moves to a program detail page or its own `schedule/new` route); `log/clocks`.
2. `editorial/settings/form`, `pillars`, and `rubric` — inline, since their records are small.
3. Review each detail-page aside individually against rule 5: `copy/[id]`,
   `exceptions/[id]`, `log/library/[id]`, `academic-partnerships/[id]`.

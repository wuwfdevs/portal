# Logic patterns

Conventions for the logic underneath the screens — form handling, reads, writes, dates, money,
gates, and the client hooks — so a new action or query reuses what exists instead of writing
its own copy. This is the counterpart to `docs/ui-patterns.md`. `CLAUDE.md` points here; read
it before writing a Server Action, a list query, or a client component that polls, copies,
listens, or uploads.

It came out of a 2026-10-09 audit of duplicated logic. The audit found the same few dozen
helpers pasted into dozens of files, and — more important than the duplication — copies that
had **drifted apart into different behavior**: one validated dates strictly and another let
`2026-02-30` through, four of seven paged lists survived a stale `?page=9` and three threw,
five search sanitisers disagreed about which characters were safe. The rule is the same as for
UI: one implementation, in a module with a test, that every tool imports.

## Where each thing lives

| Need                                          | Use                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Read a form field                             | `lib/form-fields.ts` — `field`, `optionalField`, `optionalInt`, `checkboxField`, `csvField` |
| Require a number, uuid or date                | `lib/action-fields.ts` — `numberField`, `uuidField`, `dateField` (they `failWith`)          |
| Fail an action, bounce with a message         | `lib/editorial/action-result.ts` — `failWith`, `failIfError`                                |
| Delete a row                                  | `deleteOrFail(…delete().select("id"), path, summary)` — see below                           |
| Return a result to client code                | `lib/action-response.ts` — `ActionResult`, `actionOk`, `actionError`                        |
| Read rows                                     | `lib/read-result.ts` — `unwrapRead`                                                         |
| Read one page of a list                       | `lib/pagination-read.ts` — `readPage` (+ `lib/pagination.ts`)                               |
| Put user text in a filter                     | `lib/list-search.ts` — `likeTerm`, `orIlike`                                                |
| Names for profile ids                         | `lib/profile-names.ts` — `getDisplayNames`                                                  |
| A calendar date (`YYYY-MM-DD`)                | `lib/dates.ts`; the station's "today" and zone are in `lib/log/timezone.ts`                 |
| A time of day                                 | `lib/time-of-day.ts`                                                                        |
| Money and rounding                            | `lib/money.ts`                                                                              |
| Text (slug, truncate, word count)             | `lib/text.ts`                                                                               |
| Group, index, count, sum rows                 | `lib/collections.ts`                                                                        |
| A `return_to` / `next` path from a user       | `lib/safe-path.ts` — `safeLocalPath`                                                        |
| A query string on a path                      | `lib/paths.ts` — `withQuery`                                                                |
| Sign a private-bucket URL                     | `lib/storage-sign.ts` — `signedUrl`; check the path first with `lib/storage-paths.ts`       |
| A tool's role for a user                      | `lib/auth/tool-grant.ts` — `lookupToolGrant`; parse with `lib/role-keys.ts`                 |
| A route handler's auth                        | `lib/auth/route-guard.ts` — `guardRoute` (401 signed out, 403 refused)                      |
| A write whose failure is deliberately ignored | `lib/transcription/best-effort.ts` — logs and returns false                                 |
| Which screens a Bookings write refreshes      | `lib/bookings/revalidate.ts`                                                                |

## Rules

### Writes

1. **A delete that matched nothing is not an error to Postgres.** RLS refusing a delete, or an
   id that is already gone, returns zero rows and no error, so an action that only checks
   `error` redirects as though the row went. Give the delete `.select("id")` and run it through
   `deleteOrFail`. A delete that is deliberately idempotent says so in a comment.
2. **Never discard a Supabase `error`** (CLAUDE.md). That includes the read before a write and
   the lookup that decides a role: a failed grant read must throw, not read as "no role".
3. **Audit and log a transition, not a click.** Read the prior value, write, and call
   `logAuditEvent` / the activity log only when the value actually changed. Re-saving an
   already-waived exception or dropping a card on its own column must not write a new event
   credited to whoever clicked.
4. **Path-valued `return_to`/`next` go through `safeLocalPath`.** `startsWith("/prefix")` also
   admits `/prefixX`, and an unvalidated `next` concatenated onto an origin
   (`${origin}${next}` with `@evil.com`) changes the host. A `return_to` that is a _step
   keyword_ (`copy`, `schedule`) is not a path and is compared directly.
5. **A storage path sent by the browser is checked against the entity it claims.** A Server
   Action that signs or records `storagePath` for `contractId` must check
   `pathIsUnder(contractId, storagePath)`; otherwise the id in the call is decoration.

### Reads

6. **A ranged list read goes through `readPage`.** Past the end PostgREST answers 416
   (`PGRST103`) rather than an empty page; `readPage` turns that into no rows plus the real
   total so the screen can redirect to the last page. Order by a column _and_ `id`, or equal
   values shuffle between pages.
7. **User text enters an `ilike` or `.or(...)` only through `likeTerm`/`orIlike`.** `%`/`_` are
   wildcards and commas, parentheses, quotes and backslashes are the `or` syntax's own
   delimiters.
8. **Display names are cosmetic, and that is a decision, not a default.**
   `getDisplayNames(ids)` throws on a read failure; `getDisplayNames(ids, { degrade: true })`
   logs it and renders without names. A short result (profile RLS) is never an error.
9. **Group once, not once per row.** `rows.filter(r => r.fk === row.id)` inside a `.map` is
   O(n×m); `groupBy`/`countBy` first.

### Dates and time

10. **`lib/dates.ts` validates strictly.** `Date` rolls `2026-02-30` into March, so a regex plus
    `!isNaN(new Date(...))` accepts impossible dates and Postgres rejects them later as a
    server error. `isValidDateISO` round-trips.
11. **The station's "today" is not UTC's.** `new Date().toISOString().slice(0, 10)` is tomorrow
    after about 7pm Central; use `stationTodayISO()`. Real timestamps are unaffected.
12. **Hard-code no time zone.** `STATION_TIME_ZONE` is the one place that knows the station is
    on Central time.

### Gates

13. **Every `access.ts` reads the grant through `lookupToolGrant`** and the administrator
    override through `isPlatformAdministrator`; the `roles.ts` files parse through
    `role-keys.ts`. Each tool still defines its own context type and its own `assertX` gates —
    those differ on purpose — but the lookup and the override are not restated.
14. **RLS and triggers are the boundary; the gates are the courtesy in front.** Unchanged.

### Enforcement

ESLint (`no-restricted-syntax` in `eslint.config.mjs`) fails `const { data } = await …` with no
`error` beside it — the shape behind most of the discarded errors the audit found. `auth.getUser()`
(`data: { user }`) is exempt because no user just means signed out. A genuine exception takes an
inline disable with the reason. It does not catch a bare awaited write (`await supabase.from(…)
.update(…)`); review for those.

### SQL/TS twins

Some logic exists twice — TypeScript so a screen can explain a decision, SQL so the database
refuses a bad write whatever the application does. `src/lib/sql-twins.test.ts` lists every
pair and fails if either half is renamed or removed. It does not prove they agree (that needs
a database); when you change one half, change the other and read its test. Add a new pair to
the list.

## Client hooks

| Need                                           | Use                                              |
| ---------------------------------------------- | ------------------------------------------------ |
| Close a popover on outside click or Escape     | `lib/use-dismissable.ts`                         |
| Copy text and show "Copied"                    | `lib/use-copy-to-clipboard.ts`                   |
| Poll, refresh, or tick a clock                 | `lib/use-poller.ts` (`usePoller`, `useInterval`) |
| Optimistic move with rollback (kanban)         | `lib/use-optimistic-list.ts`                     |
| A pending/error wrapper around a Server Action | `lib/use-action.ts`                              |
| Read a streamed (SSE) response                 | `lib/read-sse.ts`                                |
| localStorage / sessionStorage                  | `lib/safe-storage.ts` — never throws             |
| Upload a file from the browser to Storage      | `lib/upload-object.ts`                           |
| A window/document listener, an unload guard    | `lib/use-event-listener.ts`                      |

Why each exists: a `clipboard.writeText` with no try/catch is an unhandled rejection when the
browser denies it; `localStorage` throws in a private window; a poll whose async tick can
overlap itself stacks requests; an optimistic rollback taken from the render closure drops a
second quick move; a stream with no abort lands state updates after navigation.

## Deliberately not shared

- **Status machines.** Roadmap's, Editorial's and Academic Partnerships' share nothing but the
  idea; a generic `Transitions<S>` would save little and hide each tool's rules.
- **Label maps.** Sixty `Record<Enum, string>` maps, one per enum; only identical arrays
  (`DAY_LABEL`) were worth merging.
- **`{ error?: string }` results** in Sourcework (~60 sites). The shape works; moving every
  client consumer to `ActionResult` would change a lot for no behavior.
- **Interval-overlap helpers.** Bookings' strict minute windows, inclusive date ranges, Log's
  week-wrap minutes and Underwriting's open-ended ranges have different edge rules.
- **Hash and id generators.** Each is a few lines and tied to its tool's format.
- **`useAction`** is built and tested but not adopted: the import clients share one `pending`
  flag across two actions and a plan state, so the swap was not clean. Use it for new code.
- **Station-time `shortDate`/`monthLabel`** in `lib/underwriting/dates.ts`: `formatShortDate`
  parses a date-only string as UTC and would show the previous day west of Greenwich.
- **Chunk-embedding `truncate`** in `lib/transcription/chunking.ts`: its limit is the content
  length before the ellipsis, which is an embedding-input contract, not a display one.

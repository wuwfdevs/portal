# Notifications — design

**Status:** slice 1 (the layer, and Roadmap as its first producer) is built. Everything under "Not built" is a
decision, not an oversight.

The Portal had no notification layer. Every tool design says so (`log-design.md`, `roadmap-design.md` §6,
`remote-interview-technical-assessment.md` Finding 3, `underwriting-design.md`), and the tools that wanted to tell a
person something either polled (`router.refresh()` on an interval) or sent one email straight through
`lib/email.ts` (Audience Listening's host-request mail, Academic Partnerships' inquiry mail). This is the one place
that decides who is told, where, and whether they asked not to be.

## 1. What it is

A person is told about an **event** in up to two places:

- **The Notification Center** (`/notifications`): a list with an unread count on a bell in the header.
- **Email**, through the Portal's one sender (`lib/email.ts`, Resend).

Each person chooses, per kind of event and per place, whether they want it (`/notifications/preferences`). A tool
raises an event by calling one function. It never sends mail or writes a notification row itself.

It is **portal-level, not a tool**: no registry row, no `modules.ts` entry, no access predicate. Every active
account has a Notification Center. What a person is told about is limited by what they can open (§4).

## 2. The catalog

`lib/notifications/catalog.ts` is a static list of event types: key (`<tool>.<event>`), the tool it belongs to,
a label and one-line description for the preferences screen, and its defaults (in-app, email). It is the same kind of
thing as `modules.ts`: a manifest of what exists, **not an extension point**. A tool that wants a new kind of
event adds a line to the catalog in the same change that raises it. No registration at runtime, no plugin API.

A stored preference for a type the catalog no longer has is ignored; a catalog type with no stored preference uses
its default. So adding a type needs no migration and no backfill.

## 3. Data

Two tables (`20261115120000_notifications.sql`). Both are **per-person records and are emptied on a fresh install**
(the clearing script's default for any table not on its keep list; the prefix is classified in
`install-script.test.ts`).

- `notification_inbox`: one row per person per event. `type`, `title`, `body`, `href` (a local path, never a full
  address), `in_app` (false when the person turned the Center off for this type but still wants the email: the row is
  then only the email's outbox entry and the Center does not list it), `read_at`, the email's state
  (`none | pending | sent | failed`, attempts, next attempt, last error) and an optional `dedupe_key`. `unique
(recipient_id, dedupe_key)` makes a repeated raise harmless (nulls are distinct, so events with no key never collide).
- `notification_preferences`: `(user_id, type)` → `in_app`, `email`. **Only a choice that differs from the default is
  stored**; saving a screen that matches the defaults deletes the row. "Reset to defaults" is therefore the same
  operation as saving defaults.

### Who can read and write what

- A person **reads their own rows** and may change **only `read_at`**. Both are column grants, not just policies:
  `select` omits the email delivery columns (an error message from the mail provider is not for the recipient) and
  `update` is `(read_at)` alone, so a recipient cannot rewrite the words they were sent. `select *` on the inbox is
  refused; `lib/notifications/queries.ts` names the columns.
- A person reads and writes **their own preferences**.
- **Nobody inserts through the Portal's signed-in client.** Rows are written by `notify()` with the service client,
  because the recipient is usually not the person acting. There is no insert policy; the service role bypasses RLS.
- The two functions the scheduled run uses, `notification_claim_emails` and `notification_finish_email`, are
  `execute` for `service_role` only (revoked from `public, anon, authenticated` by name), like every other
  server-only function in this database.

## 4. Raising an event: `notify()`

```ts
await notify({
  type: "roadmap.status_changed",
  recipients: [post.author_id], // ids; the function drops duplicates
  actorId: profile.id, // never notified of their own action
  title,
  body,
  href: "/roadmap/<id>",
  dedupeKey: "status:<post>:<changedAt>", // optional
});
```

`lib/notifications/notify.ts` (server-only) then, for each recipient:

1. drops the actor and anyone whose account is not active;
2. drops anyone who **cannot open the tool the type belongs to** (tool off, or the tool needs a grant and they have
   none: the same rule as `canUseTool`, restated for a service-client caller as `ownerMayRun` does, using
   `grantRequiredForTool`). A notification is never a way to learn that something exists;
3. reads their preferences and resolves in-app and email (pure: `lib/notifications/plan.ts`, tested);
4. skips anyone with both off; otherwise inserts one row, `email_state = 'pending'` when email is wanted.

**It never throws and never delays the action that raised it.** A failure is logged without the title or body, and the
action goes on, exactly as `notifyHostRequest` does. The email is **not sent inline**: `notify()` only queues it
(§5). So a slow or down mail provider cannot slow a save, and a failed send is retried.

`href` must be a local path (`safeLocalPath`); anything else is stored as null.

## 5. Email: queued, sent by the scheduled run

`api/cron/notifications` (`vercel.json`, **every minute**, `Authorization: Bearer CRON_SECRET`, 401 with none set,
listed in the middleware's `PUBLIC_PATHS` and in `modules.test.ts`'s platform list) does two small things:

1. **Send queued email.** `notification_claim_emails(25)` takes up to 25 due rows with `for update skip locked` and
   pushes each one's next attempt five minutes out (a lease), so two overlapping runs cannot send the same row twice.
   Each is sent through `sendEmail`; `notification_finish_email` then records `sent`, or schedules a retry with a
   growing delay, or `failed` after five attempts. A crash between claim and finish costs a retry five minutes
   later, never a duplicate send and never a lost row.
2. **Housekeeping.** In the first minute of each hour, rows older than 90 days are deleted.

If email is not configured (`isEmailSendingConfigured()` false) the run **does not claim anything**, so rows wait
rather than burn their attempts, and the response says so. The Notification Center works regardless.

The run answers with counts only. It logs no address, title or body.

**What an email says.** The title, the body, a link to the page, and a line pointing at the preferences screen. It is
plain text and station-neutral (the Portal names no station in a message). Tools decide what goes in `title` and
`body`; a tool whose content must not travel by email (Audience Listening's visitor messages) puts only a pointer in them.

## 6. The screens

- **The bell** in the header, left of the account menu, with an unread count (99+ caps it). If the count cannot be read
  (the migration is not applied yet) the bell shows with no number rather than failing every page.
- **`/notifications`**: newest first, paged (`?page=`, 25), unread marked. Opening one marks it read and goes to
  its link (`openNotification`); "Mark all as read". An empty Center says so.
- **`/notifications/preferences`**: the catalog grouped by tool, two checkboxes per type (Notification Center,
  Email), a Save, and the people-facing note that email goes to the address on their account. The link sits in the
  Center's header and the account menu.

Polling: the count is read on each page load. There is no live push in slice 1; `/notifications` is a server page. A
small refresher is the next step if people want the bell to move without a navigation.

## 7. Roadmap, the first producer

Roadmap was chosen because every active staff member is a member (nothing to route), nothing in it is urgent, and its
own design already defers "a digest of recent status changes" until this exists.

| Type                     | Told                 | When                                 | Default       |
| ------------------------ | -------------------- | ------------------------------------ | ------------- |
| `roadmap.status_changed` | the request's author | a curator moves it to another status | Center, email |
| `roadmap.comment_added`  | the request's author | someone else comments on it          | Center only   |

A curator moving their own request, or an author commenting on their own, tells nobody. A declined request's reason is
in the message, because the author is owed it.

## 8. Not built (and why)

- **Digests.** The scheduler is there now, but a digest needs a preference mode, a "what was in the last one" mark
  and its own text. Nothing in slice 1 needs it. When it does, `notification_preferences` grows a column; no data moves.
- **Types that cannot be turned off.** No type shipped here is one. When access changes need telling, add a
  `mandatory` flag to the catalog and have the preferences screen show it as fixed; the resolver is the one place that changes.
- **Live push** to the bell, and **web push**.
- **Other tools.** Next, in this order: Underwriting exceptions (a database trigger raises an exception when a credit
  does not air; routing it to managers is the work), Editorial meeting reminders (time-based, so a task in the
  scheduled run), Audience Listening's mailbox emails moved onto this layer, Remote Interview's admission (needs
  real-time, not mail; leave it out).
- **Per-station email branding or a separate sender.** It uses `RESEND_FROM_EMAIL`.
- **Anything for people without an account.** Public-form visitors are not notified from here.

## 9. Checks

`plan.ts`, `catalog.ts`, `preferences.ts` and `email-text.ts` are pure and tested. The scheduled run's claim/finish
functions and the RLS grants were written but **not run against a live database in the session that built them**;
verify on preview before production: a recipient cannot update `title`, cannot select the delivery columns, cannot
read another person's row; two concurrent `notification_claim_emails` calls return disjoint rows.

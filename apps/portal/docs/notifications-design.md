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
a label and one-line description for the preferences screen, **who it is told to** (`audience`, in words, shown under the type so a person can see why they get it), and its defaults (in-app, email). It is the same kind of
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

## 3a. Who is told: the tool decides, `notify()` only narrows

An event is raised **for the people it concerns**, not for everyone who can open the tool. A request's author, a Sourcework
project's owner, the holders of a role: the tool that raises the event knows who that is, works out their ids and passes them
as `recipients`. The layer has no "everyone with access" shortcut on purpose, because that is how people end up with a
bell full of things that are not theirs.

What the layer adds is only ever **narrowing**: it drops the person who acted, anyone inactive, anyone who cannot open the
tool, and anyone who turned the type off. So a mistake in a tool's audience can over-include (a tool's bug) but the layer never
adds a person the tool did not name.

Rules for a tool raising an event:

- Name the audience in the catalog entry (`audience`), in the same change as the event.
- Pass the smallest set of ids that is right. A Sourcework project event goes to that project's owner, not to Sourcework's members.
  A group audience (everyone holding a role) is fine when the event is about the role's work, not about one record.
- If someone should be able to follow or mute one record (this project, not that one), that is a subscription. It is not built:
  it would be a `scope` on `notification_preferences` and a "mute this" control where the record is shown. Add it when the first
  event needs it, not before.
- Resolving a group is the tool's query (its own role helper, e.g. `lib/roadmap/roles.ts`); a shared resolver goes in
  `lib/notifications/` when a second tool needs the same one.

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
action goes on, exactly as `notifyHostRequest` does. `notify()` writes the row, and the email goes out **right after the
response** (`after()` from `next/server`), not at the next scheduled run. It is queued first, so a slow or down mail
provider cannot slow a save, and a failed send is retried (§5).

`href` must be a local path (`safeLocalPath`); anything else is stored as null.

## 5. Email: sent as it happens, queued so it is never lost

**Why not just send on the event, and why not only a schedule?** Sending inline in the request ties a save to a mail
provider's speed and uptime, and loses the email if the provider hiccups or the function is cut off. A schedule alone makes
every email wait for the next tick. So both: the row **is** the queue. `notify()` inserts it (`email_state = 'pending'`) and
asks `after()` to send right after the response, so the email normally leaves within a second or two of the event. A
scheduled sweep is the safety net for what did not go out then: a send that failed and is waiting to retry, a crash between
claim and send, or an event raised with no request to hang `after()` on (a scheduled task or a webhook).

`api/cron/notifications` (`vercel.json`, **every five minutes**: the retry delay and the lease are both multiples of five, so a
tighter schedule would find nothing to do; `Authorization: Bearer CRON_SECRET`, 401 with none set, listed in the middleware's
`PUBLIC_PATHS` and in `modules.test.ts`'s platform list) does two small things:

1. **Send queued email.** `notification_claim_emails(25)` takes up to 25 due rows with `for update skip locked` and
   pushes each one's next attempt five minutes out (a lease). The immediate send and the sweep use the same claim, so they
   can never send one row twice. Each is sent through `sendEmail`; `notification_finish_email` then records `sent`, or
   schedules a retry with a growing delay, or `failed` after five attempts. A crash between claim and finish costs a retry
   five minutes later, never a duplicate send and never a lost row.
2. **Housekeeping.** In the first run of each hour, rows older than 90 days are deleted.

If email is not configured (`isEmailSendingConfigured()` false) nothing is claimed, so rows wait rather than burn their
attempts, and the response says so. The Notification Center works regardless.

The run answers with counts only. It logs no address, title or body.

**What an email says.** The title, the body, a link to the page, and a line pointing at the preferences screen. It is
plain text and station-neutral (the Portal names no station in a message). Tools decide what goes in `title` and
`body`; a tool whose content must not travel by email (Audience Listening's visitor messages) puts only a pointer in them.

**Configuration.** No variable is specific to notifications. `CRON_SECRET` (the scheduler's bearer token; a secret, so a
variable, shared with Audience Listening's run), `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (the sender is on a domain verified
in the Resend account the key belongs to, so it is set with the key, as it is for every existing sender), and
`NEXT_PUBLIC_SITE_URL` (the Portal's own address, which the links in an email use). Nothing here belongs in
Administration → Station: there is no per-station choice to make. The in-app Center needs none of them.

## 6. The screens

- **The bell** in the header, left of the account menu, with an unread count (99+ caps it). If the count cannot be read
  (the migration is not applied yet) the bell shows with no number rather than failing every page.
- **`/notifications`**: newest first, paged (`?page=`, 25), unread marked. Opening one marks it read and goes to
  its link (`openNotification`); "Mark all as read". An empty Center says so.
- **`/notifications/preferences`**: the catalog grouped by tool, two checkboxes per type (Notification Center,
  Email), a Save, and the people-facing note that email goes to the address on their account. The link sits in the
  Center's header and the account menu.

The count is read on each page load; the bell does not move on its own. **Live push to the bell is not built, and Supabase
Realtime is not the way to do it as the table stands:** Realtime sends whole rows (it enforces row policies but not column
grants), which would put the email delivery columns the grant keeps from a recipient onto the wire. If it is wanted, push a
payload of the visible columns (a broadcast from `notify()`) instead of subscribing to the table.

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

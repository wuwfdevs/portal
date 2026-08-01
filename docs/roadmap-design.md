# Roadmap — Product & Engineering Design

The fifth tool on the portal foundation, and the first one that is about the portal
itself: a place where the people who use these tools ask for what they should do
next, vote on what other people asked for, and follow what is planned, in progress,
and shipped.

Two portal-foundation changes fall out of it — a `proposed` tool status, and making
`tools.default_access = 'approved_staff'` mean something. Both are recorded in §6.

Read this before changing anything under `src/app/(portal)/roadmap/`,
`src/lib/roadmap/`, or the `rd_*` tables.

---

## 1. The problem we're solving

Four tools are in production and there is no route for "this should work
differently." Requests arrive in hallway conversation, in a Slack thread nobody
scrolls back to, and in the middle of an unrelated meeting. Three things go wrong,
every time:

**Requests evaporate.** The person who had the idea is not the person who writes the
code, and the gap between them is a conversation with no artifact. A month later
nobody can reconstruct who asked for what, or whether it was ever considered.

**Nobody can tell what is already wanted.** Two reporters independently asking for
the same thing looks like two isolated preferences rather than one strong signal.
There is no way for the third person to say "yes, that, please" without starting
another conversation.

**There is no answer to "what's next."** The roadmap lives in the head of whoever is
building. Someone who asked for something in March has no way to learn in May that it
was declined in April, or that it shipped last week.

The tool is deliberately small and deliberately internal. It is a suggestion box that
turns into a roadmap because the same rows serve both — the intake side and the
published side are one list under two views, not two systems that have to be kept in
sync.

---

## 2. Product model

Three objects, and one borrowed one.

### Post
A single request. It has a **title**, a rich-text **body**, a **kind**
(`feature` / `improvement` / `bug` / `new_tool`), an author, and — this is the part
that makes the tool more than a list — a **target**: the thing the request is about.

### Target
A post is either about **an existing tool** (Sourcework's search should do X, the
editorial rubric needs a field), or about **a tool that doesn't exist** (we should
build a newsletter builder). The second kind is the reason for the `proposed` tool
status: see §6.

A post can also target nothing at all. "The portal sign-in should remember me" is
about the portal, not about a tool, and forcing it to pick one would be a worse
record than leaving it unset.

### Vote
One per person per post, and that is the whole model. No weights, no budgets, no
downvotes. A downvote on a colleague's request in a twelve-person newsroom is a
social act, not a signal, and the tool should not offer it.

### Comment
Flat, chronological, rich text, on a post. Not threaded — a thread on a
twelve-person newsroom's feature request is a nesting level nobody needs, and flat
comments read correctly at this scale.

### Status, and why it is the roadmap
Every post carries one of six statuses:

| Status | Meaning |
| --- | --- |
| `open` | Filed. Nobody has looked at it yet. |
| `under_review` | Someone is thinking about it. Not a promise. |
| `planned` | It is going to be built. Not started. |
| `in_progress` | Being built now. |
| `shipped` | Done and available. |
| `declined` | Not going to be built — **with a required note saying why.** |

The **Requests** tab is every post, sorted by votes or by date. The **Roadmap** tab is
the same posts grouped by the last four statuses. That is the entire relationship
between "wishlist" and "roadmap": one list, two views. There is no separate roadmap
object to keep in sync, and no way for the roadmap to describe something nobody asked
for on the record.

The required note on `declined` is the one piece of friction in the workflow, and it
is deliberate. "No" without a reason is the failure mode that stops people filing
requests at all.

### Roles
Two, and they invert the portal's usual arrangement:

- **Member** — any active staff member. Posts, votes, comments, edits and deletes
  their own post and their own comments.
- **Curator** — a member with `tool_access.tool_role = 'curator'`. Additionally moves
  a post's status, writes the decision note, and relinks a post to a different tool.

Everything else in this portal treats a `tool_access` grant as the ticket in. Here
entry is open to every active staff member (§6), so a grant stops being the ticket
and becomes the elevation. That is a deliberate reuse of the existing column, not a
new permission system: the portal still doesn't interpret `tool_role`, this tool
does.

---

## 3. Primary user workflows

### A. Filing a request
From `/roadmap`, **New request**. Title, kind, an optional target tool, and a
rich-text body. If the kind is `new_tool` and no proposed tool exists to point at
yet, the author types what it should be called; an administrator can turn that into a
real proposed-tool row later (§3E).

The post lands as `open`. No approval step — a request nobody has read yet is
`open`, not `pending`, and a moderation queue in a twelve-person newsroom is
ceremony.

### B. Voting
One click on a post, in the list or on the post itself. Clicking again removes the
vote. Sorting by **Most wanted** is the default on the Requests tab; **Newest** is
the other option.

The vote is a row, not a counter — the composite primary key `(post_id, user_id)` is
the one-vote rule, enforced in the database rather than by an action remembering to
check.

### C. Discussion
Comments are rich text, appear in the order written, and are editable and deletable
by their author. A curator can delete a comment; nobody can edit someone else's.

### D. Curation
On any post, a curator sees the status controls the rest of the tool doesn't: the
statuses reachable from the current one (§4's state machine), and, when declining, a
required note. The status change stamps `status_changed_at`/`status_changed_by` and
writes an audit event.

A curator can also correct the target — a request filed with no tool, or against the
wrong one, gets relinked rather than re-filed.

### E. Proposing a new tool for real
"We should build a newsletter builder" starts as free text on a post. When it becomes
a thing worth tracking as a target — because a second person filed a related request,
or because it is now on the roadmap — an administrator creates a **proposed tool** at
`/admin/tools/new` and links the post to it. From then on it behaves like any other
target: posts can be filed against it, filtered by it, and grouped under it, while
staying invisible on the dashboard because it isn't software yet.

The promotion is administrator-only, not curator-only, because it writes into
`public.tools` — the portal's own registry, which `tools_write_admin_only` has always
restricted to platform administrators. That boundary doesn't move for this tool.

---

## 4. Screens

```
/roadmap                        Requests tab (default) and Roadmap tab
/roadmap/new                    Compose a request
/roadmap/[id]                   The post: body, votes, curation controls, comments
/roadmap/[id]/edit              Author (or curator) editing title/body/target
/admin/tools/new                Administrator: create a proposed tool
```

**`/roadmap?tab=requests`** — filters for status, kind, and target tool, plus a
sort toggle; one row per post with its vote button, kind, target, status badge, and
comment count.

**`/roadmap?tab=roadmap`** — the same posts grouped under Planned / In progress /
Shipped, with Declined collapsed below. `open` and `under_review` posts do not appear
here; the roadmap is what has been decided, and the Requests tab is where everything
else lives.

**`/roadmap/[id]`** — the post, its rendered rich-text body, vote button, target
badge, status, and — for a curator — the status controls. Below it, the comment
thread and a composer.

### The status state machine

Expressed once, in `lib/roadmap/posts.ts`'s `availableStatusActions()`, as a `switch`
with no `default` so a new enum member is a compile error rather than a silently
missing transition:

```
open          → under_review, planned, declined
under_review  → planned, in_progress, declined, open
planned       → in_progress, declined, under_review
in_progress   → shipped, planned
shipped       → in_progress          (undoing a premature "shipped")
declined      → open                 (reconsidering)
```

Every transition is reversible in at least one direction. A status is a statement
about the present, not a ratchet.

---

## 5. Data model

Three tables, prefixed `rd_` per CLAUDE.md's directory conventions. See
`supabase/migrations/<ts>_roadmap.sql`.

### `rd_posts`
`id`, `title`, `body jsonb` (a ProseMirror document — §6), `body_text` (a plain-text
projection maintained at write time, for list excerpts and future search), `kind`,
`status`, `tool_id` (nullable → `public.tools`), `proposed_tool_name` (free text, for
a new-tool request with no registry row yet), `author_id`, `status_note`,
`status_changed_at`, `status_changed_by`, `created_at`, `updated_at`.

Three named check constraints carry rules that must not depend on an action
remembering them: a title length bound, "declining requires a note", and "a
`new_tool` post must name its target one way or the other".

### `rd_votes`
`(post_id, user_id)` composite primary key, `created_at`. Both foreign keys cascade.
There is nothing to update on a vote — it exists or it doesn't.

### `rd_comments`
`id`, `post_id`, `author_id`, `body jsonb`, `body_text`, `created_at`, `updated_at`.

### No denormalized counts
`rd_posts` deliberately has no `vote_count`/`comment_count` columns. Counts come from
two grouped reads merged in memory in `listPosts()` — the same flat-reads-plus-`Map`
shape `listQueries()` uses in `lib/audience-listening/queries.ts`, which this codebase
already reaches for because `database.types.ts` is hand-written with empty
`Relationships` and PostgREST embedding has no foreign-key metadata to type against.

At this scale that is cheaper than trigger-maintained counters, and — the real
reason — it keeps the curation guard trigger (§6) from having to tell an application
update apart from its own counter update. A counter that a trigger maintains is a
counter the guard has to whitelist, and a whitelist in a security trigger is exactly
where a bypass hides.

---

## 6. Architecture

### RLS is the whole boundary here, and that is a change of posture

Audience Listening needed seven `security definer` functions because its rows are
half public and half internal, and RLS cannot split a row. Roadmap has no such
problem: every reader is an authenticated staff member, and every column on an
`rd_posts` row is safe to hand any of them. So this tool goes back to the ordinary
arrangement — plain RLS policies on plain tables, with the tool's own predicate as
the membership test.

Do not add `security definer` functions to this tool without a reason of the same
kind. The public-surface pattern is a cost paid for a problem this tool does not have.

### `private.has_roadmap_access` reads `default_access`, and why

The other four tools' predicates all ask the same question: does this user hold a
non-revoked `tool_access` row for this tool? Roadmap's asks a different one:

```sql
create function private.has_roadmap_access(uid uuid) ...
  select exists (
    select 1 from public.tools t join public.profiles p on p.id = uid
    where t.key = 'roadmap' and t.enabled and p.account_status = 'active'
      and (t.default_access = 'approved_staff'
           or exists (select 1 from public.tool_access ta
                      where ta.tool_id = t.id and ta.user_id = uid
                        and ta.revoked_at is null))
  );
```

`tools.default_access` has carried three values since the platform schema was
written, and its own column comment has always described `approved_staff` as "any
active user may open it" — followed by "not yet enforced beyond active accounts."
Roadmap is the first tool that wants it, so this is where it becomes real.

A wishlist that an administrator has to grant one person at a time collects nothing.
That is the product reason. The engineering reason to read the column rather than
hard-code "everyone" is that an administrator can tighten the tool to `invite_only`
from the existing registry screen and this predicate follows, with no code change and
no migration.

The application-side gate learns the same rule:
`src/lib/tool-access-rules.ts`'s `grantRequiredForTool()` is the single pure
predicate that `lib/auth/authz.ts` (`requireToolAccess`/`assertToolAccess`) and
`lib/tools.ts` (the dashboard card's access state) both read. Every existing tool is
`invite_only`, so none of their behavior changes.

RLS remains the real boundary; the gate keeps people off screens that would render
empty.

### `proposed` is a tool status, not a roadmap-local table

A request to build something that doesn't exist needs a target. The obvious cheap
answer is a `rd_proposed_tools` table, and it is wrong: the moment the thing gets
built, every post pointing at the local row has to be migrated to point at the
registry row instead, and until then the two kinds of target need parallel handling
in every filter, badge, and picker.

So a proposal is a `public.tools` row with `status = 'proposed'` and
`enabled = false`. A post's `tool_id` means the same thing whether the target ships
today or is an idea, and promotion — the thing that actually happens when a proposal
becomes real — is a status change on one row, not a data migration.

What `proposed` must not do is leak into the places `tools` rows are treated as
software:

- **The dashboard** filters proposed rows out (`isListedOnDashboard()` in
  `lib/tool-access-rules.ts`, applied in `listToolsForCurrentUser`), and
  `getToolCardState()` additionally returns a `hidden` mode so the rule is written
  down in the tested pure function and not only in the query.
- **The admin grant pickers** (invite, edit user) exclude them — a proposed tool is
  not something access can be granted to.
- **`/tools/[slug]`** needs no change: `getToolByKey` is RLS-scoped and the additive
  policy below grants `select` only, so the placeholder page renders for a member and
  404s for anyone else. Its copy learns the third word.

The one thing that must see them is this tool, which needs one additive policy:

```sql
create policy tools_select_proposed_for_roadmap on public.tools
  for select to authenticated
  using (status = 'proposed' and private.has_roadmap_access(auth.uid()));
```

Narrowly scoped on purpose: `enabled = false` on a real, disabled tool stays hidden
from everyone but administrators, exactly as before.

### The curation guard is a trigger, not a policy

`rd_posts_update` admits the post's author, because an author edits their own title
and body. RLS is row-level: the same policy that lets them rewrite the body lets them
set their own `status` to `planned` through PostgREST, without ever loading the page
whose buttons we carefully hid.

This is the same shape of hole `ri_bind_guest_participant()` and
`ri_guest_join_waiting_room()` closed for Remote Interview, where "a plain RLS update
policy on a guest's own row would also let them set their own `admitted_at`." The
answer there was a function; here, where the write is otherwise ordinary, it is a
`before update` trigger:

```sql
if (new.status, new.status_note, new.kind, new.tool_id)
   is distinct from (old.status, old.status_note, old.kind, old.tool_id)
   and not (private.is_roadmap_curator(auth.uid())
            or private.is_administrator(auth.uid()))
then raise exception ...
```

Hiding the button is a courtesy. This is the boundary.

### Rich text is ProseMirror JSON, not HTML and not markdown

The bodies here are proposals and discussion — they want links, lists, and emphasis,
and they are written by reporters, not developers. That rules out a bare textarea and
argues against markdown syntax as the authoring surface.

The editor is Tiptap (`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/pm`) — three
dependencies, and the first rich-text dependencies in this repository. What is stored
is the editor's **JSON document**, in a `jsonb` column.

Storing JSON rather than HTML is the load-bearing choice:

- **There is no sanitizer, because there is no HTML.** Rendering walks the document
  and emits React elements. Nothing in this codebase calls
  `dangerouslySetInnerHTML` — that was true before this tool and it stays true after
  it. A sanitizer is a dependency whose correctness you have to trust; a whitelist
  renderer is code you can read in one sitting and unit-test.
- **The whitelist is explicit and lives in one file.**
  `lib/roadmap/rich-text.ts` — pure, no React, no Supabase, colocated test — holds
  `parseRichText()` (drops unknown node types and marks, clamps headings to levels
  2–3, and accepts a link `href` only if it starts with `/`, `http://`, or
  `https://`, the same reasoning as the link parser in
  `components/agent-chat-widget.tsx`), `richTextToPlainText()`, and
  `isEmptyRichText()`.
- **It is validated twice.** Actions run `parseRichText()` on the way in and store the
  normalized document; the renderer ignores anything not in the whitelist on the way
  out. Neither pass trusts the other.

The editor is a client component that writes `JSON.stringify(editor.getJSON())` into a
hidden input on every change, which is what lets the surrounding form stay the
repository's ordinary `<form action={serverAction}>` with hidden inputs — no
`useActionState`, no client-side submit handler. It is loaded through
`next/dynamic({ ssr: false })` so ProseMirror never enters the server bundle or a
read-only page's JavaScript.

`body_text` is derived from `body` by `richTextToPlainText()` at write time. It exists
so the list page can show an excerpt without shipping and walking every document, and
so a future search has something to index. It is a projection, not a second source of
truth — nothing reads it as authoritative.

### Audit events are scoped to curation, and so is the policy

Every other tool's additive `audit_events` insert policy admits that tool's members.
Here "member" is every active staff member, and a policy that broad would let anyone
in the portal write audit rows.

So only curation is audited — `roadmap.post.status_changed`,
`roadmap.post.tool_linked`, `roadmap.post.deleted`, `roadmap.tool.promoted` — and the
policy is scoped to match:

```sql
create policy audit_events_insert_roadmap_curator on public.audit_events
  for insert to authenticated
  with check (private.is_roadmap_curator(auth.uid()) and actor_id = auth.uid());
```

Filing a post and leaving a comment are ordinary writes by ordinary users, with the
author recorded on the row itself. They are not privileged actions and do not belong
in the audit log.

### Fit with portal conventions

Nothing here is new machinery. The route segment is gated once in `layout.tsx` by
`requireRoadmapAccess()` (Editorial's `access.ts` is the model, because Roadmap is the
second tool with a role); writes are Server Actions in one `actions.ts` that
`assert` first and bounce failures back through `failIfError`/`failWith`; reads live
in `lib/roadmap/queries.ts` behind `unwrapRead()`; pure logic (the status machine,
the badge maps, validation, the rich-text whitelist) sits in colocated
`*.test.ts`-covered modules with no Supabase import.

Two capabilities — `roadmap.post.create` and `roadmap.post.list` — are registered in
`lib/capabilities/registry.ts`, which gets them into the MCP server and the in-portal
agent for free.

### What's deliberately not in the architecture

- **No attachments.** See §7.
- **No notifications.** There is still no notification layer in this repository, and
  this tool is not the place to build one. A status change is visible the next time
  someone opens the post.
- **No duplicate merging.** A curator who spots two posts asking for the same thing
  declines one with a note pointing at the other. Merging is a real feature with real
  edge cases (whose votes? whose comments?) and it is not worth building before
  anyone has hit the problem.
- **No public roadmap page.** Everything here is behind portal auth. A published,
  audience-facing roadmap is a different product with different editorial stakes.
- **No estimates, dates, or priorities beyond votes and status.** They would be
  fiction, and fiction on a roadmap is worse than silence.

---

## 7. Milestone 1, and what is left

**Milestone 1 (this one)** ships the whole path: file a request with formatted text,
target it at a tool that exists or one that doesn't, vote, discuss, and follow it
through a curated status workflow on a roadmap view — plus the two foundation changes
(`proposed` status, `approved_staff` enforcement) and the administrator screen that
creates a proposed tool, which the portal has never had.

**Deferred, in rough order of likely usefulness:**

1. **Screenshot and image attachments.** The single most-requested thing a tool like
   this grows, and genuinely useful for bug-flavored posts. It needs a
   `roadmap-media` bucket with policies scoped to the author of a post, an upload
   path, and an `image` node in the whitelist and the renderer. Deferred because it
   is a meaningful chunk of scope and nothing about the schema blocks adding it
   later.
2. **Search.** `body_text` already exists for it. The `tw_search`/`tw_chunks` FTS
   machinery in `lib/transcription/` is more than this needs; a plain
   `websearch_to_tsquery` over `title || body_text` would do.
3. **Duplicate merging**, if and when someone actually hits the problem.
4. **Digest of recent status changes**, once there is any notification layer to
   attach it to.

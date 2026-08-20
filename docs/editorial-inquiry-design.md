# Editorial Inquiry — design

## 1. The problem we're solving

A reporter usually starts a story from something too broad to report: a guiding
question like "how does a region sustain service members, families, and
communities amid national-defense demands?" Getting from there to a concrete,
reportable story question — "how many junior-enlisted families near NAS
Pensacola have taken on second jobs since BAH was last recalculated in 2023,
and what does that cost the base in retention?" — is iterative, and today it
happens in a reporter's head, a notebook, or a chat transcript that has no
structure once the conversation is over.

Editorial Inquiry gives that process a durable, navigable shape: a **question
tree**, not a chat log. A reporter starts from one seed guiding question and
works outward — generating related angles, narrowing a question into
something specific, rejecting dead ends, promoting validated questions, and
discussing a single question with an AI collaborator that can challenge an
assumption, concede a point, or spin off a new angle. The tree is the record
of the reporting process, not a transcript of talking to a model.

## 2. Product model

### The tree

- **Root** — the seed guiding question. One per inquiry, created when the
  inquiry starts, never rejected or promoted (it isn't a story question
  itself).
- Every other node is a **question** at some depth under the root. Depth 1 is
  a "line of inquiry" — a durable angle on the guiding question. Depth 2 and
  beyond are narrower questions descending from one.
- **Status**: `active` (the default), `rejected` (a dead end — kept in the
  data, hidden from the canvas along with its descendants, never deleted),
  or `promoted` (a validated, reportable story question).

### Actions, per question

- **Explore** — ask the model for a new **sibling**: a different angle at the
  same depth, same parent. Doesn't narrow or broaden the question, reframes
  the same level of the tree.
- **Drill down** — ask the model for a new **child**: a question one level
  deeper that narrows the current one into something more specific.
- **Reject** — mark `rejected`. Depth 0 (the root) can never be rejected;
  everything else can, as long as it's still `active`. Descendants stay in
  the data but disappear from the canvas with their rejected ancestor.
- **Promote** — mark `promoted`. Requires depth ≥ 2: a line of inquiry
  (depth 1) is a thematic frame, not yet something a reporter could take into
  the field, so it isn't eligible until it's been drilled down at least once.
- **Add context** — attach a note, link, or excerpt to a question. Context
  **inherits down the branch**: anything attached to an ancestor is visible
  on every descendant. There's no separate "whole-inquiry" bucket — attaching
  a note to the root is how a reporter covers the whole inquiry, because
  every question descends from it.
- **Discuss** — a conversational thread scoped to exactly one question. The
  model can reply plainly, propose a **reframe** (a rewritten version of the
  question the reporter applies with one click — never automatic), spin off
  a new **sibling** (added to the tree immediately, the same shape as
  Explore), or attach a **context** note (added immediately, the same shape
  as Add Context). The thread persists per question and reopens with its
  full history.

### Structural cues

Each node shows, at a glance: whether it (or something it inherited) rests on
an **unexamined assumption** the model flagged when it generated the
question; how many context notes are attached, own plus inherited; and its
status, each styled distinctly (active / rejected — greyed, struck through /
promoted — lime, WUWF's highlight color).

### Multiple inquiries

A reporter works more than one inquiry in parallel. Clicking the guiding
question in the header opens a switcher: every saved inquiry, plus a field to
start a new one by typing a custom seed question. Each inquiry has its own
independent tree, context, and discussion history — nothing is shared across
inquiries except the reporter's account.

## 3. Architecture

### Access

Invite-only, like every tool except Roadmap: a `tool_access` grant is the
ticket in (`private.has_editorial_inquiry_access`, mirroring
`private.has_academic_partnerships_access`). **No elevated role.** Unlike
Log's producer or Academic Partnerships' coordinator, nothing in this tool's
milestone 1 needs a privileged action gated apart from ordinary membership —
every action (grow the tree, reject, promote, add context, discuss) is
something any reporter with access does for their own inquiries. If a real
need for one surfaces later (e.g., an editor-only "delete inquiry"), it's
added then, the same way Underwriting's manager role wasn't defined until
Slice 2 gave it something to gate.

Inquiries are **shared within the tool**, not per-reporter siloed: any member
can open, extend, or discuss any inquiry. A small newsroom's editorial
process benefits from that visibility the same way Sourcework's projects and
Log's content library are shared, not owned. `created_by` on each row is
provenance, not an access boundary.

### The canvas: no new dependency

The interaction model — infinite pan/zoom canvas, draggable nodes, a
tree-layout algorithm, a minimap, a docked collapsible inspector — is fully
worked out in the concept mockup
(`WUWF Inquiry Canvas Concepts.dc.html`, prototyped with Claude Design) and
implemented there in plain state/DOM logic: manual `translate()/scale()` CSS
transforms for pan/zoom, a from-scratch tree-layout pass (position each node
by depth × column width, vertically centered under its children, jittered
and offset by any manual drag), SVG bezier paths for edges, and a minimap
that's just the same layout rescaled into a small box. None of it depends on
a canvas, virtualization, or pan/zoom library — this repo has none, and
CLAUDE.md asks for a specific reason before adding one. There isn't one
here: the mockup's from-scratch approach is a straightforward client
component, so Editorial Inquiry's canvas is built the same way, ported from
the mockup's logic into real React state (`useState`/`useRef` in place of
the mockup's own `setState`), not a new dependency.

Manual node repositioning **persists**: unlike the single-session mockup,
`ei_questions.manual_dx/manual_dy` store a reporter's drag offset from the
computed layout position, so rearranging the canvas survives a reload. Null
(the default) means "use the computed layout position."

### Talking to the model

`openai` is already a dependency (the in-portal agent chat,
`src/lib/agent/chat.ts`, and Sourcework's embeddings both use it), so this
tool's AI calls reuse it rather than hand-rolling `fetch()` — but the calling
shape is different from the agent chat on purpose. The agent chat is a
general tool-calling loop over portal capabilities, streamed, with no
structured output. Editorial Inquiry's model calls are narrow and structured:
"generate one sibling question," "generate one child question," "take one
turn in a discussion and decide whether it implies a tree action." Each of
those has one well-defined shape of answer, so `lib/editorial-inquiry/ai.ts`
uses the Responses API's JSON-schema structured output
(`text: { format: { type: "json_schema", ... , strict: true } }`) rather than
free-text parsing — this repo's first use of structured output, noted
explicitly in the module's own comment since nothing else here does it yet.
Calls are synchronous `responses.create()`, not streamed: a discuss turn or a
generated question is a few sentences, not a long-form reply worth
token-by-token rendering, and this keeps the Server Action model (await, then
return a result) that the rest of the interactive UI below already uses.

Same optional-key posture as every other integration in this repo: if
`OPENAI_API_KEY` is unset, every AI-backed action (`explore`, `drillDown`,
`sendChatMessage`) fails clearly with "The assistant isn't configured yet,"
the same message `chat.ts` already uses — never a silent no-op, and manual
tree-building (typing a question directly, the fallback path — see §7) still
works.

Every generation call is given the ancestry chain from root to the question
acted on (so the model has the full frame, not just one question in
isolation), the active siblings/children at that node (so it doesn't
regenerate a duplicate angle), and every context note inherited down that
branch. A discuss turn additionally gets the thread's prior messages. The
model is instructed in NPR-member-station voice: calm, factual, precise,
investigatable — no hype, no rhetorical questions posing as findings.

### Interactive Server Actions, not redirect-based ones

This is a canvas, not a form-per-page screen: reloading the page on every
action would drop pan/zoom/selection state. So `actions.ts` follows the
pattern Roadmap's kanban board established for exactly this reason
(`movePostStatus()`) — plain async functions returning
`{ok: true, data} | {ok: false, error}`, called directly from the client
canvas component (`startTransition` wraps the call), never `redirect()` or
`FormData`. There's no non-JS `<form>` fallback for canvas actions, matching
the kanban boards' own precedent of pairing a "courtesy" keyboard/no-JS path
only where one is easy to reach (the multi-inquiry switcher and "new
inquiry" field, which are ordinary form-shaped surfaces, do use the
`failIfError`/`failWith` redirect pattern like the rest of the portal).

### Capabilities

Not part of milestone 1. Every other tool added its first `defineCapability`
entries in a phase _after_ its own milestone 1 landed (Academic Partnerships,
Log). If Editorial Inquiry's actions are worth driving from the in-portal
agent later, that's a follow-up phase with its own instruction, not assumed
here.

## 4. Data model

Tables are prefixed `ei_`.

### `ei_inquiries`

One row per guiding question a reporter has started. `seed_question` is the
inquiry's identity — there's no separate title field; the switcher shows a
truncated `seed_question`, matching the mockup.

| column                     | type                                | notes           |
| -------------------------- | ----------------------------------- | --------------- |
| `id`                       | uuid pk                             |                 |
| `seed_question`            | text not null                       |                 |
| `created_by`               | uuid → profiles, on delete set null | provenance only |
| `created_at`, `updated_at` | timestamptz                         |                 |

Creating an inquiry also creates its root `ei_questions` row (depth 0,
`text = seed_question`) in the same transaction, via a `security definer`
function (`ei_create_inquiry`) — kept as one function rather than two
separate client writes so the tree never has a moment where an inquiry
exists with no root, or vice versa.

### `ei_questions`

One row per node.

| column                     | type                                             | notes                                                                                                       |
| -------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid pk                                          |                                                                                                             |
| `inquiry_id`               | uuid → ei_inquiries, on delete cascade           |                                                                                                             |
| `parent_id`                | uuid → ei_questions, on delete cascade, nullable | null only for the root                                                                                      |
| `depth`                    | integer not null                                 | 0 = root, 1 = line of inquiry, 2+ = question                                                                |
| `text`                     | text not null                                    |                                                                                                             |
| `status`                   | text not null, default `active`                  | `active` / `rejected` / `promoted`                                                                          |
| `has_assumption`           | boolean not null, default false                  | set by the model at generation time, or by a discuss turn                                                   |
| `assumption_text`          | text nullable                                    | the assumption itself, shown in the inspector's callout                                                     |
| `reframed_from_text`       | text nullable                                    | previous `text`, set when a discuss-proposed reframe is applied — a one-deep breadcrumb, not a full history |
| `manual_dx`, `manual_dy`   | double precision nullable                        | persisted canvas drag offset from the computed layout position; null = auto-laid-out                        |
| `created_by`               | uuid → profiles, on delete set null              | who took the action that created this node (root: whoever started the inquiry)                              |
| `created_at`, `updated_at` | timestamptz                                      |                                                                                                             |

Constraints: `parent_id is null` iff `depth = 0` (exactly one root shape);
`status = 'rejected'` requires `depth >= 1`; `status = 'promoted'` requires
`depth >= 2`.

### `ei_context_notes`

A note, link, or excerpt attached to one question. Inheritance down a branch
is computed by walking `parent_id` at read time (the same ancestry-path
logic the canvas layout already needs), not denormalized onto every
descendant — the tree is shallow enough in practice that this is a handful
of rows per query, not a performance concern worth a materialized path.

| column        | type                                   | notes                                                             |
| ------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `id`          | uuid pk                                |                                                                   |
| `question_id` | uuid → ei_questions, on delete cascade | the question it's attached to; visible on it and every descendant |
| `kind`        | text not null, default `note`          | `note` / `link` / `excerpt`                                       |
| `body`        | text not null                          |                                                                   |
| `created_by`  | uuid → profiles, on delete set null    |                                                                   |
| `created_at`  | timestamptz                            |                                                                   |

Insert + select only, no update/delete — a context note is a small, immutable
annotation; correcting one is adding a new one, the same "no delete, add
instead" posture `log_content_items` and `ep_criteria` take on their own
lifecycle fields.

### `ei_chat_messages`

The discuss thread, scoped to one question.

| column           | type                                   | notes                                                                                                                                                                                                     |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid pk                                |                                                                                                                                                                                                           |
| `question_id`    | uuid → ei_questions, on delete cascade |                                                                                                                                                                                                           |
| `role`           | text not null                          | `user` / `assistant`                                                                                                                                                                                      |
| `body`           | text not null                          |                                                                                                                                                                                                           |
| `action_kind`    | text nullable                          | `reframe` / `sibling` / `context` — what an assistant turn proposed or did; null for a plain reply and for every user message                                                                             |
| `action_payload` | jsonb nullable                         | `{text}` for a pending reframe; `{questionId}` for a sibling already created; `{contextNoteId}` for a context note already attached                                                                       |
| `applied_at`     | timestamptz nullable                   | when a `reframe` was applied to the question. Set immediately, at insert time, for `sibling`/`context` (those execute as part of the same turn); stays null for `reframe` until the reporter clicks Apply |
| `created_by`     | uuid → profiles, on delete set null    | null for assistant messages                                                                                                                                                                               |
| `created_at`     | timestamptz                            |                                                                                                                                                                                                           |

`sibling` and `context` actions execute immediately (mirroring the mockup:
"→ added a sibling question to the tree" / "→ attached as context on this
branch" appear as accomplished facts, not proposals); `reframe` is the one
action kind that waits for an explicit click, because it overwrites the
question's own text rather than adding something alongside it.

## 5. Screens

One screen: `/editorial-inquiry`, full-bleed under the portal header (no
page padding, unlike every other tool — the canvas needs the space). Its own
compact header holds the WUWF-style inquiry switcher (click the current seed
question to open a list of saved inquiries plus a "start a new inquiry"
field). Below that: the pan/zoom canvas on the left, filling remaining
width, and the docked inspector panel on the right (340px, collapsible via
an edge handle, per the mockup). Each node shows a hover-revealed radial
quick-menu (explore / drill down / discuss / reject — the four
tree-mutating actions cheap enough to not need the panel open; promote and
add-context stay panel-only, since promoting is a considered decision and
context entry needs a text field). No second screen, no settings — nothing
in milestone 1 needs one.

## 6. Milestone 1, and what is left

Milestone 1 is the whole product model in §2: the tree, all six actions,
AI-backed explore/drill-down/discuss, context inheritance, the canvas
(pan/zoom/drag/minimap), the docked inspector, the radial quick-menu, and
the multi-inquiry switcher. Unlike several other tools' milestone 1, this
isn't sliced further — the actions described are one cohesive interaction
loop (a canvas that can't reject or promote isn't a smaller usable version
of this tool, it's a different, less useful one), and the AI integration is
the point of the product, not an enhancement layered on top of a
CRUD-only slice.

**Deliberately deferred**, not part of milestone 1:

- The capability layer / MCP exposure (see §3).
- Any elevated role (no need identified yet — see §3).
- Exporting or printing an inquiry, or a "promoted questions" rollup view
  across inquiries — nothing in the brief asks for one yet, and Editorial
  Planning's pitch backlog is a separate, unrelated tool this doesn't feed
  into automatically.
- Sharing an inquiry outside the portal, or per-reporter inquiry privacy —
  inquiries are shared within the tool, full stop (see §3).
- A generated-question quality/moderation review step — the model's output
  goes straight into the tree, the same trust level this repo already
  extends to Log's NPR/weather integrations and Sourcework's ASR output.
- A way to browse what's been rejected. §2 is explicit that reject "hides"
  a node and its descendants from view rather than deleting them, and
  milestone 1 takes that literally — a rejected node disappears from the
  canvas entirely, not just greyed out, matching the concept mockup's own
  layout pass (`hidden` includes the rejected node's own id, not only its
  descendants). The rows stay queryable directly in the database, but
  there's no in-app "show rejected" toggle or list yet; add one if a real
  need for reviewing dead ends surfaces.

## 7. Out of scope (from the brief, restated for reference)

- A chat-log-first interface — the tree is the record, not a transcript.
- A "whole inquiry" context bucket separate from the root question.
- Deleting a rejected question or its descendants — rejection hides, it
  never deletes (§2).
- Any tool other than the ones already in the portal reusing this tool's
  question tree.

## 8. A note on the fallback when the model is unavailable

If `OPENAI_API_KEY` is unset (or a call fails), Explore/Drill down/Discuss
fail clearly rather than silently doing nothing (§3) — but a reporter isn't
otherwise blocked. The inspector's "Add context" path and, for milestone 1,
a plain "type a question directly" affordance on Explore/Drill down (typing
bypasses the model and inserts the reporter's own text as the new
sibling/child) mean the tree can still be built by hand. This mirrors this
repo's standing rule that an optional external dependency's absence must
never make a tool's core loop unusable, only its AI-assisted shortcut.

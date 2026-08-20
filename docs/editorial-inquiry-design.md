# Editorial Inquiry — design

**Status: revised (2026-08-20), superseding this document's own first version from
the same day.** Milestone 1 shipped a working canvas — question tree, six actions,
AI generation — but its editorial model was too thin: it started from a freely typed
seed question and let a model invent progressively narrower questions with no
grounding in anything real, no connection to what WUWF actually considers strong
journalism, and no way to decline. This revision keeps the interaction shell (the
canvas is still the record, the panel is still docked, the actions are still
Explore/Drill down/Reject/Promote/Add context/Discuss under the hood) and replaces
the reasoning underneath it. §§1–4 below describe the current model; anywhere this
document says "no longer," "removed," or "replaced," that is what changed and why.

## 1. What this tool is

A grounded editorial reasoning workspace. It helps a WUWF reporter move from
something real — an observation, a document, a hunch, a source's offhand remark,
something happening right now — toward a properly scoped, investigable reporting
question, in the context of one of WUWF's own durable guiding questions and its
current editorial priorities.

The **tree is the persistent intellectual structure**: guiding question at the
root, lines of inquiry beneath it, story questions beneath those, each with its
own attached evidence and its own discussion history. The **conversation pane is
the primary discovery and reasoning interface** — where a reporter brings material,
asks the model to look for current developments, and works out with it what's
actually known, what's still unresolved, and whether a candidate question is
genuinely ready to report. Structural tree actions (branch, drill down, reframe,
promote) are things that happen _as a result of_ that reasoning, not a button that
manufactures a plausible-sounding question on demand.

## 2. Editorial Planning is the source of truth

Editorial Inquiry does not define, store, or duplicate WUWF's coverage priorities
or story-evaluation criteria. Those already exist, are actively maintained, and
have one home: **Editorial Planning**.

- **WUWF's guiding questions live on `ep_pillars`** (`docs/editorial-planning-design.md`
  §10.1) — each of WUWF's six coverage pillars (Growth and Resilience, Public
  Health and Well-Being, Military Affairs, Public Safety and Civil Liberties,
  Affordability and Opportunity, Power and Politics) carries an optional
  `guiding_question`. An inquiry in this tool is **associated with one selected
  pillar**, not an independently typed strategic framework — starting a new
  inquiry means picking a pillar, not writing a guiding question from scratch (§5).
- **WUWF's editorial criteria live on `ep_criteria`**, grouped into rubric
  profiles (`ep_rubric_profiles` — Strategic/Enterprise is the default). Editorial
  Inquiry reads the default profile's active **core** criteria — name,
  description, guidance — as prose context for the model's judgment. It never
  reads weights, scales, or anchors (those exist to produce a numeric review
  score in Editorial Planning's own weekly meeting; Editorial Inquiry has no
  meeting and produces no score) and it never asks the model to emit one. §1's
  standing rule, restated because it is easy to get backwards: **the rubric
  informs critique, it does not become a target to reverse-engineer.** A model
  that quietly optimizes a question to "read like it would score well" has
  broken the tool's purpose, even if nobody ever sees a number.

### How the read works

Both tables' RLS was, until this revision, scoped to `editorial-planning` tool
members only (`private.ep_has_access`). A reporter using Editorial Inquiry does
not necessarily hold an `editorial-planning` grant — Editorial Planning's
`contributor` role is separate membership, and requiring it just to see WUWF's own
public-facing pillar list would make the "one source of truth" promise hollow for
anyone without a second grant. The migration for this revision adds narrow,
additive `select` policies on `ep_pillars`, `ep_criteria`, and `ep_rubric_profiles`
admitting `private.has_editorial_inquiry_access(auth.uid())` alongside the existing
`ep_has_access` predicate — the same "one more `select` policy for a specific
cross-tool read" shape as `tools_select_proposed_for_roadmap` and
`log_broadcast_events_select_for_underwriting`. Nothing about who can _write_ those
tables changes; Editorial Inquiry members still can't touch Editorial Planning's
configuration, and neither read policy is scoped to only the default profile —
that filter happens in the query, not RLS, matching how every other config
table in this repo lets application code decide what subset it wants.

Because RLS is the only thing gating those reads (`lib/editorial/data.ts`'s own
functions assert nothing beyond RLS — see that file), Editorial Inquiry's own
`lib/editorial-inquiry/editorial-planning.ts` calls `listPillars`/`listCriteria`/
`getDefaultRubricProfile` from `@/lib/editorial/data.ts` directly rather than
re-implementing the query. There is exactly one function that knows how to read a
WUWF guiding question or a WUWF criterion, and it lives in Editorial Planning.

### The handoff back

A promoted story question can be **developed into a pitch** — a deliberate,
reporter-initiated action, never automatic (§6). This goes through Editorial
Planning's own `editorial.pitch.save` capability (`lib/editorial/capabilities.ts`),
the same entry point the pitch form itself uses and the one already documented as
meant for exactly this kind of cross-tool call. It is gated by that capability's
own `assertEditorialRole("contributor")` — a reporter with no `editorial-planning`
access at all gets a clear "you need Editorial Planning access to do this" message,
not a bypass. See §6.

## 3. Grounding: signal before invention

Milestone 1's actual failure mode: a reporter picks "Explore" or "Drill down," and
the model invents a plausible-sounding narrower question with nothing behind it —
starting from `GUIDING QUESTION → GENERATE SOMETHING THAT SOUNDS LIKE A STORY`.
That produces fluent nonsense a newsroom can't actually report, because nothing
about it is true yet.

The reasoning order this tool now enforces, every time:

```
REAL-WORLD SIGNAL (reporter-supplied or web-discovered)
        +
WUWF GUIDING QUESTION (the selected pillar's own question)
        ↓
WHAT IS ACTUALLY KNOWN?
        ↓
WHAT REMAINS UNKNOWN OR UNRESOLVED?
        ↓
LINES OF INQUIRY
        ↓
PROPERLY SCOPED STORY QUESTIONS
        ↓
EDITORIAL EVALUATION
```

A branch or drill-down the model proposes has to trace back to something in that
chain — the inherited context on the branch it's growing from, or something it
just found. It is not entitled to invent a new factual premise to justify another
branch existing (§6). If the material on hand doesn't support a genuinely
different angle, the model says so instead of manufacturing one (§7).

### Two ways in

- **Reporter-led discovery** — the reporter brings something they encountered: an
  observation, a hunch, a document, a link, a data point, prior reporting, a
  quote, a source's offhand remark, a partially formed idea. They paste or
  describe it in the conversation pane attached to whichever question it bears
  on (usually the root, if it's about the whole guiding question).
- **Search-led discovery** — the reporter asks the model to look for what's
  currently happening that bears on the guiding question ("what's developing
  right now on military-family housing?"). The model has a web-search tool
  available on every conversation turn and decides for itself when a question
  needs current information to answer well — this is not a separate mode with
  its own button, just a capability the model can reach for.

Both land in the same place: the conversation pane attached to a question, which
is where discovery actually happens. "Crystallizing" a useful finding — attaching
it as a context note that then inherits down the branch — is one of the actions a
conversation turn can take (§6), not a separate step the reporter has to remember.

## 4. Evidentiary status: context isn't all the same kind of true

Undisciplined grounding is worse than none — an unverified reporter aside
("I keep hearing NAS Pensacola is using much less of its land than it used to")
must never silently become a load-bearing fact three branches later. Every context
note now carries an **evidentiary status**, alongside the existing `kind`
(note/link/excerpt, which describes the note's _form_; status describes its
_epistemic weight_ — orthogonal, both kept):

| status             | means                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `hunch`            | A reporter's instinct or impression, nothing behind it yet                                           |
| `source_claim`     | Something a source said, not independently verified                                                  |
| `established_fact` | Confirmed from supplied material the reporter trusts (a document, prior reporting, direct knowledge) |
| `web_finding`      | Found via the model's web search — carries `source_title`/`source_url` for the reporter to check     |
| `inference`        | Something the model or reporter reasoned to, not directly observed                                   |
| `open_question`    | A known unknown worth tracking, not a claim at all                                                   |

The model is instructed to classify every context note it attaches this way, and
must never treat a `hunch` or `source_claim` as though it were `established_fact`
when reasoning about what's known — see the reasoning order in §3. A reporter
adding a note manually picks the status themselves (defaulting to `hunch` for a
bare assertion, the deliberately humble default). Web-derived material keeps its
title/URL so a reporter can trace exactly what the model is relying on rather than
taking a bare claim on faith.

## 5. Editorial levels

- **Guiding question** — a durable, broad question that organizes sustained
  coverage over time. Intentionally too large for one story. Comes from a WUWF
  pillar (§2), never independently typed.
- **Line of inquiry** — a meaningful dimension, tension, mechanism, uncertainty,
  change, or relationship within the guiding question. Capable of producing
  multiple stories over time. Normally still too broad to be one central
  reporting question on its own.
- **Story question** — the central unknown of one finite reporting project. To be
  a _good_ one it should be: genuinely open (not answer-presupposing), specific
  enough to investigate, consequential, appropriately bounded, grounded in a real
  uncertainty/tension/mechanism/decision/change/discrepancy, answerable through
  realistic reporting (sources, documents, records, data, observation), capable
  of producing discovery rather than illustrating something already known, and
  clear enough that a reporter can tell what evidence would answer it.

**Tree depth describes structure, not editorial quality.** A depth-3 question can
still be a bad story question — vague, compound, answer-already-known, whatever
— and a depth-1 line of inquiry that a reporter has genuinely narrowed through
conversation (not just by clicking "drill down" repeatedly) can be ready sooner
than its position in the tree suggests. Milestone 1's rule that promoting
required depth ≥ 2 has been **removed** for exactly this reason (§6, §8) — the
former rule mistook "has been drilled down enough times" for "is a good question,"
which are not the same claim.

### Diagnosing a weak story question

The model is expected to name _why_ a candidate isn't ready yet, not just hand
back a vaguer "more specific version." Ten recognized reasons, stored on the node
once diagnosed (`ei_questions.diagnosis_kind`/`diagnosis_note`):

`still_thematic` · `too_broad` · `compound_question` · `unverified_premise` ·
`already_known` · `unclear_stakes` · `no_uncertainty` · `implausible_reporting_path`
· `trivial` · `descriptive_not_investigative`

When it applies, the model should try to fix that specific problem — narrow the
compound question into its real parts, name what would need verifying first,
surface the actual uncertainty — rather than producing a generic rewording.

### Two separate judgments, kept apart

1. **Is this a well-formed, reportable story question?** — structural: the
   criteria above.
2. **Would answering it likely make a strong WUWF story?** — editorial: judged
   against Editorial Planning's current criteria (§2), in prose, never a score.

A well-formed question can still be low-value journalism. A high-impact topic can
still lack a workable reporting question. Conflating them (as milestone 1's single
"promote" gate implicitly did) hides which problem a weak node actually has. The
inspector's **Evaluate** action asks for both explicitly, one at a time.

## 6. Actions, reframed

Every action from milestone 1 is preserved. What each one _means_ changed.

- **Branch** (was "Explore") — propose another, genuinely _distinct_ child of
  the selected question's **parent** (clarified 2026-08-20: the insert
  mechanics always put the new node under the parent, but the prompt anchored
  the model's reasoning on the selected node, so "a different angle" reliably
  came back as a variation of the selected question rather than a different
  line under the same parent — the prompt now names the parent question
  explicitly and forbids rephrasing the sibling). It must not invent a new
  factual premise to justify the branch existing. **The model can decline**
  (§7) if the available context doesn't support one.
- **Drill down** — propose the next question _down_, one level at a time
  (clarified 2026-08-20, after a real turn leapt from a fresh root straight
  to a fully-scoped story question): from the guiding question, a drill-down
  normally surfaces a **line of inquiry** grounded in a real development —
  that intermediate level is what makes the tree worth having, the durable
  frame a reporter follows across several stories — and from a line of
  inquiry it moves toward, or lands on, a story question, responding to
  whatever is currently keeping it from being one, not a generic narrowing
  paraphrase. The reply names which level the proposed question sits at. Can
  also decline. The same incident exposed a harder rule now in the prompt:
  the tool call is the model's _only_ way to change the canvas — it must
  never present a proposed question in prose alone, and never claim to have
  added something without calling the tool that turn (it did both, including
  a confabulated "Added." with no call behind it). Both Branch and Drill
  down also carry a required **grounding** argument — 1–3 sentences of what
  the new question traces to, with source when it came from search — which
  lands on the new node as a context note (same day: a node holding only its
  question text, with all its rationale buried in the parent's thread, was
  unintelligible on its own; as a context note the grounding also inherits
  down whatever grows beneath the node, per §4, and no schema change was
  needed).
- **Discuss** — conversational and node-scoped, same as before, now doing real
  editorial work: challenge an assumption, distinguish a claim from a fact,
  identify what evidence is missing, recognize that new context changes what the
  interesting question even is, propose a reframe, diagnose why a branch is weak,
  search the web when current information would help, or conclude a line is
  exhausted. This is also where reporter-led and search-led discovery happen
  (§3) — it is the tool's primary surface, not a side panel.
- **Evaluate** (new) — ask explicitly for the two judgments in §5: is this
  well-formed, and would it likely make a strong WUWF story against Editorial
  Planning's current criteria. Available on any active question, not gated by
  depth.
- **Add context** — unchanged mechanically (inherits down the branch, root
  covers the whole inquiry), extended with evidentiary status (§4).
- **Reject** — unchanged: marks a line of thought not worth pursuing, hides it
  and its descendants from the canvas, never deletes. Root still can't be
  rejected.
- **Promote** — the reporter's own judgment that a question has matured into a
  viable central reporting question. **No longer gated on depth** (§5, §8) —
  only that it's `active` and not the root. The model's Evaluate output informs
  this; it does not decide it.
- **Develop into pitch** (new) — see §8.

### Letting the model decline

A rigorous assigning editor does not answer "give me another angle" with another
angle every time. Branch, Drill down, and Evaluate all route through the same
underlying reasoning call (§9), and none of them force a structural action: the
model may reply in prose only when there isn't enough grounding yet, the obvious
branches would duplicate what's already there, a premise needs verifying first,
current information is needed and search didn't surface enough, the line looks
exhausted, or the node is already better treated as a story question than
decomposed further. A decline is a real, useful outcome — often paired with a
`diagnosis` (§5) explaining what's actually missing — not an error state.

## 7. The reasoning engine

One streaming call handles Branch, Drill down, Evaluate, and every ordinary
Discuss turn — the same reasoning, differently framed. This replaces
milestone 1's two separate mechanisms (a strict-JSON-schema generator for
Explore/Drill down, a different strict-JSON-schema turn for Discuss) with one:
`lib/editorial-inquiry/ai.ts`'s `streamEditorialTurn()`, reached through the
SSE route `src/app/api/editorial-inquiry/turn/` (persistence in
`lib/editorial-inquiry/turn.ts`) rather than a Server Action — an editorial
turn runs web search plus medium-effort reasoning, long enough that a silent
wait read as a hang, and a Server Action can't stream the reply
token-by-token the way the in-portal agent's `/api/agent/chat` already does.

**Why not structured JSON output for everything, this time:** milestone 1's
`text.format.type: "json_schema"` approach can't coexist cleanly with the two
things this revision actually needs — natural prose (with inline web citations)
and a tool the model can freely choose to call zero or one time. So this revision
uses the Responses API's ordinary tool-calling shape instead — the same general
mechanism `src/lib/agent/chat.ts` already uses for the in-portal agent, though
the tool set and turn structure are different, purpose-built for this tool's
narrower job:

- **`web_search`** (OpenAI's built-in tool, `type: "web_search"`) — resolved
  entirely server-side by OpenAI within the same API call; nothing in this repo
  executes a search or holds a search-provider key. Citations arrive as
  `url_citation` annotations on the reply's output text (title + URL + character
  range), stored on `ei_chat_messages.citations` and rendered as a small sources
  list under the reply.
- **`propose_editorial_action`** (a custom function tool, `strict: true`) — the
  model's one chance per turn to propose a structural action: `branch`,
  `drilldown`, `context`, `reframe`, `diagnosis`, or `assessment`. Calling it is
  optional (`tool_choice: "auto"`, `parallel_tool_calls: false` caps it at one);
  a turn with no call is a plain reply — a decline, by construction, not a
  special case to detect.

One `responses.stream()` call can therefore return, in one round trip: zero or
more resolved web searches, a prose reply with citations (streamed to the
panel as the model produces it, then rendered as markdown — see
`lib/markdown.ts`/`components/ui/markdown.tsx`), and at most one proposed
action. Nothing persists until the model's terminal result — a dropped
connection mid-stream writes nothing, so a retry can't duplicate half a turn —
and nothing about a proposed action executes itself: `turn.ts` reads it and
performs the matching write (insert a question, insert a context note, stage a
pending reframe) exactly as milestone 1's discuss turn already did for
`sibling`/`context`/`reframe`; `branch`/`drilldown`/`context` execute
immediately, `reframe` waits for an explicit Apply click, and
`diagnosis`/`assessment` write onto the question or render inline respectively
rather than mutating the tree. For Branch and Drill down, searching for
current developments is framed as part of the action by default — not a
fallback the model may skip — since a thin branch otherwise either declines
unhelpfully or invents; the model still declines when context and search both
come up genuinely empty.

**Every call's instructions carry:** the reasoning order (§3), the editorial-level
definitions and the ten diagnosis reasons (§5), WUWF's current core criteria from
Editorial Planning as prose guidance — never a scoring target (§2) — the ancestry
chain from the guiding question down to the node being acted on, every inherited
context note labeled with its evidentiary status (§4), active siblings/children
to avoid duplicating, and (for Discuss) the thread's prior turns. Branch/Drill
down/Evaluate are framed as a canned directive from the reporter (e.g. "Branch:
look for a genuinely different angle here." as the turn's user-authored text) so
they run through the identical conversational pipeline and land in the same
visible thread — a decline is something the reporter sees and can respond to, not
a silent no-op.

Same optional-key posture as every integration in this repo: absent
`OPENAI_API_KEY`, every AI-backed action fails clearly rather than doing nothing
silently, and the manual "type your own" fallback (§10) still works.

## 8. Connecting back to Editorial Planning

A promoted story question isn't the end of the workflow — it's the point where an
inquiry has produced something Editorial Planning's own pipeline can pick up.
**Develop into pitch**, available on any `promoted` question, opens a small review
panel (not a full second form) prefilled from what the inquiry actually knows:

- **Title** and **central reporting question** — the story question's own text.
- **Primary coverage pillar** — the inquiry's linked pillar's current name
  (looked up live at submission time, not the snapshot — see §9 for why the
  snapshot exists at all — so it always matches one of Editorial Planning's
  presently-valid options).
- **Sources/materials** — a draft assembled from the branch's inherited context
  notes (evidentiary status shown inline), editable before submit.
- **Why now** — a draft assembled from notes tagged `established_fact` or
  `web_finding` specifically (the ones that read as an actual development, not a
  hunch), editable — never fabricated if nothing qualifies.
- **Reporting approach**, **relevant perspectives** — left blank for the reporter
  to write fresh; nothing in the tree stands in for a reporter's own judgment
  here.

Submitting calls Editorial Planning's own `editorial.pitch.save` capability
(§2) — the same write path the pitch form itself uses, so a developed pitch is
an ordinary `open` pitch afterward, editable like any other. **This is always
reporter-initiated.** No promotion, however confident the model's Evaluate
output, automatically creates a pitch — "the reporter should choose when an
inquiry is ready to cross that boundary" is the literal product requirement, not
a courtesy default.

## 9. Data model

Tables stay prefixed `ei_`. Everything below either replaces or extends
milestone 1's original schema (`docs/editorial-inquiry-design.md`'s prior
version) — see the migration file
(`supabase/migrations/<this revision>.sql`) for the exact `alter table`s.

### `ei_inquiries`

| column                     | type                                    | notes                                                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid pk                                 |                                                                                                                                                                                                                                               |
| `pillar_id`                | uuid → `ep_pillars`, on delete set null | the selected WUWF guiding question's pillar; nullable only so a deleted pillar doesn't cascade away real inquiry history                                                                                                                      |
| `pillar_name_snapshot`     | text not null                           | the pillar's name at the moment the inquiry started                                                                                                                                                                                           |
| `guiding_question_text`    | text not null                           | the pillar's `guiding_question` at that same moment — this, not a live join, is what grounds the tree, so editing a pillar's wording in Editorial Planning later can't retroactively change what an existing inquiry has been reasoning about |
| `created_by`               | uuid → profiles, on delete set null     | provenance only                                                                                                                                                                                                                               |
| `created_at`, `updated_at` | timestamptz                             |                                                                                                                                                                                                                                               |

`seed_question` (milestone 1's free-typed guiding question) is **removed** — an
inquiry is associated with a pillar, never an independently typed one (§2). The
switcher's list now shows `pillar_name_snapshot` (a stable short label; a pillar's
own name changes far less often than its guiding-question wording, and a picker
grouped by pillar name is what a reporter actually scans for). Creating an
inquiry (`ei_create_inquiry(p_pillar_id)`, still one `security definer` function
seeding both the inquiry and its root question atomically) looks up the pillar,
requires it to be `active` and to have a non-null `guiding_question` (a pillar
without one yet isn't offered in the picker — see §10 — but the function checks
again server-side rather than trusting the client), and snapshots both fields.

### `ei_questions`

Same shape as milestone 1 (`id`/`inquiry_id`/`parent_id`/`depth`/`text`/`status`/
`manual_dx`/`manual_dy`/`created_by`/timestamps), with one change:

- `has_assumption boolean` / `assumption_text text` are **removed**.
- `diagnosis_kind text` (nullable, one of the ten reasons in §5) and
  `diagnosis_note text` (nullable, the model's specific explanation) **replace**
  them — `unverified_premise` is the direct successor of the old boolean flag,
  now one of ten recognized reasons instead of the only one the tool could name.

Constraints: root shape unchanged (`parent_id is null` iff `depth = 0`).
**Removed**: the separate depth ≥ 1 (reject) and depth ≥ 2 (promote) checks,
replaced by one shared rule — `status = 'active' or depth >= 1` — since a
rejected or promoted question can never be the root, but nothing about _how
deep_ it is bears on whether either status is allowed (§5, §8).

### `ei_context_notes`

Adds, alongside the unchanged `id`/`question_id`/`kind`/`body`/`created_by`/
`created_at`:

| column               | type                           | notes                                                                                                  |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `evidentiary_status` | text not null, default `hunch` | `hunch` / `source_claim` / `established_fact` / `web_finding` / `inference` / `open_question` — see §4 |
| `source_title`       | text nullable                  | set only for `web_finding` notes the model attaches                                                    |
| `source_url`         | text nullable                  | ″                                                                                                      |

Still insert + select only — a context note's evidentiary status is set once,
at the moment it's attached, by whoever attaches it (the reporter picks one
manually; the model classifies its own).

### `ei_chat_messages`

Adds `citations jsonb` (nullable — `{title, url}[]`, from `url_citation`
annotations on a reply that used web search; independent of `action_kind`, since
a plain reply can still cite sources). `action_kind`'s allowed values widen from
`reframe`/`sibling`/`context` to `branch` (renamed from `sibling` — a sibling
_is_ a branch, but the old name described the tree mechanics, not the editorial
meaning), `drilldown` (new — Drill down now runs through this same thread instead
of writing a question with no visible turn), `context`, `reframe`, `diagnosis`
(new — writes onto the acted-on question's `diagnosis_kind`/`diagnosis_note`
directly, informational, no separate apply step since it never overwrites
reporter-authored text), and `assessment` (new — the Evaluate action's editorial-
value discussion, rendered distinctly, purely informational). `branch`/
`drilldown`/`context` still execute immediately (`applied_at` set at insert);
`reframe` still waits for an explicit click; `diagnosis`/`assessment` have no
"applied" concept at all (nothing pending) — `applied_at` is set immediately for
both, same as the immediate-execution kinds, since there's no separate step.

## 10. Screens

Still one screen, `/editorial-inquiry`, same full-bleed canvas + docked
inspector layout as milestone 1. What changed:

- **Starting an inquiry** is now a pillar picker, not a free-text field: each
  active `ep_pillars` row with a non-null `guiding_question` (§9) is shown as a
  choice — name plus its guiding question — in the switcher's "new inquiry"
  section. A pillar with no guiding question yet is omitted, with a one-line
  note pointing at Editorial Planning rather than letting Editorial Inquiry
  invent one.
- **The inspector groups its actions instead of one flat row** (revised again
  the same day after a direct report that the panel was "impossibly
  cluttered"): "Ask the model" (Branch / Drill down / the new Evaluate —
  compact buttons, each rendered only when structurally possible, so the root
  shows two, not six) sits above "Your call" (Promote / Reject, hidden on the
  root where neither can apply), then reporter-authored alternatives (write a
  question by hand, add context) as one muted link row. The **discussion is
  always visible** for the selected question — it is the primary surface, so
  the Discuss/Close-discussion toggle is gone and the composer is pinned to
  the panel's bottom edge, always in view. Canned Branch/Drill down/Evaluate
  directives render as a muted "↳ You asked for…" line, not a fake user
  bubble; replies stream in token-by-token (§7) behind a mode-specific
  working indicator, and assistant prose renders as markdown. Suggestion
  chips and the two-ways-in helper text appear only while a thread is empty.
  The portal-wide agent bubble no longer renders on this route — it sat
  directly on the composer, and this screen has its own AI surface.
- **Diagnosis** renders as a callout on the node/inspector wherever milestone
  1 showed the old assumption flag — same visual treatment (a small flagged
  badge plus an expandable explanation), now naming one of ten reasons instead
  of one.
- **Assistant messages carrying `diagnosis`/`assessment`** render with their own
  distinct, non-actionable style (no "apply"/execution language, since neither
  mutates the tree directly) rather than the reframe/branch/context styling.
- **Citations** appear as a compact "Sources" list under any reply that used web
  search.
- **Develop into pitch** is a new panel section on a `promoted` question — see
  §8 for its exact fields.
- The radial quick-menu on the canvas itself is unchanged (branch / drill down /
  discuss / reject — the four cheap hover actions); Evaluate and Promote stay
  panel-only, same reasoning as milestone 1 (a considered action, not a
  hover-away click).

## 11. What's preserved from milestone 1, unchanged

Per the brief driving this revision: the visual branching question tree, the
canvas as durable record, conversation over chat-as-the-product, reporter control
over every model proposal (nothing auto-applies except immediate branch/drill-
down/context/diagnosis/assessment writes, which were already immediate in
milestone 1 and stay that way — only reframe waits), the ability to reject and
reframe, context inherited through branches, shared newsroom inquiries (§2 of the
prior version — unchanged, still no elevated role), and a lightweight,
purpose-built interaction rather than a generic project-management surface. The
canvas itself needed no new dependency then and needs none now — same from-scratch
pan/zoom/layout code, same reasoning against CLAUDE.md's dependency discipline.

## 12. Deliberately deferred

- The capability layer / MCP exposure for Editorial Inquiry's own actions.
- Any elevated role.
- A "show rejected" browsing view.
- Automatic pitch creation on promotion (§8 — always reporter-initiated).
- A numeric or bucketed editorial-value score of any kind (§1, §2, §5) — this is
  a standing constraint on the _product_, not a milestone boundary; it should
  not be revisited without the same explicit instruction that removed the old
  score-shaped thinking in the first place.

## 13. The fallback when the model is unavailable

Unchanged in spirit from milestone 1: if `OPENAI_API_KEY` is unset or a call
fails, every AI-backed action fails clearly. The reporter can still add context
manually (with its own evidentiary status), and Branch/Drill down still offer a
"type your own" affordance that bypasses the model entirely and inserts the
reporter's own text (with no diagnosis and no citations, since none was
generated) — the tool's core loop never depends on the model being configured,
only its reasoning assistance does.

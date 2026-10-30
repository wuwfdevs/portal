# Capability Layer, MCP Server, and Portal Agent — Design

Status: **proposed, not implemented**. This document is the design to review before
any of the code in it is written. The one thing that *has* landed ahead of it is the
per-tool role catalog described in §9 (`src/lib/tool-roles.ts`), because it turned out
to be a small, independently useful prerequisite for both the admin UX and this design's
authorization model.

---

## 1. Goal

Move the portal toward a capability-first architecture: important portal operations
implemented once as reusable, server-side application capabilities, shared by the
existing UI, an internal MCP server, and a portal agent that acts on behalf of the
signed-in user — while preserving every existing authorization, RLS, validation, and
audit-logging boundary. Staff should eventually be able to connect approved external
LLM clients (Claude, ChatGPT) to the same MCP server, still bound by their own portal
permissions.

Explicitly **not** goals for this design: a generalized plugin framework, a public
developer API platform, an OAuth application marketplace, a webhook system, or an
autonomous background workflow engine. Nothing here forecloses adding a conventional
REST/GraphQL API later — the capability layer is exactly the seam that would sit behind
one — but building that API is out of scope now.

---

## 2. Current architecture, as it actually is

Reviewed directly (not from memory of the docs) across all four tools' route segments,
`src/lib/<tool>/`, `src/lib/auth/authz.ts`, and `src/lib/audit.ts`.

**Read paths are already close to capability-shaped.** `lib/editorial/data.ts`,
`lib/transcription/{search,ingest,indexing,projects}.ts`, `lib/audience-listening/*`,
and `lib/remote-interview/*` are plain typed async functions that use the
request-scoped Supabase client (`lib/supabase/server.ts`), throw or `unwrapRead()` on
error rather than swallowing it, and return typed rows. They don't redirect, don't
touch `FormData`, and are already callable from anywhere server-side.

**Write paths are mostly Next.js Server Actions, not reusable functions.** Every tool's
`actions.ts` (`editorial/pitches/actions.ts`, `editorial/meetings/actions.ts`,
`sourcework/actions.ts` and `[id]/actions.ts`, `remote-interview/actions.ts` and
`[id]/studio/actions.ts`, `audience-listening/actions.ts`, `admin/users/actions.ts`,
`admin/tools/actions.ts`) is a `"use server"` file whose exports take raw `FormData`,
call an `assert*` gate, write, usually `logAuditEvent()`, then `redirect()`. `redirect()`
throws a Next.js-internal signal that only makes sense inside a request/response cycle
— an MCP tool handler can't call `archivePitch(formData)` and get a meaningful result
back; it would have to fabricate a `FormData` and catch a framework exception as its
success path.

**One real precedent for the shape we want already exists.** Sourcework's
`createProject`, `updateProjectDetails`, `reindexProjectSearch`, `completeProjectUpload`,
and `failProjectUpload` (`sourcework/actions.ts`) take typed input objects and *return*
a result (`{ id, sourceId } | { error }`) instead of redirecting, because the browser
upload flow needed the return value to know where to upload next. This is the pattern
to generalize, not a new one to invent.

**Authorization and audit are already centralized**, and the capability layer should
call the same functions, not reimplement them:
- `lib/auth/authz.ts` — `requireActiveProfile`, `requireAdministrator`,
  `assertAdministrator`, `hasToolAccess`, `requireToolAccess`, `assertToolAccess`.
- Per-tool extensions — `lib/editorial/access.ts`'s `assertEditorialRole(minimum)`.
- `lib/audit.ts`'s `logAuditEvent()` — called after every privileged write today.
- The role catalog added alongside this doc (`lib/tool-roles.ts`, `lib/editorial/
  roles.ts`'s `ROLE_OPTIONS`) — the first place a tool's roles are named as data
  rather than only as a `normalizeToolRole()` string match.

**Route handlers exist for exactly two documented reasons** — file-streaming exports
(`clips.zip`, `tracks.zip`) and one verified external webhook with no user session (the
AssemblyAI callback). That precedent matters here: an MCP server, like those, is a
place logic is reached *from* outside a normal page request — not a place new business
logic should be written.

---

## 3. Reusable vs. UI-coupled — why the split matters

| | Read functions (`lib/*/data.ts` etc.) | Write functions (`*/actions.ts`) |
|---|---|---|
| Input | typed params | `FormData` |
| Success | returns data | `redirect()` (throws) |
| Error | throws / `unwrapRead()` | `failIfError()`/`failWith()` (editorial) or ad hoc `{error}` return, ends in redirect either way |
| Callable from a non-Next context (MCP handler, test, script) | yes, today | no — needs a real refactor |

The capability layer's job is narrow: give every write path the same shape the read
paths and Sourcework's typed actions already have, so a capability can be called from a
`<form action>` adapter, an MCP tool handler, or a unit test identically.

---

## 4. The capability layer

One `capabilities.ts` per tool, colocated with that tool's other logic (matches the
existing convention of each tool owning its own `lib/<tool>/` module):

```
src/lib/editorial/capabilities.ts
src/lib/transcription/capabilities.ts        (Sourcework)
src/lib/remote-interview/capabilities.ts
src/lib/audience-listening/capabilities.ts
src/lib/admin/capabilities.ts                (new — admin actions don't have a lib/ home today)
src/lib/capabilities/registry.ts             (aggregates all of the above; the one thing
                                               the MCP server and the agent import from)
```

Shape of one capability (illustrative, not final):

```ts
// lib/editorial/capabilities.ts
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertEditorialRole } from "./access";
import { logAuditEvent } from "@/lib/audit";

export const archivePitch = defineCapability({
  id: "editorial.pitch.archive",
  summary: "Archive an open pitch, removing it from the backlog",
  input: z.object({ pitchId: z.string().uuid(), reason: z.string().trim().optional() }),
  requires: { tool: "editorial-planning", role: "editor" },
  confirmation: "required",
  async handler({ supabase }, input) {
    const editor = await assertEditorialRole("editor");
    const { error } = await supabase
      .from("ep_pitches")
      .update({ status: "archived", archived_reason: input.reason ?? null,
                archived_by: editor.profile.id, archived_at: new Date().toISOString() })
      .eq("id", input.pitchId).eq("status", "open");
    if (error) return { error: `Could not archive the pitch: ${error.message}` };
    await logAuditEvent({ actorId: editor.profile.id, action: "ep.pitch.archived",
      targetType: "ep_pitch", targetId: input.pitchId, metadata: input.reason ? { reason: input.reason } : {} });
    return { ok: true as const };
  },
});
```

Properties this preserves deliberately:

- **The handler still calls `assertEditorialRole`/`assertToolAccess` itself.** The
  `requires` field on the capability is metadata for *discovery and UI* (what the MCP
  tool's description says, what the agent can offer to a given user) — it is never the
  only check. A client that fabricates or omits context still gets a real 403 from the
  same authorization call every Server Action already makes. This mirrors why
  `private.*` SQL functions stay `security definer` and RLS stays enabled regardless of
  app-level checks: the capability's declared `requires` is a courtesy, not the boundary.
- **The handler always uses the request-scoped Supabase client**, obtained the same way
  `assertToolAccess`/`assertEditorialRole` already obtain it — never
  `lib/supabase/admin.ts`. This is the single most important invariant in this whole
  design (see §11's first risk).
- **No `redirect()`, no `FormData` inside a capability.** It returns a typed result.
- Existing Server Actions become thin adapters: `pitches/actions.ts`'s `archivePitch`
  parses `FormData`, calls the capability, and maps `{ok}`/`{error}` to `redirect()` /
  `failWith()` exactly as it does today — the audit call and the actual write move
  *into* the capability, so the UI, the MCP tool, and the agent all get it for free
  instead of three copies drifting apart.
- **Validation** uses `zod`. This is a new dependency (see §11) — justified because MCP
  tool definitions need a JSON-schema-shaped input contract, and a capability's input
  schema doubles as that contract; hand-synchronizing an ad hoc validator with a
  separately maintained MCP schema is exactly the kind of drift this codebase's own
  docs warn about elsewhere. Where a tool already has a hand-written validator (e.g.
  `lib/editorial/form.ts`'s `validatePitchValues` for the pitch form's dynamic fields),
  keep using it inside the handler — zod covers the capability's own fixed arguments,
  not necessarily every dynamic value within them.

---

## 5. Confirmation boundary

Every capability declares `confirmation: "none" | "required"`. This is enforced by the
registry, not left as a convention the calling client is trusted to honor:

- `"none"` — reads, search, summarization, routine draft creation (submitting a pitch,
  creating a Remote Interview session, creating a draft Audience Listening query).
- `"required"` — the registry's `invoke()` refuses to run the handler unless the call
  carries an explicit `confirmed: true` flag. The portal agent's UI must have shown the
  user the pending action and gotten an explicit yes before setting that flag; an
  external MCP client must surface its own confirmation UI (Claude's and ChatGPT's MCP
  clients both support this pattern) before it can set it. Examples: publishing or
  deleting, inviting users, sending communications, finalizing an editorial decision,
  changing tool_access/roles, any bulk mutation (`archiveSelectedPitches`'s shape).

---

## 6. First MCP tool and resource set

Kept intentionally small and product-level — no generic CRUD, no raw SQL, no
"run any query" tool.

**Tools — direct (`confirmation: "none"`):**

| Capability id | What it does |
|---|---|
| `editorial.pitch.search` | Find pitches by text/status/pillar |
| `editorial.pitch.get` | One pitch's detail, values, and history |
| `editorial.pitch.create` | Submit a new draft pitch |
| `sourcework.project.search` | Find projects by title/status |
| `sourcework.source.search` | Find sources across the library |
| `sourcework.project.get` | A project's transcript/status summary |
| `audience-listening.query.list` | List queries and their status |
| `remote-interview.session.list` | List sessions and their status |
| `remote-interview.session.create` | Create a session + guest join link |

**Tools — confirmation required:**

| Capability id | Why it's gated |
|---|---|
| `editorial.pitch.archive` | Removes a pitch from the backlog |
| `editorial.decision.record` | Finalizes an editorial outcome |
| `audience-listening.query.publish` | Makes a query publicly reachable |
| `audience-listening.answer.sendToSourcework` | Kicks off billable ASR, one-way handoff |
| `remote-interview.participant.invite` | Sends a join link to someone |
| `admin.user.invite` | Sends an invitation email, creates an auth account |
| `admin.toolAccess.update` | Changes what a user is allowed to do |

**Resources (read-only, curated views — not table dumps):**

`editorial:backlog-summary`, `editorial:meeting/{id}`, `sourcework:project/{id}`,
`sourcework:source/{id}`, `audience-listening:query/{id}`,
`remote-interview:session/{id}`, and `portal:my-tool-access` — the last one exists
specifically so an agent or external client can see what the current user can and
can't do before attempting a tool call, rather than discovering it by trial and error.

---

## 7. The in-portal agent

A chat surface inside the portal, backed by a server route that is itself just another
MCP client — it authenticates as the signed-in user via the same request-scoped
Supabase session everything else uses, and holds no separate service credential. It
calls the same MCP server described above rather than a private shortcut into the
capability registry, so there is exactly one code path to secure and audit, not two.

---

## 8. External LLM clients (Claude, ChatGPT) — later, not now

Deferred to its own phase (§10, Phase E) because it's the one piece with genuinely new
auth surface: Supabase sessions are cookie-based, and an external MCP client can't hold
portal cookies. This needs a real token-issuance design — most likely Supabase's own
OAuth/PKCE support, or a portal-minted short-lived token tied to a proper refresh flow
— not a bespoke API-key scheme that sits outside Supabase Auth and therefore outside
RLS's notion of identity. No code for this should be written before Phases A–D are
solid and reviewed.

---

## 9. Relationship to the role-catalog change

Landed alongside this document: `lib/editorial/roles.ts` now exports `ROLE_OPTIONS`
(value/label/description for `contributor`/`reviewer`/`editor`), and a new
`lib/tool-roles.ts` maps a tool's `key` to its catalog (or `null` for tools with no
distinct roles — Sourcework, Remote Interview, and Audience Listening today, since they
only check `tool_access` existence, never `tool_role`). The admin invite and edit-access
screens now render a dropdown with inline descriptions for tools that have a catalog,
and simply omit the role field for tools that don't, instead of showing a free-text box
that silently did nothing for three of the four tools. This doesn't change what
`tool_role` means or how it's enforced — it's still free text a tool alone interprets,
per CLAUDE.md — it only fixes the admin UI's honesty about it.

The reason this belongs in this document: a capability's `requires: { tool, role }`
(§4) is declared against exactly this catalog. A tool that wants a capability gated by
role has to define that role in its catalog first — the same list now driving the admin
dropdown is what a future capability's authorization metadata reads.

---

## 10. Incremental implementation plan

- **Phase A** — Extract Editorial Planning's capabilities first: smallest tool, richest
  existing role model, most reusable-looking Server Actions already. Define
  `lib/editorial/capabilities.ts` and `lib/capabilities/registry.ts` (just this one
  tool's entries for now). Refactor `pitches/actions.ts` and `meetings/actions.ts` to
  call the capabilities. No MCP server yet. Verify: lint, typecheck, `npm test`, and a
  manual pass through the Editorial UI — behavior (error text, audit event names and
  metadata) must be unchanged.
- **Phase B** — Add one high-value capability per remaining tool (Sourcework project
  search, Audience Listening's send-to-Sourcework handoff, Remote Interview session
  create), so the registry has real entries from all four tools before building
  anything that reads from it.
- **Phase C** — Stand up the internal MCP server using the official
  `@modelcontextprotocol/sdk`, as thin tool handlers over `registry.invoke(id, input,
  ctx)`. Auth for this phase is the in-portal case only: the calling context is the
  current request's Supabase session. Every invocation logs through `logAuditEvent()`
  with the real `auth.uid()`-derived profile as actor and a new `mcp.*` action
  namespace, so agent-originated writes are distinguishable from UI-originated ones in
  the audit log.
- **Phase D** — Build the in-portal agent (§7) against the Phase C server.
- **Phase E** — Only after D is solid and reviewed: external client connection (§8).

Each phase should be small enough to land and verify (lint/typecheck/test, plus manual
UI check for anything touching an existing screen) before the next starts — consistent
with how each tool in this repo was built one authorized phase at a time.

---

## 11. Risks and open questions to resolve before implementation

1. **The capability layer must never become a second RLS-bypass path.** It is an
   attractive place to reach for `lib/supabase/admin.ts` "for convenience" precisely
   because it sits several layers removed from a page — every capability handler must
   receive and use the request-scoped client tied to the real caller's session.
2. **Confirmation must be enforced by the registry, not by convention.** If
   `confirmation: "required"` is only documentation the calling LLM client is trusted
   to respect, a careless or compromised client can skip it; `invoke()` must require an
   explicit confirmed flag before running a gated handler's body.
3. **Audit authenticity.** MCP/agent-originated writes need the true signed-in actor,
   not a service identity, and a distinguishable `action` namespace (`mcp.*`) so a
   security review can tell what an agent actually did versus what a human clicked.
4. **Refactor risk to existing behavior.** Pulling logic out of Server Actions touches
   every current UI flow; error message text, redirect targets, and audit metadata must
   stay byte-for-byte equivalent, or admin/editorial screens change behavior silently.
   Do this one tool at a time, behind the existing test suite.
5. **External-client auth is a real, unsolved problem, not a detail.** Do not improvise
   a bespoke token scheme when this phase starts; it needs its own short design review
   against Supabase Auth's actual capabilities.
6. **Cost exposure.** Capabilities that call billable external services (AssemblyAI ASR,
   embeddings) become agent-reachable with no human-click rate limiter. Not blocking for
   Phase D (single trusted user, same rate a human would drive), but a prerequisite to
   resolve before Phase E (external clients, potentially less supervised usage).
7. **No job queue exists, and this design doesn't add one.** A capability that kicks off
   ASR or another async process must still return once started/queued, matching how the
   UI already behaves — an MCP tool must not be designed assuming a background-completion
   callback that this repo has nowhere to receive.
8. **New dependency: `zod`.** Small and single-purpose, justified by shared
   UI/MCP input validation (§4) — flagged here per this repo's own "don't add a major
   dependency without a specific reason" rule.

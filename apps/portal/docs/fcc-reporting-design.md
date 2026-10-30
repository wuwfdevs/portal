# FCC Reporting — Product & Engineering Design

Status: **Design, not yet authorized to build.** Third of the three tools
`docs/broadcast-operations-strategy.md` splits the WUWF Unified Broadcast
Rundown and Traffic System spec into, last in the strategy doc's build
order (§6) because it's read-only against a backlog of broadcast history
that has to exist before quarterly aggregation is worth building against.

Read `docs/broadcast-operations-strategy.md` and `docs/log-design.md`
before touching any of this — this tool owns nothing Log or Underwriting
depend on; the dependency runs one direction, into Log's broadcast events
and content tags. Source material throughout is the `WUWF Unified Broadcast
Rundownand Traffic System` spec (§ references point there), plus 47 C.F.R.
§ 73.3527(e)(8) and the FCC's Online Public Inspection File system, both
cited in that document's source notes.

---

## 1. The problem we're solving

Under 47 C.F.R. § 73.3527(e)(8), WUWF must maintain a quarterly list of the
programs that provided its most significant treatment of community issues
— a narrative for each issue plus the program title, date, time, and
duration of every airing that addressed it. Today that list gets
reconstructed after the fact from memory, program logs, and whatever
newsroom staff can piece together three months later. It is exactly the
kind of task that's hard not because any single step is hard, but because
nothing captures the raw material as it happens, so the quarter-end work is
archaeology instead of aggregation.

Log already captures the raw material — every news item carries subject and
community-issue tags, and every airing produces a broadcast event with a
real date, time, and duration. This tool's whole job is turning three
months of that into the narrative and program-detail document the rule
requires, with a human deciding what counts as the station's *most
significant* treatment, because the rule requires that judgment and this
tool must never make it silently (§18.3).

---

## 2. Product model

### Community issue
A canonical, controlled topic (§18.1) — this tool owns the taxonomy.
Newsroom staff tag content against it; this tool never invents an issue on
the fly during quarterly review, because a taxonomy that grows ad hoc
during a filing deadline is not a controlled taxonomy.

### Issue narrative
A draft, then approved, write-up for one community issue in one quarter —
the prose the rule requires, plus the assembled list of program details
that support it (§18.2).

### Filing
The approved, quarter-level document assembled from that quarter's
narratives, with a recorded filing date and an archived copy of everything
that supported it (§18.2's "record the filing date and archive the
approved copy and supporting evidence").

### The compliance boundary is part of the model, not a UI convention
§18.3 states it as a requirement, not a suggestion: this tool automates
collection, organization, and document preparation; it does not decide
which issues or programs constitute WUWF's most significant treatment, and
it does not file without human review. Every write that matters here —
approving a narrative, approving a filing — is a deliberate staff action
with an `approved_by`/`approved_at` pair, never a status a background
process sets. There is still no job queue in this repo to run that process
even if the design wanted to; the boundary and the current architecture
agree.

---

## 3. Primary user workflows

### A. Maintaining the community issue taxonomy (compliance officer)
Add, rename, retire an issue. Renaming doesn't retag history — every past
tag stays attached to the issue row, so its name change is reflected
everywhere at once, same as any other controlled vocabulary in this portal.

### B. Tagging content (newsroom staff, in Log)
Not a screen in this tool. Newsroom staff tag a news item's community-issue
relevance where they already work — Log's content editor — against this
tool's taxonomy. See §6 for how that cross-tool reference is wired.

### C. Reviewing a quarter's candidates (newsroom staff, management)
For the quarter being prepared, this tool aggregates every confirmed
`log_broadcast_events` row whose content item carries at least one
community-issue tag, grouped by issue: total airtime, item count, distinct
programs, and every confirmed airing with its date/time/duration (§18.2).
This is the raw material a human reviews to decide what's significant —
nothing here is pre-filtered to "significant" by an algorithm.

### D. Drafting an issue narrative (newsroom staff, management)
From the candidate list, select which airings the narrative should cite
and write the prose describing the issue and how WUWF's programming
addressed it. A narrative can be revised freely while in `draft`.

### E. Approving a narrative (compliance officer)
Marks it `approved`, locking the prose and its cited airings. An approved
narrative can still be superseded by a new draft if something was missed,
but the approved version is what a filing can include — not a screen-only
distinction; enforced the same way Roadmap's curation guard trigger keeps
`status` changes to the role that's allowed to make them (§6).

### F. Assembling and filing a quarter (compliance officer)
Once every issue narrative for the quarter is approved, assemble them into
one filing, record the filing date, and archive the approved copy and its
supporting evidence (§18.2). This is the one action in this tool that's
genuinely a point of no return within the tool's own model — see §6 on why
it still isn't literally irreversible.

---

## 4. Screens

```
/fcc-reporting                       Current quarter: aggregation by issue, open narratives
/fcc-reporting/issues                Community issue taxonomy (compliance officer)
/fcc-reporting/quarters/[q]          One quarter: narratives, filing status
/fcc-reporting/quarters/[q]/narratives/[issue]   Draft/review a narrative for one issue
/fcc-reporting/quarters/[q]/file     Assemble and record the filing
/fcc-reporting/filings                Filed quarters, archived documents
/fcc-reporting/filings/[id]          A past filing, read-only
```

**`/fcc-reporting`** — defaults to the current quarter, one row per
community issue showing candidate airtime/item count and narrative status
(no candidates / drafting / approved). The quarter picker moves between
past and current quarters; nothing here is ever generated for a future one.

**`/fcc-reporting/quarters/[q]/narratives/[issue]`** — the candidate list
on one side (checkable — include/exclude an airing from the narrative),
the narrative text on the other, and the approve action once a compliance
officer is looking at it.

---

## 5. Data model

Five tables, prefixed `fcc_`, plus one additive change to `log_content_items`
(§6).

### `fcc_community_issues`
`id`, `name`, `description`, `category` (nullable), `active` bool,
`created_by`, `created_at`, `updated_at`.

### `fcc_content_issue_tags`
`content_item_id` (→ `log_content_items`), `issue_id` (→
`fcc_community_issues`) — the real join table this tool's migration
introduces in place of Log milestone 1's free-text
`community_issue_tags text[]` column (§6).

### `fcc_issue_narratives`
`id`, `community_issue_id`, `quarter_start`, `quarter_end`,
`narrative_text`, `status` (`draft` | `approved`), `drafted_by`,
`approved_by` (nullable), `approved_at` (nullable), `created_at`,
`updated_at`.

### `fcc_narrative_broadcast_events`
`narrative_id`, `log_broadcast_event_id` — which specific confirmed
airings a narrative cites; §18.1's "every confirmed airing" made concrete
and durable, not re-derived from the tag aggregation at read time.

### `fcc_filings`
`id`, `quarter_start`, `quarter_end`, `status` (`draft` | `filed`),
`filed_at` (nullable), `filed_by` (nullable), `created_at`.

### `fcc_filing_narratives`
`filing_id`, `narrative_id` — every approved narrative a filing assembled,
giving a filing the same durable evidence trail an affidavit has in
Underwriting.

---

## 6. Architecture

### RLS shape: member vs. compliance officer

`private.has_fcc_reporting_access` is the ordinary membership predicate.
`private.is_fcc_compliance_officer` (`tool_access.tool_role =
'compliance_officer'`) gates narrative approval and filing — the two
actions §18.3 specifically reserves to human judgment and sign-off. Every
other member (newsroom staff, management reviewing candidates) can tag
content, draft narratives, and review candidates, matching the roles named
in source doc §2.2/§2.5.

### The Log boundary: read-only, one direction, with one real migration cost

This tool never writes to `log_broadcast_events` or `log_rundown_items` —
it only reads them, through a narrow additive `select` policy scoped to
`fcc_reporting` membership, the same read-only shape Underwriting uses for
its own exception queue.

The one place this tool's arrival genuinely touches Log's schema, not just
adds a policy: `docs/log-design.md` explicitly left
`log_content_items.community_issue_tags` as free-text `text[]`, deferring a
real taxonomy reference until this tool exists to own one. This tool's
migration is where that gets resolved — it adds `fcc_content_issue_tags`
as the real join table and includes a best-effort data migration matching
existing free-text tags to `fcc_community_issues` rows by name. Any
free-text tag that doesn't match anything gets flagged for manual
reconciliation rather than silently dropped or silently invented as a new
issue — an unmatched tag is exactly the kind of ambiguity §18.3's human-
judgment boundary exists to catch, so it surfaces to a person instead of
being resolved automatically.

This also means Log's content editor UI needs a follow-up change once this
tool ships — swapping a free-text tag field for a picker against the real
taxonomy — which is real cross-tool implementation cost worth stating
plainly now rather than discovering at build time. It's the same kind of
one-time cost Underwriting's arrival imposes on Log (`item_kind`/
`underwriting_copy_id` added to `log_rundown_items`), and it's the reason
the strategy doc puts this tool last: the cost is paid once, after both of
the other tools' schemas have already settled.

### Filing status has one real point of no return, and it's still just a status

Marking a filing `filed` matters — it's the record of when WUWF actually
submitted, and §18.2 wants it archived. But nothing about `fcc_filings`
prevents a correction later the way, say, a deleted `ap_submissions` row
does; a filed quarter can still be revisited if an error surfaces (a new
`fcc_filings` row for a corrected re-filing, referencing what it
supersedes, rather than an update-in-place that would quietly rewrite what
was actually submitted on a given date). Preserving what was actually
filed, even when it turns out to have been wrong, is the same "planned is
not aired" discipline Log's broadcast events apply to on-air history,
applied here to compliance history.

### No PDF generation, same call as Underwriting

§18.2's "generate an approved filing document" gets the same answer
Underwriting's affidavits did (`docs/underwriting-design.md` §6): a
structured, browser-printable view of the filing backed by
`fcc_filing_narratives`' real evidence trail, not a new PDF-generation
dependency introduced for one tool's formatting preference. If both tools
eventually want real PDF output, that's the point to evaluate a shared
dependency once, not before either has shipped.

### Audit events

Narrative approval and filing both call `logAuditEvent()`
(`fcc_reporting.narrative.approved`, `fcc_reporting.filing.filed`), with a
new `audit_events_insert_fcc_reporting` policy scoped to this tool's
members — same shape as every other tool's privileged-action logging.
Tagging content and drafting a narrative are ordinary work and stay off the
audit log, matching the member/privileged-action distinction every other
tool in this portal draws.

### Fit with portal conventions

`requireToolAccess("fcc-reporting")` gates the route segment; Server
Actions (`taxonomy-actions.ts`, `narrative-actions.ts`, `filing-actions.ts`)
assert access first; reads live in `lib/fcc-reporting/queries.ts` behind
`unwrapRead()`; pure logic — quarter-boundary calculation, the candidate
aggregation shape, narrative-status transitions — colocated with
`*.test.ts`, no Supabase import.

Capabilities: `fccReporting.candidates.list` (the aggregation, useful to
the in-portal agent for "how are we tracking on X issue this quarter"
without opening a screen) and `fccReporting.narrative.approve`
(`confirmation: "required"`, since it locks a narrative's cited evidence).
No capability writes a filing directly — assembling and recording one stays
a deliberate screen action, not something worth exposing to an agent given
how rarely it happens and how much it matters to get right.

### What's deliberately not in the architecture (milestone 1)

- **No automatic significance scoring.** §18.3's boundary rules this out
  outright, not just as a milestone deferral — this tool never ranks or
  pre-selects "significant" treatments; it presents candidates and lets a
  human choose.
- **No PDF generation.** §6 above.
- **No automatic filing into the FCC's public inspection file.** Explicitly
  excluded from the whole product's scope (source doc's "Product
  boundaries" table) — filing procedures need WUWF's designated compliance
  officer to confirm the actual mechanics before this tool automates
  anything about submission itself, and the source document says so
  directly in its closing source note.
- **No retroactive backfill UI for pre-Log broadcast history.** This tool's
  aggregation only ever sees what Log has recorded since it existed;
  reconstructing older quarters stays exactly the manual process it is
  today, unless WUWF specifically asks for a backfill tool later.

---

## 7. Milestone 1, and what is left

**Milestone 1** ships: the community issue taxonomy, the real
`fcc_content_issue_tags` join (replacing Log's free-text stopgap, with
best-effort migration and manual reconciliation for anything unmatched),
quarterly candidate aggregation from Log's broadcast events, narrative
drafting and approval, and filing assembly with a browser-printable
document and a durable evidence trail.

**Deferred:**

1. **True PDF/document generation**, same follow-up as Underwriting's
   affidavits, and worth evaluating together if both tools want it.
2. **A backfill tool for pre-Log history**, only if WUWF actually needs one
   reconstructed rather than accepting current practice for anything before
   this tool existed.
3. **Any move toward automated filing submission**, blocked on WUWF's
   compliance officer confirming actual FCC filing procedures — the source
   document is explicit that this needs confirmation before production use.

**Open questions specific to this tool:**

- What controlled taxonomy should WUWF actually use for community issues?
  The strategy doc already flags this as unresolved (§7); it blocks
  `fcc_community_issues`' initial seed data, not just a future nice-to-have.
- How long must completed rundowns, broadcast events, and generated filings
  be retained? This affects whether `log_broadcast_events` (which this tool
  depends on) needs a retention policy at all, or whether "keep everything"
  is the right default until told otherwise.
- Does WUWF's current quarterly process already have a house style for
  narrative language or program-detail formatting that the browser-print
  filing view should match, so the first real filing produced by this tool
  doesn't look visibly different from prior quarters' filings?

// Log's capability layer (docs/agent-capabilities-design.md §4). Three
// entries, exactly the ones docs/log-design.md's "Architecture" section
// names as "the three operations useful to drive from the in-portal agent
// without a live view in front of you": buildItem and recordOutcome are
// the write logic that used to live inline in rundown-actions.ts's
// fillRundownItem and broadcast-actions.ts's old markAired/markMissed
// (same authorization, same writes) — the callers are now thin adapters
// over these, same pattern Phase A/B already established.
// log.content.search mirrors sourcework.project.search.
//
// Domain redesign (2026-08-08): a "slot" is now a break that can hold zero
// or more items, not a single pre-existing row to fill in place — see
// docs/log-design.md §4B. buildItem creates a new item inside a break
// rather than updating an existing placeholder's content_item_id.
//
// recordOutcome no longer has a "moved" branch (removed 2026-08-09): moving
// ordinary content around a rundown is now a plain edit — see
// lib/log/rundown-relocation.ts and lib/log/mid-broadcast.ts —
// not a broadcast outcome worth its own log_broadcast_events row. This
// capability now covers aired/missed only.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import type { CapabilityContext } from "@/lib/capabilities/define";
import { assertLogAccess } from "./access";
import { clampOccurredAt } from "./broadcast-queue";
import { CONTENT_TYPE_LABEL, computeTotalDurationSeconds } from "./content-library";
import {
  getContentItemDetail,
  getRundownBreak,
  listContentItems,
  listItemsForBreak,
  type LogContentItemRow,
} from "./queries";
import type { LogMissReason } from "@/lib/database.types";

const CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABEL) as [
  keyof typeof CONTENT_TYPE_LABEL,
  ...(keyof typeof CONTENT_TYPE_LABEL)[],
];
const APPROVAL_STATUSES = ["draft", "approved", "retired"] as const;
const MISS_REASONS: [LogMissReason, ...LogMissReason[]] = [
  "network_timing",
  "breaking_news",
  "segment_overrun",
  "technical_problem",
  "host_error",
  "unavailable_copy",
  "other",
];

/**
 * Optional on both outcomes; set by the live rundown screen's offline queue
 * (lib/log/broadcast-queue.ts). `eventId` becomes the log_broadcast_events
 * row's id, which is what makes a replayed send safe; `occurredAt` is when
 * the host tapped, clamped by clampOccurredAt so it can't be set in the
 * future or far in the past.
 */
const OUTCOME_REPLAY_FIELDS = {
  eventId: z.string().uuid().optional(),
  occurredAt: z.string().optional(),
};

// --- log.rundown.buildItem --------------------------------------------------

export type BuildRundownItemResult =
  | { ok: true; itemId: string; contentItemId: string; plannedDurationSeconds: number }
  | { ok: false; error: string };

/** Places a content-library item into an open break, the same write fillRundownItem (rundown-actions.ts) performs. */
export const buildRundownItem = defineCapability({
  id: "log.rundown.buildItem",
  summary:
    "Add a content-library item into an open local-opportunity break in a rundown. Use log.content.search first to find an eligible item's id.",
  input: z.object({ breakId: z.string(), contentItemId: z.string() }),
  requires: { tool: "log" },
  confirmation: "none",
  async handler({ supabase }: CapabilityContext, input): Promise<BuildRundownItemResult> {
    await assertLogAccess();

    // Independent reads (neither the break, the break's existing items, nor
    // the content item depends on either of the others), run together
    // rather than as three sequential round trips — the fill flow's own
    // slowest part once the page-level reads it triggers via redirect were
    // already parallelized.
    const [brk, existingItems, contentItem] = await Promise.all([
      getRundownBreak(input.breakId),
      listItemsForBreak(input.breakId),
      getContentItemDetail(input.contentItemId),
    ]);
    if (!brk) return { ok: false, error: "That break no longer exists." };
    if (!contentItem) return { ok: false, error: "That content item no longer exists." };
    const plannedDurationSeconds =
      computeTotalDurationSeconds(contentItem.components, contentItem.expected_duration_seconds) ??
      0;

    const nextPosition = existingItems.reduce((max, item) => Math.max(max, item.position), 0) + 1;

    const { data, error } = await supabase
      .from("log_rundown_items")
      .insert({
        break_id: input.breakId,
        position: nextPosition,
        item_kind: "content",
        content_item_id: input.contentItemId,
        planned_duration_seconds: plannedDurationSeconds,
        placement_status: "replaceable",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Could not fill this break: ${error.message}` };

    return {
      ok: true,
      itemId: data.id,
      contentItemId: input.contentItemId,
      plannedDurationSeconds,
    };
  },
});

// --- log.rundownItem.recordOutcome -----------------------------------------

export type RecordRundownOutcomeResult =
  { ok: true; outcome: "aired" | "missed" } | { ok: false; error: string };

/**
 * One capability over the two remaining mid-broadcast outcomes (the live
 * screen's aired/missed buttons reach it through the offline queue's
 * syncBroadcastAction in broadcast-actions.ts) rather than two, since
 * they're one decision ("what happened to this item") with a discriminated
 * shape — matching how an MCP/agent caller would naturally think about
 * "record what happened." Confirmation-required: this is the as-aired
 * record other tools (Underwriting's exception queue, FCC Reporting) will
 * eventually read as ground truth, so an agent needs an explicit human yes
 * before writing it, same reasoning as audience-listening.answer.sendToSourcework.
 */
export const recordRundownItemOutcome = defineCapability({
  id: "log.rundownItem.recordOutcome",
  summary:
    "Record what happened to a rundown item — aired as scheduled, or missed (with a brief reason).",
  input: z.discriminatedUnion("outcome", [
    z.object({ outcome: z.literal("aired"), itemId: z.string(), ...OUTCOME_REPLAY_FIELDS }),
    z.object({
      outcome: z.literal("missed"),
      itemId: z.string(),
      reason: z.enum(MISS_REASONS),
      notes: z.string().trim().optional(),
      ...OUTCOME_REPLAY_FIELDS,
    }),
  ]),
  requires: { tool: "log" },
  confirmation: "required",
  async handler({ supabase }: CapabilityContext, input): Promise<RecordRundownOutcomeResult> {
    const { profile } = await assertLogAccess();
    const replay = {
      ...(input.eventId ? { id: input.eventId } : {}),
      recorded_at: clampOccurredAt(input.occurredAt, Date.now()),
    };
    // A replayed send (its first attempt landed, its response was lost)
    // collides with its own primary key — the event is already recorded.
    const alreadyRecorded = (code: string | undefined) =>
      input.eventId !== undefined && code === "23505";

    if (input.outcome === "aired") {
      const { error } = await supabase.from("log_broadcast_events").insert({
        rundown_item_id: input.itemId,
        outcome: "aired_as_scheduled",
        confirmation_source: "host",
        recorded_by: profile.id,
        ...replay,
      });
      if (error && !alreadyRecorded(error.code)) {
        return { ok: false, error: `Could not record this item as aired: ${error.message}` };
      }
      return { ok: true, outcome: "aired" };
    }

    if (input.outcome === "missed") {
      const { error } = await supabase.from("log_broadcast_events").insert({
        rundown_item_id: input.itemId,
        outcome: "missed",
        reason: input.reason,
        notes: input.notes || null,
        confirmation_source: "host",
        recorded_by: profile.id,
        ...replay,
      });
      if (error && !alreadyRecorded(error.code)) {
        return { ok: false, error: `Could not record this item as missed: ${error.message}` };
      }
      return { ok: true, outcome: "missed" };
    }

    return { ok: false, error: "Unknown outcome." };
  },
});

// --- log.content.search ------------------------------------------------------

export interface ContentSearchResult extends LogContentItemRow {
  url: string;
}

/** Mirrors sourcework.project.search — filters the same listContentItems() read the library browse screen uses. */
export const searchContentLibrary = defineCapability({
  id: "log.content.search",
  summary:
    "Find content-library items (news, promos, PSAs, etc.) by title text, content type, and/or approval status.",
  input: z.object({
    query: z.string().trim().optional(),
    contentType: z.enum(CONTENT_TYPES).optional(),
    approvalStatus: z.enum(APPROVAL_STATUSES).optional(),
  }),
  requires: { tool: "log" },
  confirmation: "none",
  async handler(_ctx: CapabilityContext, input): Promise<ContentSearchResult[]> {
    await assertLogAccess();
    const items = await listContentItems({
      contentType: input.contentType,
      approvalStatus: input.approvalStatus,
    });
    const query = input.query?.toLowerCase();
    return items
      .filter((item) => !query || item.title.toLowerCase().includes(query))
      .map((item) => ({ ...item, url: `/log/library/${item.id}` }));
  },
});

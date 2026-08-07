// Log's capability layer (docs/agent-capabilities-design.md §4). Three
// entries, exactly the ones docs/log-design.md's "Architecture" section
// names as "the three operations useful to drive from the in-portal agent
// without a live console in front of you": buildItem and recordOutcome are
// the write logic that used to live inline in rundown-actions.ts's
// fillRundownItem and console-actions.ts's markAired/markMissed/
// moveRundownItem (same authorization, same writes) — those are now thin
// adapters over these, same pattern Phase A/B already established.
// log.content.search mirrors sourcework.project.search.
//
// Domain redesign (2026-08-08): a "slot" is now a break that can hold zero
// or more items, not a single pre-existing row to fill in place — see
// docs/log-design.md §4B. buildItem creates a new item inside a break
// rather than updating an existing placeholder's content_item_id;
// recordOutcome's "moved" branch creates a fresh item at the destination
// break and leaves the source item exactly as it was, recording it
// 'skipped' — "this specific planned placement did not happen, because the
// content moved elsewhere," never deleted, per the same as-planned-history
// precedent log_broadcast_events itself follows.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import type { CapabilityContext } from "@/lib/capabilities/define";
import { assertLogAccess } from "./access";
import { CONTENT_TYPE_LABEL, computeTotalDurationSeconds } from "./content-library";
import { getContentItemDetail, getRundownBreak, getRundownItem, listContentItems, listItemsForBreak, type LogContentItemRow } from "./queries";
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

// --- log.rundown.buildItem --------------------------------------------------

export type BuildRundownItemResult =
  | { ok: true; itemId: string; contentItemId: string; plannedDurationSeconds: number }
  | { ok: false; message: string };

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

    const brk = await getRundownBreak(input.breakId);
    if (!brk) return { ok: false, message: "That break no longer exists." };

    const existingItems = await listItemsForBreak(input.breakId);
    if (existingItems.length > 0 && !brk.allow_multiple) {
      return { ok: false, message: "That break is already occupied." };
    }

    const contentItem = await getContentItemDetail(input.contentItemId);
    if (!contentItem) return { ok: false, message: "That content item no longer exists." };
    const plannedDurationSeconds =
      computeTotalDurationSeconds(contentItem.components, contentItem.expected_duration_seconds) ?? 0;

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
    if (error) return { ok: false, message: `Could not fill this break: ${error.message}` };

    return { ok: true, itemId: data.id, contentItemId: input.contentItemId, plannedDurationSeconds };
  },
});

// --- log.rundownItem.recordOutcome -----------------------------------------

export type RecordRundownOutcomeResult =
  | { ok: true; outcome: "aired" | "missed" | "moved" }
  | { ok: false; message: string };

/**
 * One capability over Workflow G's three mid-broadcast actions
 * (console-actions.ts's markAired/markMissed/moveRundownItem) rather than
 * three, since they're one decision ("what happened to this item") with a
 * discriminated shape — matching how an MCP/agent caller would naturally
 * think about "record what happened," not three near-identical tools.
 * Confirmation-required: this is the as-aired record other tools
 * (Underwriting's exception queue, FCC Reporting) will eventually read as
 * ground truth, so an agent needs an explicit human yes before writing it,
 * same reasoning as audience-listening.answer.sendToSourcework.
 */
export const recordRundownItemOutcome = defineCapability({
  id: "log.rundownItem.recordOutcome",
  summary:
    "Record what happened to a rundown item — aired as scheduled, missed (with a brief reason), or moved to a different open break.",
  input: z.discriminatedUnion("outcome", [
    z.object({ outcome: z.literal("aired"), itemId: z.string() }),
    z.object({
      outcome: z.literal("missed"),
      itemId: z.string(),
      reason: z.enum(MISS_REASONS),
      notes: z.string().trim().optional(),
    }),
    z.object({ outcome: z.literal("moved"), sourceItemId: z.string(), destinationBreakId: z.string() }),
  ]),
  requires: { tool: "log" },
  confirmation: "required",
  async handler({ supabase }: CapabilityContext, input): Promise<RecordRundownOutcomeResult> {
    const { profile } = await assertLogAccess();

    if (input.outcome === "aired") {
      const { error } = await supabase.from("log_broadcast_events").insert({
        rundown_item_id: input.itemId,
        outcome: "aired_as_scheduled",
        confirmation_source: "host",
        recorded_by: profile.id,
      });
      if (error) return { ok: false, message: `Could not record this item as aired: ${error.message}` };
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
      });
      if (error) return { ok: false, message: `Could not record this item as missed: ${error.message}` };
      return { ok: true, outcome: "missed" };
    }

    const source = await getRundownItem(input.sourceItemId);
    if (!source || source.item_kind !== "content" || source.content_item_id === null) {
      return { ok: false, message: "There is nothing to move." };
    }
    const destinationBreak = await getRundownBreak(input.destinationBreakId);
    if (!destinationBreak) return { ok: false, message: "That destination no longer exists." };

    const destinationItems = await listItemsForBreak(input.destinationBreakId);
    if (destinationItems.length > 0 && !destinationBreak.allow_multiple) {
      return { ok: false, message: "That destination is no longer open." };
    }

    const nextPosition = destinationItems.reduce((max, item) => Math.max(max, item.position), 0) + 1;

    const { error: insertError } = await supabase.from("log_rundown_items").insert({
      break_id: input.destinationBreakId,
      position: nextPosition,
      item_kind: "content",
      content_item_id: source.content_item_id,
      planned_duration_seconds: source.planned_duration_seconds,
      placement_status: "replaceable",
    });
    if (insertError) return { ok: false, message: `Could not move this item: ${insertError.message}` };

    // The source item is never deleted or cleared — it stays exactly as
    // planned, and its own broadcast event records that the content moved
    // elsewhere. locked, since the original placement is now resolved
    // history, not something to keep editing in place.
    const { error: lockError } = await supabase
      .from("log_rundown_items")
      .update({ placement_status: "locked" })
      .eq("id", input.sourceItemId);
    if (lockError) return { ok: false, message: `Moved, but could not update the original item: ${lockError.message}` };

    const { error: eventError } = await supabase.from("log_broadcast_events").insert({
      rundown_item_id: input.sourceItemId,
      outcome: "skipped",
      notes: `Moved to a different break (${input.destinationBreakId}).`,
      confirmation_source: "host",
      recorded_by: profile.id,
    });
    if (eventError) return { ok: false, message: `Moved, but could not record it: ${eventError.message}` };

    return { ok: true, outcome: "moved" };
  },
});

// --- log.content.search ------------------------------------------------------

export interface ContentSearchResult extends LogContentItemRow {
  url: string;
}

/** Mirrors sourcework.project.search — filters the same listContentItems() read the library browse screen uses. */
export const searchContentLibrary = defineCapability({
  id: "log.content.search",
  summary: "Find content-library items (news, promos, PSAs, etc.) by title text, content type, and/or approval status.",
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

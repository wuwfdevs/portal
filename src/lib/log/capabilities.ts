// Log's capability layer (docs/agent-capabilities-design.md §4). Three
// entries, exactly the ones docs/log-design.md's "Architecture" section
// names as "the three operations useful to drive from the in-portal agent
// without a live console in front of you": buildItem and recordOutcome are
// the write logic that used to live inline in rundown-actions.ts's
// fillRundownItem and console-actions.ts's markAired/markMissed/
// moveRundownItem (same authorization, same writes) — those are now thin
// adapters over these, same pattern Phase A/B already established.
// log.content.search mirrors sourcework.project.search.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import type { CapabilityContext } from "@/lib/capabilities/define";
import { assertLogAccess } from "./access";
import { CONTENT_TYPE_LABEL, computeTotalDurationSeconds } from "./content-library";
import { getContentItemDetail, getRundownItem, listContentItems, type LogContentItemRow } from "./queries";
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

/** Same write fillRundownItem (rundown-actions.ts) performs: fill or replace a rundown item's content, recomputing planned duration from the chosen item's components. */
export const buildRundownItem = defineCapability({
  id: "log.rundown.buildItem",
  summary:
    "Add or replace a content-library item in one rundown slot (a clock's local break). Use log.content.search first to find an eligible item's id.",
  input: z.object({ itemId: z.string(), contentItemId: z.string() }),
  requires: { tool: "log" },
  confirmation: "none",
  async handler({ supabase }: CapabilityContext, input): Promise<BuildRundownItemResult> {
    await assertLogAccess();

    const contentItem = await getContentItemDetail(input.contentItemId);
    if (!contentItem) return { ok: false, message: "That content item no longer exists." };
    const plannedDurationSeconds =
      computeTotalDurationSeconds(contentItem.components, contentItem.expected_duration_seconds) ?? 0;

    const { error } = await supabase
      .from("log_rundown_items")
      .update({
        content_item_id: input.contentItemId,
        planned_duration_seconds: plannedDurationSeconds,
        placement_status: "replaceable",
      })
      .eq("id", input.itemId);
    if (error) return { ok: false, message: `Could not fill this slot: ${error.message}` };

    return { ok: true, itemId: input.itemId, contentItemId: input.contentItemId, plannedDurationSeconds };
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
    "Record what happened to a rundown item — aired as scheduled, missed (with a brief reason), or moved to a different open slot.",
  input: z.discriminatedUnion("outcome", [
    z.object({ outcome: z.literal("aired"), itemId: z.string() }),
    z.object({
      outcome: z.literal("missed"),
      itemId: z.string(),
      reason: z.enum(MISS_REASONS),
      notes: z.string().trim().optional(),
    }),
    z.object({ outcome: z.literal("moved"), sourceItemId: z.string(), destinationItemId: z.string() }),
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
    if (!source || source.content_item_id === null) return { ok: false, message: "There is nothing to move." };
    const destination = await getRundownItem(input.destinationItemId);
    if (!destination || destination.content_item_id !== null || destination.underwriting_copy_id !== null) {
      return { ok: false, message: "That destination is no longer open." };
    }

    const { data: sourceSlot, error: slotError } = await supabase
      .from("log_clock_slots")
      .select("duration_seconds")
      .eq("id", source.clock_slot_id)
      .single();
    if (slotError) return { ok: false, message: `Could not move this item: ${slotError.message}` };

    const { error: destinationError } = await supabase
      .from("log_rundown_items")
      .update({
        content_item_id: source.content_item_id,
        planned_duration_seconds: source.planned_duration_seconds,
        placement_status: "replaceable",
      })
      .eq("id", input.destinationItemId);
    if (destinationError) return { ok: false, message: `Could not move this item: ${destinationError.message}` };

    const { error: sourceError } = await supabase
      .from("log_rundown_items")
      .update({
        content_item_id: null,
        planned_duration_seconds: sourceSlot?.duration_seconds ?? source.planned_duration_seconds,
        placement_status: "editable",
      })
      .eq("id", input.sourceItemId);
    if (sourceError) {
      return { ok: false, message: `Moved, but could not clear the original slot: ${sourceError.message}` };
    }

    const { error: eventError } = await supabase.from("log_broadcast_events").insert({
      rundown_item_id: input.sourceItemId,
      outcome: "skipped",
      notes: `Moved to a later opening (${input.destinationItemId}).`,
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

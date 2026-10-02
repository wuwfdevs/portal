import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { unwrapRead } from "@/lib/read-result";
import {
  isAutomated,
  type OnAirChange,
  type WeeklyAutomatedWindow,
} from "@/lib/log/automated-hours";
import { loadAutomatedHours } from "@/lib/log/automated-hours-queries";
import { automationBlockFor } from "./freeze";
import { listCreditRooms, listPlaceableRundownBreaks, reassignCreditCopy } from "./placement";
import {
  getContract,
  getScheduleLine,
  listCopyLinkedToContracts,
  listPlacementsWithOutcomes,
} from "./queries";
import {
  nextInRotation,
  previousInGroup,
  walkRotation,
  type RotationCopy,
  type RotationSlot,
} from "./rotation";

/**
 * Keeps a contract's copy rotation current (docs/underwriting-traffic-
 * redesign.md §13). The pure walk (rotation.ts) says which future
 * placement should carry which message; this module loads the contract's
 * timeline, runs the walk, and writes each change through
 * log_reassign_underwriting_credit_copy(), which re-checks every guard.
 *
 * Called at the end of every write that changes the rotation's inputs or
 * the timeline — a message linked, unlinked, re-scoped, created, edited,
 * approved or retired; a credit placed by hand, by auto-fill, as a makegood
 * or by a bump; a line cancelled; a revision activated. Best-effort by
 * design: it runs after the primary write has already succeeded, a refusal
 * is reported and skipped rather than thrown, and it never clears a
 * placement — the same rule as embeddings ("never fatal to the write that
 * triggered it"). Nothing here touches an aired credit, a live or
 * submitted rundown, a started break, or a placement pinned by a manager
 * override; those advance the cycle without moving.
 */

export interface RotationRebalanceResult {
  changed: number;
  refused: { placementId: string; error: string }[];
}

const NOTHING: RotationRebalanceResult = { changed: 0, refused: [] };

interface RotationContext {
  copies: RotationCopy[];
  slots: RotationSlot[];
  /** Automated hours, so a slot DAD plays only takes copy with a DAD cut. */
  hours: { weekly: WeeklyAutomatedWindow[]; changes: OnAirChange[] };
}

/** The contract's linked messages and every current-revision placement as the walk sees them, or null for a contract that isn't active. */
async function loadRotationContext(contractId: string): Promise<RotationContext | null> {
  const contract = await getContract(contractId);
  if (!contract || contract.status !== "active") return null;
  const supabase = await createClient();

  const [linked, revision, roomsResult, hours] = await Promise.all([
    listCopyLinkedToContracts([contractId]),
    supabase
      .from("uw_contract_revisions")
      .select("id")
      .eq("contract_id", contractId)
      .eq("status", "current")
      .maybeSingle(),
    listCreditRooms(contractId),
    loadAutomatedHours(),
  ]);
  const current = unwrapRead(revision, "this contract's current revision");
  if (!current) return null;
  if (!roomsResult.ok) throw new Error(roomsResult.message);

  const copies: RotationCopy[] = (linked.get(contractId) ?? []).map(
    ({ copy, flightId, scheduleLineId }) => ({
      id: copy.id,
      approvalStatus: copy.approval_status,
      durationSeconds: copy.duration_seconds,
      effectiveFrom: copy.effective_from,
      effectiveTo: copy.effective_to,
      flightId,
      lineId: scheduleLineId,
      dadCut: copy.dad_cut,
      createdAt: copy.created_at,
    }),
  );

  const lines =
    unwrapRead(
      await supabase
        .from("uw_contract_schedule_lines")
        .select("id, flight_id")
        .eq("contract_id", contractId)
        .eq("revision_id", current.id),
      "this contract's schedule lines",
    ) ?? [];
  const flightByLine = new Map(lines.map((line) => [line.id, line.flight_id]));
  const placementsByLine = await listPlacementsWithOutcomes(lines.map((line) => line.id));
  const roomByPlacement = new Map(roomsResult.rooms.map((room) => [room.placement_id, room]));
  const nowISO = new Date().toISOString();

  const slots: RotationSlot[] = [];
  for (const placements of placementsByLine.values()) {
    for (const placement of placements) {
      const room = roomByPlacement.get(placement.id);
      const fixed =
        placement.outcome !== "pending" ||
        placement.override_reason !== null ||
        room === undefined ||
        room.has_outcome ||
        automationBlockFor(
          { rundownStatus: room.rundown_status, scheduledAt: room.break_scheduled_at },
          nowISO,
        ) !== null;
      slots.push({
        id: placement.id,
        scheduledAt: placement.scheduled_at,
        airDate: placement.placement_date,
        lineFlightId: flightByLine.get(placement.schedule_line_id) ?? null,
        lineId: placement.schedule_line_id,
        copyId: placement.copy_id,
        fixed,
        roomSeconds: room?.room_seconds ?? 0,
        automated: isAutomated(placement.scheduled_at, hours.weekly, hours.changes),
      });
    }
  }
  return { copies, slots, hours };
}

/** Re-sequences every future, unfixed placement of an active contract; a no-op for any other contract. */
export async function rebalanceContractRotation(
  contractId: string,
  actorId?: string,
): Promise<RotationRebalanceResult> {
  const context = await loadRotationContext(contractId);
  if (!context) return NOTHING;

  const result: RotationRebalanceResult = { changed: 0, refused: [] };
  for (const change of walkRotation(context.copies, context.slots)) {
    const written = await reassignCreditCopy(change.id, change.copyId);
    if (!written.ok) {
      console.warn("Rotation rebalance refused", {
        placementId: change.id,
        error: written.message,
      });
      result.refused.push({ placementId: change.id, error: written.message });
      continue;
    }
    if (written.changed) result.changed++;
  }

  if (result.changed > 0 && actorId) {
    await logAuditEvent({
      actorId,
      action: "underwriting.contract.rotation_rebalanced",
      targetType: "uw_contract",
      targetId: contractId,
      metadata: { changed: result.changed, refused: result.refused.length },
    });
  }
  return result;
}

/** Rebalances every contract a message is linked to — after its status, dates, duration or script change. */
export async function rebalanceRotationForCopy(
  copyId: string,
  actorId?: string,
): Promise<RotationRebalanceResult> {
  const supabase = await createClient();
  const links =
    unwrapRead(
      await supabase.from("uw_contract_copy").select("contract_id").eq("copy_id", copyId),
      "this copy's linked contracts",
    ) ?? [];
  const totals: RotationRebalanceResult = { changed: 0, refused: [] };
  for (const link of new Set(links.map((link) => link.contract_id))) {
    const result = await rebalanceContractRotation(link, actorId);
    totals.changed += result.changed;
    totals.refused.push(...result.refused);
  }
  return totals;
}

/**
 * The message the rotation would give a credit placed next on a line —
 * the manual placement form's default (docs/underwriting-traffic-
 * redesign.md §13). With a candidate break, the previous airing is the
 * contract's latest placement before that break; without one, its latest
 * placement of all. Null when nothing linked is eligible.
 */
export async function suggestNextCopyForLine(
  contractId: string,
  line: { id: string; flight_id: string | null },
  candidate?: { scheduledAt: string; airDate: string; roomSeconds: number },
): Promise<string | null> {
  const context = await loadRotationContext(contractId);
  if (!context) return null;
  const previous = previousInGroup(context.slots, line.id, context.copies, candidate?.scheduledAt);
  const pick = nextInRotation(
    context.copies,
    previous,
    candidate
      ? {
          airDate: candidate.airDate,
          lineFlightId: line.flight_id,
          lineId: line.id,
          roomSeconds: candidate.roomSeconds,
          automated: isAutomated(
            candidate.scheduledAt,
            context.hours.weekly,
            context.hours.changes,
          ),
        }
      : {
          airDate: "9999-12-31",
          lineFlightId: line.flight_id,
          lineId: line.id,
          roomSeconds: Number.MAX_SAFE_INTEGER,
        },
  );
  return pick?.id ?? null;
}

/**
 * The message a placement form should use: the one it named, else the
 * rotation's pick for the chosen break — resolved through the same listing
 * the picker showed, so the break's air date and room are real. Null when
 * nothing linked is eligible. Shared by the contract page's "Place a
 * credit" form and the makegood slot form.
 */
export async function resolveCopyForBreak(
  scheduleLineId: string,
  breakId: string,
  namedCopyId: string | null,
): Promise<string | null> {
  if (namedCopyId) return namedCopyId;
  const line = await getScheduleLine(scheduleLineId);
  if (!line) return null;
  const listed = await listPlaceableRundownBreaks(scheduleLineId);
  const brk = listed.ok ? listed.breaks.find((b) => b.break_id === breakId) : undefined;
  return suggestNextCopyForLine(
    line.contract_id,
    line,
    brk
      ? { scheduledAt: brk.scheduled_at, airDate: brk.air_date, roomSeconds: brk.remaining_seconds }
      : undefined,
  );
}

/**
 * The rotation's next message for each of a contract's lines, given the
 * contract's latest placement — what the "Place a credit" forms show as
 * their default before a break is chosen. One context load for all lines.
 */
export async function suggestNextCopyForLines(
  contractId: string,
  lines: { id: string; flight_id: string | null }[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (lines.length === 0) return result;
  const context = await loadRotationContext(contractId);
  if (!context) return result;
  for (const line of lines) {
    const previous = previousInGroup(context.slots, line.id, context.copies);
    const pick = nextInRotation(context.copies, previous, {
      airDate: "9999-12-31",
      lineFlightId: line.flight_id,
      lineId: line.id,
      roomSeconds: Number.MAX_SAFE_INTEGER,
    });
    result.set(line.id, pick?.id ?? null);
  }
  return result;
}

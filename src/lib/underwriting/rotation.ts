// Copy rotation (docs/underwriting-traffic-redesign.md §13). Pure — no
// Supabase import, colocated tests. A contract's messages rotate as ONE
// cycle in broadcast order across every schedule line of the contract, not
// per line and not by counting: each credit takes the message after the
// one that airs immediately before it, whichever line either belongs to.
// Two messages alternate A, B, A, B on air; three cycle A, B, C.
//
// The cycle is the contract's linked copy in the order the Copy tab lists
// it (uw_copy.created_at, then id). Eligibility for one slot is the same
// rule the placement guard applies: approved, in date for the air date,
// contract-wide or scoped to the line's own flight, and short enough for
// the room. A slot that is fixed (aired, frozen by uw_automation_block(),
// or placed with a manager override) is never changed but still advances
// the cycle for whatever follows it.
//
// Weights (docs/underwriting-traffic-redesign.md §13.2): each link carries
// an integer weight, default 1. Equal weights are the plain cycle above.
// When the eligible messages' weights differ, a slot goes to whichever is
// owed the most — its weighted share of the slots so far, plus this one,
// less the times it has aired — ties broken in cycle order. Deterministic
// and a function of the preceding timeline only, so a rebalance converges.
//
// Both callers use the same walk: the planner (inventory-selection.ts)
// sequences a run's new units against the contract's existing timeline,
// and the rebalance (rotation-rebalance.ts) re-sequences every future,
// unfixed placement after a write that changed the inputs — a message
// linked, unlinked, approved, retired, re-dated, or a placement added or
// cleared. Nothing here decides *whether* a credit airs, only which
// message it carries; a slot with no eligible message keeps its copy.

import type { UwCopyApprovalStatus } from "@/lib/database.types";

export interface RotationCopy {
  id: string;
  approvalStatus: UwCopyApprovalStatus;
  durationSeconds: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** The uw_contract_copy link's flight scope — null for contract-wide copy. */
  flightId: string | null;
  /**
   * The uw_contract_copy link's schedule-line scope: the order gives this
   * message to one line ("For Carpool: #1"). Null for copy that serves
   * every line without dedicated copy of its own.
   */
  lineId?: string | null;
  /**
   * The message's DAD cut. Undefined means unknown (treated as playable);
   * null means DAD has nothing to play, so the message can't fill a break
   * in automated hours.
   */
  dadCut?: string | null;
  createdAt: string;
  /** The link's weight: how often the message airs relative to its group's others. Absent means 1. */
  weight?: number;
}

/** One earlier airing in a rotation group, in air order — what the weighted pick counts. */
export interface RotationHistoryEntry {
  copyId: string | null;
  scheduledAt: string;
}

export interface RotationSlot {
  /** A placement id, or for a planned unit not yet written, any key unique in the walk. */
  id: string;
  scheduledAt: string;
  airDate: string;
  lineFlightId: string | null;
  /** The schedule line the slot belongs to; absent only for a fixed slot the walk never re-assigns. */
  lineId?: string | null;
  /** The message the slot carries now; null for a unit still to be assigned. */
  copyId: string | null;
  /** Aired, frozen, or overridden: never changed, still advances the cycle. */
  fixed: boolean;
  /** Seconds the slot can hold — the break's remaining room plus this slot's own current duration. */
  roomSeconds: number;
  /** The break is in automated hours (lib/log/automated-hours.ts): DAD plays it. */
  automated?: boolean;
}

export interface RotationChange {
  id: string;
  copyId: string;
}

/** The contract's messages in rotation order — the order the Copy tab lists them. */
export function cycleOrder(copies: RotationCopy[]): RotationCopy[] {
  return [...copies].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Whether a message may air in a break: in automated hours DAD plays it, so
 * it needs a DAD cut — a live read qualifies through its recorded version.
 * The SQL twin is uw_guard_placement_dad_cut().
 */
export function servesBreak(
  copy: Pick<RotationCopy, "dadCut">,
  automated: boolean | undefined,
): boolean {
  return !automated || copy.dadCut !== null;
}

/**
 * Whether a message may air on a line: copy scoped to a line serves only
 * that line, and a line that has copy of its own takes only that copy —
 * End of Line Cafe's order gives #1 to Carpool and #2 to Total Program
 * Rotation, so neither rotates into the other. `copies` is every message
 * linked to the contract. The SQL twin is uw_copy_serves_line().
 */
export function servesLine(
  copy: Pick<RotationCopy, "lineId">,
  lineId: string | null | undefined,
  copies: Pick<RotationCopy, "lineId">[],
): boolean {
  if (copy.lineId != null) return copy.lineId === lineId;
  return lineId == null || !copies.some((other) => other.lineId != null && other.lineId === lineId);
}

export function eligibleFor(
  copy: RotationCopy,
  slot: Pick<RotationSlot, "airDate" | "lineFlightId" | "lineId" | "roomSeconds" | "automated">,
  copies: RotationCopy[] = [copy],
): boolean {
  if (copy.approvalStatus !== "approved") return false;
  if (copy.durationSeconds == null || copy.durationSeconds > slot.roomSeconds) return false;
  if (copy.effectiveFrom > slot.airDate) return false;
  if (copy.effectiveTo != null && copy.effectiveTo < slot.airDate) return false;
  if (copy.flightId != null && copy.flightId !== slot.lineFlightId) return false;
  if (!servesLine(copy, slot.lineId, copies)) return false;
  if (!servesBreak(copy, slot.automated)) return false;
  return true;
}

/**
 * The message a slot should carry given the one aired just before it: the
 * first eligible message after `previousCopyId` in the cycle, wrapping.
 * No previous message, or one no longer linked, starts from the top. When
 * the slot right after this one is fixed (`avoidCopyId`, its message),
 * a different eligible message is preferred so the two never run back to
 * back where the cycle offers a choice; with only one eligible message
 * there is no choice to make.
 */
export function nextInRotation(
  copies: RotationCopy[],
  previousCopyId: string | null,
  slot: Pick<RotationSlot, "airDate" | "lineFlightId" | "lineId" | "roomSeconds" | "automated">,
  avoidCopyId: string | null = null,
  history: RotationHistoryEntry[] = [],
): RotationCopy | null {
  const cycle = cycleOrder(copies);
  if (cycle.length === 0) return null;
  const previousIndex =
    previousCopyId === null ? -1 : cycle.findIndex((copy) => copy.id === previousCopyId);
  const eligible: RotationCopy[] = [];
  for (let step = 1; step <= cycle.length; step++) {
    const copy = cycle[(previousIndex + step) % cycle.length]!;
    if (eligibleFor(copy, slot, cycle)) eligible.push(copy);
  }
  if (eligible.length === 0) return null;
  const weighted = !allEqualWeights(eligible);
  const ranked = weighted ? rankByOwed(eligible, history) : eligible;
  // Repeating the previous message is worse than matching the fixed one
  // after it, so the alternative must differ from both. Unequal weights are
  // the exception: a 2:1 ratio can't be kept without the heavier message
  // sometimes airing twice running, so only the fixed neighbour is avoided.
  return (
    ranked.find((copy) => copy.id !== avoidCopyId && (weighted || copy.id !== previousCopyId)) ??
    ranked[0]!
  );
}

/** The most a link's weight can be — a ratio past this is a different kind of order. */
export const MAX_ROTATION_WEIGHT = 20;

/**
 * A message's share of its rotation group: its weight over the total of the
 * group's approved messages (the ones that actually rotate). Null when it
 * isn't approved or is alone in its group, and — `uneven` — whether the
 * group's weights differ at all, so a screen can stay quiet for the usual
 * equal rotation. Group membership is rotationGroup()'s: a message
 * dedicated to a line rotates with that line's others, the rest together.
 */
export function weightShare(
  copyId: string,
  links: Pick<RotationCopy, "id" | "lineId" | "weight" | "approvalStatus">[],
): { weight: number; total: number; uneven: boolean } | null {
  const self = links.find((link) => link.id === copyId);
  if (!self || self.approvalStatus !== "approved") return null;
  const group = links.filter(
    (link) => link.approvalStatus === "approved" && (link.lineId ?? null) === (self.lineId ?? null),
  );
  if (group.length < 2) return null;
  const weights = group.map(weightOf);
  return {
    weight: weightOf(self),
    total: weights.reduce((sum, weight) => sum + weight, 0),
    uneven: weights.some((weight) => weight !== weights[0]),
  };
}

/** A link's weight as a usable positive integer; anything else counts as 1. */
export function weightOf(copy: Pick<RotationCopy, "weight">): number {
  const weight = copy.weight;
  return weight !== undefined && Number.isInteger(weight) && weight >= 1 ? weight : 1;
}

/**
 * Orders the eligible messages (already in cycle order after the previous
 * one) by how much each is owed, most first; equal weights leave the cycle
 * order untouched. Shares are counted over the airings since the latest
 * effective date among the eligible messages.
 */
function allEqualWeights(copies: RotationCopy[]): boolean {
  return copies.every((copy) => weightOf(copy) === weightOf(copies[0]!));
}

function rankByOwed(eligible: RotationCopy[], history: RotationHistoryEntry[]): RotationCopy[] {
  const weights = eligible.map(weightOf);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const aired = history.filter(
    (entry): entry is RotationHistoryEntry & { copyId: string } => entry.copyId !== null,
  );
  // One window for the whole comparison — since the latest start among the
  // eligible messages — so a message that begins mid-run neither bursts nor
  // is held back by airings it was never eligible for.
  const since = eligible.reduce(
    (latest, copy) => (copy.effectiveFrom > latest ? copy.effectiveFrom : latest),
    "",
  );
  const window = aired.filter((entry) => entry.scheduledAt >= since);
  const owed = new Map(
    eligible.map((copy, index) => {
      const used = window.filter((entry) => entry.copyId === copy.id).length;
      return [copy.id, (weights[index]! / total) * (window.length + 1) - used] as const;
    }),
  );
  return [...eligible].sort((a, b) => {
    const gap = owed.get(b.id)! - owed.get(a.id)!;
    return Math.abs(gap) < 1e-9 ? 0 : gap;
  });
}

/**
 * Walks the timeline in air order and returns only the slots whose message
 * should change. Fixed slots are never in the result; an unfixed slot with
 * no eligible message keeps what it has (never cleared here).
 */
/**
 * Which cycle a slot belongs to. A line with dedicated copy rotates its own
 * messages; every other line shares the contract's general cycle, which a
 * dedicated message never interrupts (Phil Hall 2022–23: Copy 1–4 keep
 * their order around the Carpool message). A slot without a line — an
 * existing entry the planner only knows by time and message — is placed by
 * its message.
 */
export function rotationGroup(
  slot: { lineId?: string | null; copyId?: string | null },
  copies: Pick<RotationCopy, "id" | "lineId">[],
): string {
  if (slot.lineId != null) {
    return copies.some((copy) => copy.lineId === slot.lineId) ? `line:${slot.lineId}` : "general";
  }
  const copy = copies.find((entry) => entry.id === slot.copyId);
  return copy?.lineId ? `line:${copy.lineId}` : "general";
}

/** The message that aired most recently before `beforeISO` in the same cycle as `lineId` — what a "next in rotation" default starts from. */
export function previousInGroup(
  entries: { scheduledAt: string; copyId: string | null; lineId?: string | null }[],
  lineId: string | null | undefined,
  copies: Pick<RotationCopy, "id" | "lineId">[],
  beforeISO?: string,
): string | null {
  const group = rotationGroup({ lineId }, copies);
  const before = entries
    .filter((entry) => beforeISO === undefined || entry.scheduledAt < beforeISO)
    .filter((entry) => rotationGroup(entry, copies) === group)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return before.length > 0 ? (before[before.length - 1]!.copyId ?? null) : null;
}

/**
 * Every airing before `beforeISO` in the same cycle as `lineId`, in air
 * order — the weighted pick's record of what each message has had.
 */
export function historyInGroup(
  entries: { scheduledAt: string; copyId: string | null; lineId?: string | null }[],
  lineId: string | null | undefined,
  copies: Pick<RotationCopy, "id" | "lineId">[],
  beforeISO?: string,
): RotationHistoryEntry[] {
  const group = rotationGroup({ lineId }, copies);
  return entries
    .filter((entry) => beforeISO === undefined || entry.scheduledAt < beforeISO)
    .filter((entry) => rotationGroup(entry, copies) === group)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((entry) => ({ copyId: entry.copyId, scheduledAt: entry.scheduledAt }));
}

export function walkRotation(copies: RotationCopy[], slots: RotationSlot[]): RotationChange[] {
  const ordered = [...slots].sort(
    (a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id),
  );
  const groups = ordered.map((slot) => rotationGroup(slot, copies));
  // For each slot, the message of the nearest fixed slot after it in the
  // same cycle — the one thing the walk cannot re-sequence around.
  const nextFixedCopy: (string | null)[] = new Array(ordered.length).fill(null);
  const upcoming = new Map<string, string | null>();
  for (let index = ordered.length - 1; index >= 0; index--) {
    const group = groups[index]!;
    nextFixedCopy[index] = upcoming.get(group) ?? null;
    const slot = ordered[index]!;
    if (slot.fixed) upcoming.set(group, slot.copyId);
  }

  const changes: RotationChange[] = [];
  const previous = new Map<string, string | null>();
  const history = new Map<string, RotationHistoryEntry[]>();
  const record = (group: string, slot: RotationSlot, copyId: string | null) => {
    previous.set(group, copyId);
    const list = history.get(group) ?? [];
    list.push({ copyId, scheduledAt: slot.scheduledAt });
    history.set(group, list);
  };
  ordered.forEach((slot, index) => {
    const group = groups[index]!;
    if (slot.fixed) {
      record(group, slot, slot.copyId);
      return;
    }
    const pick = nextInRotation(
      copies,
      previous.get(group) ?? null,
      slot,
      nextFixedCopy[index] ?? null,
      history.get(group) ?? [],
    );
    if (pick === null) {
      record(group, slot, slot.copyId);
      return;
    }
    if (pick.id !== slot.copyId) changes.push({ id: slot.id, copyId: pick.id });
    record(group, slot, pick.id);
  });
  return changes;
}

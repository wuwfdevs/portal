// A message's DAD cut (uw_copy.dad_cut): the cut DAD plays for it — the
// recorded spot, or a live read's recorded version in automated hours.
// Two shapes, both in the format RadioTraffic's ENCO export wrote:
//   * NNNNNA — assigned by the Portal (uw_dad_cut_seq, never reused);
//   * NNNNN  — an existing spot already in DAD's library, picked by staff.
// The SQL check constraint on uw_copy.dad_cut is the same pattern.

export const DAD_CUT_PATTERN = /^[0-9]{5}A?$/;

/**
 * A typed cut in its stored shape: trimmed, upper-cased, and a bare number
 * of up to five digits padded to five ("65" → "00065", "13a" → "00013A").
 * Returns null for anything that can't be a cut.
 */
export function normalizeDadCut(input: string | null | undefined): string | null {
  const trimmed = (input ?? "").trim().toUpperCase();
  const match = /^([0-9]{1,5})(A?)$/.exec(trimmed);
  if (!match) return null;
  return match[1]!.padStart(5, "0") + match[2]!;
}

/** True for a cut the Portal assigned (NNNNNA), false for an existing DAD spot (NNNNN). */
export function isPortalAssignedCut(cut: string): boolean {
  return cut.endsWith("A");
}

/**
 * The spot number a play instruction names ("Please play the # 2 spot…",
 * "Please the play \"TLC spot 34\"…"), so the existing-spot picker can rank
 * that spot first. Null when the script names none.
 */
export function spotNumberFromScript(script: string | null | undefined): number | null {
  const text = script ?? "";
  const match = /#\s*(\d{1,3})\b/.exec(text) ?? /\bspot\s+#?\s*(\d{1,3})\b/i.exec(text);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

/**
 * Whether DAD has a recording under this copy's cut: an existing DAD spot
 * always does; a Portal cut does once production marks it recorded
 * (uw_copy.dad_recorded_at, cleared when the cut or the script changes).
 */
export function isRecordedInDad(copy: {
  dad_cut: string | null;
  dad_recorded_at: string | null;
}): boolean {
  if (copy.dad_cut === null) return false;
  return !isPortalAssignedCut(copy.dad_cut) || copy.dad_recorded_at !== null;
}

/**
 * The To record list: a Portal cut not yet recorded, on copy that can still
 * air — a draft or approved message whose dates haven't ended.
 */
export function needsRecording(
  copy: {
    dad_cut: string | null;
    dad_recorded_at: string | null;
    approval_status: string;
    effective_to: string | null;
  },
  todayISO: string,
): boolean {
  if (copy.dad_cut === null || !isPortalAssignedCut(copy.dad_cut)) return false;
  if (copy.dad_recorded_at !== null) return false;
  if (copy.approval_status !== "draft" && copy.approval_status !== "approved") return false;
  return copy.effective_to === null || copy.effective_to >= todayISO;
}

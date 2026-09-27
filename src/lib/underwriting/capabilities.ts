// Underwriting & Traffic's capability layer (docs/agent-capabilities-design.md
// §4). One entry so far: underwriting.credit.schedule, exactly as named in
// docs/underwriting-design.md's "Fit with portal conventions". It only ever
// calls placeCredit() without an override reason — the override path
// (expired/unapproved copy, manager-checked) stays UI-only, the same
// judgment-call carve-out lib/roadmap/capabilities.ts already applies to
// curation: bypassing a compliance rule is "a judgment call meant to be
// made by a person on the screen," not delegated to an agent even behind
// this repo's confirmation-required gate. The message is the contract's
// rotation's pick unless the caller names one (docs/underwriting-traffic-
// redesign.md §13), and the contract re-sequences afterwards either way.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertUnderwritingAccess } from "./access";
import { placeCredit } from "./placement";
import { getScheduleLine } from "./queries";
import { rebalanceContractRotation, resolveCopyForBreak } from "./rotation-rebalance";

export type ScheduleCreditResult =
  { ok: true; placementId: string } | { ok: false; message: string };

export const scheduleCredit = defineCapability({
  id: "underwriting.credit.schedule",
  summary:
    "Place a credit for a contract schedule line into an open, eligible Log rundown break. Browse the schedule line's contract page first to find eligible breaks. Leave copyId out to let the contract's copy rotation choose the message (the normal case); name one only when the order calls for a specific message there. This only succeeds for already-approved, in-date copy; an expired or unapproved override is a manager-only action done from the contract's own screen.",
  input: z.object({
    breakId: z.string(),
    scheduleLineId: z.string(),
    copyId: z.string().optional(),
  }),
  requires: { tool: "underwriting" },
  confirmation: "required",
  async handler(_ctx, input): Promise<ScheduleCreditResult> {
    const { profile } = await assertUnderwritingAccess();
    const copyId = await resolveCopyForBreak(
      input.scheduleLineId,
      input.breakId,
      input.copyId ?? null,
    );
    if (!copyId)
      return {
        ok: false,
        message:
          "No linked message is approved, in date, and short enough for that break — approve or link one on the contract's Copy tab first.",
      };
    const result = await placeCredit({ ...input, copyId });
    if (!result.ok) return result;
    const line = await getScheduleLine(input.scheduleLineId);
    if (line) await rebalanceContractRotation(line.contract_id, profile.id);
    return { ok: true, placementId: result.placementId };
  },
});

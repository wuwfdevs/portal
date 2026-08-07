// Underwriting & Traffic's capability layer (docs/agent-capabilities-design.md
// §4). One entry so far: underwriting.credit.schedule, exactly as named in
// docs/underwriting-design.md's "Fit with portal conventions". It only ever
// calls placeCredit() without an override reason — the override path
// (expired/unapproved copy, manager-checked) stays UI-only, the same
// judgment-call carve-out lib/roadmap/capabilities.ts already applies to
// curation: bypassing a compliance rule is "a judgment call meant to be
// made by a person on the screen," not delegated to an agent even behind
// this repo's confirmation-required gate.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertUnderwritingAccess } from "./access";
import { placeCredit } from "./placement";

export type ScheduleCreditResult = { ok: true; placementId: string } | { ok: false; message: string };

export const scheduleCredit = defineCapability({
  id: "underwriting.credit.schedule",
  summary:
    "Place a contract schedule line's copy into an open, eligible Log rundown break. Browse the schedule line's contract page first to find eligible breaks and linked copy — this only succeeds for already-approved, in-date copy; an expired or unapproved override is a manager-only action done from the contract's own screen.",
  input: z.object({
    breakId: z.string(),
    scheduleLineId: z.string(),
    copyId: z.string(),
  }),
  requires: { tool: "underwriting" },
  confirmation: "required",
  async handler(_ctx, input): Promise<ScheduleCreditResult> {
    await assertUnderwritingAccess();
    const result = await placeCredit(input);
    if (!result.ok) return result;
    return { ok: true, placementId: result.placementId };
  },
});

"use server";

import { redirect } from "next/navigation";
import { failWith } from "@/lib/editorial/action-result";
import { listPitchFormFields } from "@/lib/editorial/data";
import { invokeCapability } from "@/lib/capabilities/registry";
import {
  archivePitch as archivePitchCapability,
  archiveSelectedPitches as archiveSelectedPitchesCapability,
  savePitch as savePitchCapability,
  unarchivePitch as unarchivePitchCapability,
} from "@/lib/editorial/capabilities";
import type { EpFieldValue } from "@/lib/database.types";

export type PitchFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string | null;
      fieldErrors: Record<string, string>;
      title: string;
      values: Record<string, EpFieldValue>;
    };

/**
 * Create or update a pitch (update when pitch_id is present). Thin adapter
 * over the editorial.pitch.save capability: parses FormData, calls it, maps
 * the typed result back to the form state / redirect this screen expects.
 */
export async function savePitch(
  _prev: PitchFormState,
  formData: FormData,
): Promise<PitchFormState> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const fields = await listPitchFormFields();

  const raw: Record<string, EpFieldValue> = {};
  for (const field of fields) {
    raw[field.key] =
      field.field_type === "multi_select"
        ? formData.getAll(`field_${field.key}`).map(String)
        : String(formData.get(`field_${field.key}`) ?? "");
  }

  const result = await invokeCapability(savePitchCapability, {
    pitchId: pitchId || undefined,
    title,
    fieldValues: raw,
  });

  if (!result.ok) {
    if (result.kind === "invalid") {
      return {
        status: "error",
        message: null,
        fieldErrors: result.fieldErrors,
        title,
        values: raw,
      };
    }
    return { status: "error", message: result.message, fieldErrors: {}, title, values: raw };
  }

  redirect(`/editorial/pitches/${result.pitchId}`);
}

export async function archivePitch(formData: FormData): Promise<void> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  const pitchPath = `/editorial/pitches/${pitchId}`;
  const reason = String(formData.get("reason") ?? "").trim() || undefined;

  const result = await invokeCapability(
    archivePitchCapability,
    { pitchId, reason },
    { confirmed: true },
  );
  if (!result.ok) failWith(pitchPath, result.message);

  redirect(pitchPath);
}

export async function unarchivePitch(formData: FormData): Promise<void> {
  const pitchId = String(formData.get("pitch_id") ?? "");
  const pitchPath = `/editorial/pitches/${pitchId}`;

  const result = await invokeCapability(unarchivePitchCapability, { pitchId }, { confirmed: true });
  if (!result.ok) failWith(pitchPath, result.message);

  redirect(pitchPath);
}

/** Bulk archive from the backlog's stale view. */
export async function archiveSelectedPitches(formData: FormData): Promise<void> {
  const pitchIds = formData.getAll("pitch_id").map(String).filter(Boolean);
  if (pitchIds.length === 0) redirect("/editorial?view=stale");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;

  const result = await invokeCapability(
    archiveSelectedPitchesCapability,
    { pitchIds, reason },
    { confirmed: true },
  );
  if (!result.ok) failWith("/editorial?view=stale", result.message);

  redirect("/editorial?view=stale");
}

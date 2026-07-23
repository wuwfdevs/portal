"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertEditorialRole } from "@/lib/editorial/access";
import { listFormFields } from "@/lib/editorial/data";
import { validatePitchValues } from "@/lib/editorial/form";
import { logAuditEvent } from "@/lib/audit";
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
 * Create or update a pitch (update when pitch_id is present). Submitter edit
 * rights (own pitch, still open, not on an active slate) are enforced by RLS;
 * the app-side check exists to fail with a readable message instead of a
 * silent no-op write.
 */
export async function savePitch(
  _prev: PitchFormState,
  formData: FormData,
): Promise<PitchFormState> {
  const { profile, role } = await assertEditorialRole("contributor");
  const supabase = await createClient();

  const pitchId = String(formData.get("pitch_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const fields = await listFormFields({ activeOnly: true });

  const raw: Record<string, EpFieldValue> = {};
  for (const field of fields) {
    raw[field.key] =
      field.field_type === "multi_select"
        ? formData.getAll(`field_${field.key}`).map(String)
        : String(formData.get(`field_${field.key}`) ?? "");
  }

  const { values, errors } = validatePitchValues(fields, raw);
  if (!title) errors.title = "Give the pitch a title.";
  if (Object.keys(errors).length > 0) {
    return { status: "error", message: null, fieldErrors: errors, title, values: raw };
  }

  const errorState = (message: string): PitchFormState => ({
    status: "error",
    message,
    fieldErrors: {},
    title,
    values: raw,
  });

  if (pitchId) {
    const { data: pitch } = await supabase
      .from("ep_pitches")
      .select("id, submitted_by, status")
      .eq("id", pitchId)
      .maybeSingle();
    if (!pitch) return errorState("This pitch no longer exists.");
    const isOwn = pitch.submitted_by === profile.id;
    if (!isOwn && role !== "editor") return errorState("You can only edit your own pitches.");
    if (pitch.status !== "open" && role !== "editor") {
      return errorState("This pitch has been decided and can no longer be edited.");
    }

    const { error: updateError } = await supabase
      .from("ep_pitches")
      .update({ title })
      .eq("id", pitchId);
    if (updateError)
      return errorState("Could not save the pitch — it may be under review right now.");

    await supabase.from("ep_pitch_values").delete().eq("pitch_id", pitchId);
    if (values.length > 0) {
      await supabase
        .from("ep_pitch_values")
        .insert(
          values.map(({ fieldId, value }) => ({ pitch_id: pitchId, field_id: fieldId, value })),
        );
    }
    redirect(`/editorial/pitches/${pitchId}`);
  }

  const { data: created, error: insertError } = await supabase
    .from("ep_pitches")
    .insert({ title, submitted_by: profile.id })
    .select("id")
    .single();
  if (insertError || !created) return errorState("Could not submit the pitch. Try again.");

  if (values.length > 0) {
    await supabase
      .from("ep_pitch_values")
      .insert(
        values.map(({ fieldId, value }) => ({ pitch_id: created.id, field_id: fieldId, value })),
      );
  }
  redirect(`/editorial/pitches/${created.id}`);
}

export async function archivePitch(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const pitchId = String(formData.get("pitch_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const supabase = await createClient();
  await supabase
    .from("ep_pitches")
    .update({
      status: "archived",
      archived_reason: reason,
      archived_by: editor.profile.id,
      archived_at: new Date().toISOString(),
    })
    .eq("id", pitchId)
    .eq("status", "open");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.pitch.archived",
    targetType: "ep_pitch",
    targetId: pitchId,
    metadata: reason ? { reason } : {},
  });

  redirect(`/editorial/pitches/${pitchId}`);
}

export async function unarchivePitch(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const pitchId = String(formData.get("pitch_id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("ep_pitches")
    .update({ status: "open", archived_reason: null, archived_by: null, archived_at: null })
    .eq("id", pitchId)
    .eq("status", "archived");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.pitch.reopened",
    targetType: "ep_pitch",
    targetId: pitchId,
  });

  redirect(`/editorial/pitches/${pitchId}`);
}

/** Bulk archive from the backlog's stale view. */
export async function archiveSelectedPitches(formData: FormData): Promise<void> {
  const editor = await assertEditorialRole("editor");
  const pitchIds = formData.getAll("pitch_id").map(String).filter(Boolean);
  if (pitchIds.length === 0) redirect("/editorial?view=stale");
  const reason = String(formData.get("reason") ?? "").trim() || "Archived in a backlog review.";

  const supabase = await createClient();
  await supabase
    .from("ep_pitches")
    .update({
      status: "archived",
      archived_reason: reason,
      archived_by: editor.profile.id,
      archived_at: new Date().toISOString(),
    })
    .in("id", pitchIds)
    .eq("status", "open");

  await logAuditEvent({
    actorId: editor.profile.id,
    action: "ep.pitch.bulk_archived",
    targetType: "ep_pitch",
    metadata: { pitch_ids: pitchIds, reason },
  });

  redirect("/editorial?view=stale");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkEditor } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { failWith } from "@/lib/editorial/action-result";
import { field } from "@/lib/form-fields";
import { logAuditEvent } from "@/lib/audit";
import {
  FORMAT_NOTE_MAX,
  blankSpec,
  readFormatSpec,
  validateFormatName,
  validateFormatSpec,
} from "@/lib/sourcework/piece-formats";
import { uuidParam } from "@/lib/sourcework/route-input";

// Maintaining piece formats (docs/sourcework-analysis-design.md §6.3, §8). Editors only:
// private.is_sourcework_editor() is the boundary in the format tables' policies, this is the
// courtesy in front of it. Publishing and rolling back change what every reporter's next
// draft follows, so both are audited, as the prompts are.

const FORMATS_PATH = "/sourcework/editors/formats";

function formatPath(formatId: string): string {
  return `${FORMATS_PATH}?format=${formatId}`;
}

function revalidateFormats() {
  revalidatePath(FORMATS_PATH);
}

/** "+ New format": a named format with no version yet, and the editor's draft started from a blank shape. */
export async function createFormat(formData: FormData) {
  const { profile } = await assertSourceworkEditor();
  const name = validateFormatName(field(formData, "name"));
  if (!name.ok) failWith(`${FORMATS_PATH}?new=1`, name.error);

  const supabase = await createClient();
  const { data: last, error: lastError } = await supabase
    .from("sw_piece_formats")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Only the list order depends on it; a failed read puts the new format first.
  if (lastError) console.error("Could not read the formats' order:", lastError);
  const { data, error } = await supabase
    .from("sw_piece_formats")
    .insert({ name: name.name, created_by: profile.id, position: (last?.position ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Could not create a piece format:", error);
    failWith(
      `${FORMATS_PATH}?new=1`,
      error?.code === "23505"
        ? "There is already a format with that name."
        : "Could not create the format. Try again.",
    );
  }
  const draft = await supabase
    .from("sw_piece_format_drafts")
    .insert({ format_id: data.id, user_id: profile.id, spec: blankSpec() as never });
  if (draft.error) console.error("Could not start a new format's draft:", draft.error);
  revalidateFormats();
  redirect(formatPath(data.id));
}

export async function renameFormat(input: {
  formatId: string;
  name: string;
}): Promise<ActionResult> {
  await assertSourceworkEditor();
  const formatId = uuidParam(input.formatId);
  const name = validateFormatName(input.name);
  if (!formatId) return actionError("That format doesn't exist.");
  if (!name.ok) return actionError(name.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_piece_formats")
    .update({ name: name.name })
    .eq("id", formatId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Could not rename a piece format:", error);
    return actionError(
      error.code === "23505" ? "There is already a format with that name." : "Couldn't rename it.",
    );
  }
  if (!data) return actionError("That format doesn't exist.");
  revalidateFormats();
  return actionOk();
}

/** Autosave. Holds whatever is typed; the format is checked when it is tried or published. */
export async function saveFormatDraft(input: {
  formatId: string;
  spec: unknown;
}): Promise<ActionResult<{ savedAt: string }>> {
  const { profile } = await assertSourceworkEditor();
  const formatId = uuidParam(input.formatId);
  const spec = readFormatSpec(input.spec);
  if (!formatId || !spec) return actionError("Couldn't save the draft.");
  if (JSON.stringify(spec).length > 40_000) return actionError("This format is too long to save.");

  const savedAt = new Date().toISOString();
  const supabase = await createClient();
  const saved = await supabase.from("sw_piece_format_drafts").upsert({
    format_id: formatId,
    user_id: profile.id,
    spec: spec as never,
    updated_at: savedAt,
  });
  if (saved.error) {
    console.error("Could not save a format draft:", saved.error);
    return actionError("Couldn't save the draft. Try again.");
  }
  return actionOk({ savedAt });
}

/** Throws the draft away, so the editor starts again from the live version. */
export async function discardFormatDraft(input: { formatId: string }): Promise<ActionResult> {
  const { profile } = await assertSourceworkEditor();
  const formatId = uuidParam(input.formatId);
  if (!formatId) return actionError("That format doesn't exist.");
  const supabase = await createClient();
  const removed = await supabase
    .from("sw_piece_format_drafts")
    .delete()
    .eq("format_id", formatId)
    .eq("user_id", profile.id);
  if (removed.error) {
    console.error("Could not discard a format draft:", removed.error);
    return actionError("Couldn't discard the draft. Try again.");
  }
  revalidateFormats();
  return actionOk();
}

/** Saves the spec as the format's next version and makes it live. The note says what changed. */
export async function publishFormat(input: {
  formatId: string;
  spec: unknown;
  note: string;
}): Promise<ActionResult<{ version: number }>> {
  const { profile } = await assertSourceworkEditor();
  const formatId = uuidParam(input.formatId);
  const raw = readFormatSpec(input.spec);
  if (!formatId || !raw) return actionError("That format can't be published.");
  const checked = validateFormatSpec(raw);
  if (!checked.ok) return actionError(checked.error);
  const note = input.note.trim();
  if (note.length > FORMAT_NOTE_MAX) {
    return actionError(`Keep the note under ${FORMAT_NOTE_MAX} characters.`);
  }

  const supabase = await createClient();
  const published = await supabase.rpc("sw_publish_piece_format", {
    p_format_id: formatId,
    p_spec: checked.spec as never,
    p_note: note === "" ? null : note,
  });
  if (published.error || typeof published.data !== "number") {
    console.error("Could not publish a piece format:", published.error);
    return actionError("Couldn't publish the format. Try again.");
  }

  const cleared = await supabase
    .from("sw_piece_format_drafts")
    .delete()
    .eq("format_id", formatId)
    .eq("user_id", profile.id);
  if (cleared.error) console.error("Could not clear a published format draft:", cleared.error);

  await logAuditEvent({
    actorId: profile.id,
    action: "sourcework.piece_format.published",
    targetType: "piece_format",
    targetId: formatId,
    metadata: { version: published.data, note: note || null },
  });
  revalidateFormats();
  return actionOk({ version: published.data });
}

/** Makes an earlier version live again. History is kept: rollback moves the pointer. */
export async function makeFormatVersionLive(input: {
  formatId: string;
  versionId: string;
}): Promise<ActionResult> {
  const { profile } = await assertSourceworkEditor();
  const formatId = uuidParam(input.formatId);
  const versionId = uuidParam(input.versionId);
  if (!formatId || !versionId) return actionError("That version doesn't exist.");

  const supabase = await createClient();
  const current = await supabase
    .from("sw_piece_formats")
    .select("live_version_id")
    .eq("id", formatId)
    .maybeSingle();
  if (current.error || !current.data) return actionError("That format doesn't exist.");
  if (current.data.live_version_id === versionId) return actionOk();

  const version = await supabase
    .from("sw_piece_format_versions")
    .select("id, version")
    .eq("id", versionId)
    .eq("format_id", formatId)
    .maybeSingle();
  if (version.error || !version.data) return actionError("That version doesn't exist.");

  const moved = await supabase
    .from("sw_piece_formats")
    .update({
      live_version_id: version.data.id,
      live_moved_by: profile.id,
      live_moved_at: new Date().toISOString(),
    })
    .eq("id", formatId)
    .select("id")
    .maybeSingle();
  if (moved.error || !moved.data) {
    console.error("Could not move a format's live version:", moved.error);
    return actionError("Couldn't change the live version. Try again.");
  }

  await logAuditEvent({
    actorId: profile.id,
    action: "sourcework.piece_format.made_live",
    targetType: "piece_format",
    targetId: formatId,
    metadata: { version: version.data.version },
  });
  revalidateFormats();
  return actionOk();
}

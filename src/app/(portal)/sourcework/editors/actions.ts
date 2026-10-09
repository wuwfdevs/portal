"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkEditor } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { logAuditEvent } from "@/lib/audit";
import {
  PROMPT_BODY_MAX,
  promptSlotDefinition,
  validatePromptBody,
  validatePublishNote,
} from "@/lib/sourcework/prompts";
import { uuidParam } from "@/lib/sourcework/route-input";

// Maintaining the research prompts (docs/sourcework-analysis-design.md §8).
// Editors only: private.is_sourcework_editor() is the boundary in the prompt
// tables' policies, this is the courtesy in front of it. Publishing and rolling
// back change what every project's next run says, so both are audited.

function revalidateEditors() {
  revalidatePath("/sourcework/editors");
}

/** Autosave. Holds whatever is typed, valid or not; the text is checked when it is tried or published. */
export async function savePromptDraft(input: {
  slot: string;
  body: string;
}): Promise<ActionResult<{ savedAt: string }>> {
  const { profile } = await assertSourceworkEditor();
  const definition = promptSlotDefinition(input.slot);
  if (!definition) return actionError("That prompt doesn't exist.");
  if (typeof input.body !== "string" || input.body.length > PROMPT_BODY_MAX) {
    return actionError(`A prompt can be at most ${PROMPT_BODY_MAX.toLocaleString("en-US")} characters.`);
  }

  const savedAt = new Date().toISOString();
  const supabase = await createClient();
  const saved = await supabase
    .from("sw_prompt_drafts")
    .upsert({ slot: definition.slot, user_id: profile.id, body: input.body, updated_at: savedAt });
  if (saved.error) {
    console.error("Could not save a prompt draft:", saved.error);
    return actionError("Couldn't save the draft. Try again.");
  }
  return actionOk({ savedAt });
}

/** Throws the draft away, so the editor starts again from the live text. */
export async function discardPromptDraft(input: { slot: string }): Promise<ActionResult> {
  const { profile } = await assertSourceworkEditor();
  const definition = promptSlotDefinition(input.slot);
  if (!definition) return actionError("That prompt doesn't exist.");

  const supabase = await createClient();
  // Idempotent on purpose: discarding a draft that isn't there is still "no draft".
  const removed = await supabase
    .from("sw_prompt_drafts")
    .delete()
    .eq("slot", definition.slot)
    .eq("user_id", profile.id);
  if (removed.error) {
    console.error("Could not discard a prompt draft:", removed.error);
    return actionError("Couldn't discard the draft. Try again.");
  }
  revalidateEditors();
  return actionOk();
}

/** Saves the text as the slot's next version and makes it live. The note says what changed. */
export async function publishPrompt(input: {
  slot: string;
  body: string;
  note: string;
}): Promise<ActionResult<{ version: number }>> {
  const { profile } = await assertSourceworkEditor();
  const definition = promptSlotDefinition(input.slot);
  if (!definition) return actionError("That prompt doesn't exist.");
  const body = validatePromptBody(definition.slot, input.body);
  if (!body.ok) return actionError(body.error);
  const note = validatePublishNote(input.note);
  if (!note.ok) return actionError(note.error);

  const supabase = await createClient();
  const published = await supabase.rpc("sw_publish_prompt", {
    p_slot: definition.slot,
    p_body: body.body,
    p_note: note.note === "" ? null : note.note,
  });
  if (published.error || typeof published.data !== "number") {
    console.error("Could not publish a prompt:", published.error);
    return actionError("Couldn't publish the prompt. Try again.");
  }

  // The draft has become the live text; the editor starts the next change from it.
  const cleared = await supabase
    .from("sw_prompt_drafts")
    .delete()
    .eq("slot", definition.slot)
    .eq("user_id", profile.id);
  if (cleared.error) console.error("Could not clear a published prompt draft:", cleared.error);

  await logAuditEvent({
    actorId: profile.id,
    action: "sourcework.prompt.published",
    targetType: "prompt",
    targetId: definition.slot,
    metadata: { slot: definition.slot, version: published.data, note: note.note || null },
  });
  revalidateEditors();
  return actionOk({ version: published.data });
}

/** Makes an earlier version live again. History is kept: rollback moves the pointer. */
export async function makeVersionLive(input: {
  slot: string;
  versionId: string;
}): Promise<ActionResult> {
  const { profile } = await assertSourceworkEditor();
  const definition = promptSlotDefinition(input.slot);
  const versionId = uuidParam(input.versionId);
  if (!definition || !versionId) return actionError("That version doesn't exist.");

  const supabase = await createClient();
  const current = await supabase
    .from("sw_prompt_live")
    .select("version_id")
    .eq("slot", definition.slot)
    .maybeSingle();
  if (current.error) {
    console.error("Could not read the live prompt:", current.error);
    return actionError("Couldn't change the live version. Try again.");
  }
  // A transition, not a click: choosing what is already live changes nothing and isn't audited.
  if (current.data?.version_id === versionId) return actionOk();

  const version = await supabase
    .from("sw_prompt_versions")
    .select("id, version")
    .eq("id", versionId)
    .eq("slot", definition.slot)
    .maybeSingle();
  if (version.error || !version.data) return actionError("That version doesn't exist.");

  const moved = await supabase.from("sw_prompt_live").upsert({
    slot: definition.slot,
    version_id: version.data.id,
    moved_by: profile.id,
    moved_at: new Date().toISOString(),
  });
  if (moved.error) {
    console.error("Could not move the live prompt:", moved.error);
    return actionError("Couldn't change the live version. Try again.");
  }

  await logAuditEvent({
    actorId: profile.id,
    action: "sourcework.prompt.made_live",
    targetType: "prompt",
    targetId: definition.slot,
    metadata: { slot: definition.slot, version: version.data.version },
  });
  revalidateEditors();
  return actionOk();
}

"use server";

// The DAD library import's two Server Actions: parse the station's two DAD
// exports (Library -> Generate Reports -> "Standard Library", and its
// companion Groups report) into a plan (nothing written), and execute a
// confirmed plan. Same non-redirecting, plan-round-trips-as-JSON shape as
// the program-log importer's import-actions.ts, for the same reason: the
// preview/confirm screen needs the plan back to render and re-submit
// verbatim, and every write here still goes through ordinary RLS.

import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { logAuditEvent } from "@/lib/audit";
import { parseDadGroups, parseDadLibrary } from "@/lib/log/dad-library-import";
import { buildDadLibraryPlan, type DadLibraryPlan, type SynthesizedPromoPlan } from "@/lib/log/dad-library-plan";
import { listContentItems, listPrograms, listScheduleEntries } from "@/lib/log/queries";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ParseDadLibraryResult = { ok: true; plan: DadLibraryPlan } | { ok: false; error: string };

export async function parseDadLibraryUpload(formData: FormData): Promise<ParseDadLibraryResult> {
  await assertLogAccess();

  const libraryFile = formData.get("library_file");
  if (!(libraryFile instanceof File) || libraryFile.size === 0) {
    return { ok: false, error: 'Choose the DAD "Standard Library" export to upload.' };
  }
  if (libraryFile.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That library export is too large to be a DAD report." };
  }
  const groupsFile = formData.get("groups_file");
  if (groupsFile instanceof File && groupsFile.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That groups export is too large to be a DAD report." };
  }

  const { cuts, warnings: parseWarnings } = parseDadLibrary(await libraryFile.text());
  const groups = groupsFile instanceof File && groupsFile.size > 0 ? parseDadGroups(await groupsFile.text()) : [];

  const [programs, scheduleEntries, contentItems] = await Promise.all([
    listPrograms(),
    listScheduleEntries(),
    listContentItems(),
  ]);

  const plan = buildDadLibraryPlan({
    cuts,
    groups,
    programs: programs.map((program) => ({ id: program.id, name: program.name })),
    scheduleEntries,
    existingItems: contentItems.map((item) => ({ id: item.id, dad_cart_number: item.dad_cart_number })),
  });
  plan.warnings = [...parseWarnings, ...plan.warnings];

  return { ok: true, plan };
}

export type ExecuteDadLibraryImportResult =
  | { ok: true; itemsCreated: number; itemsUpdated: number; promosCreated: number; promosUpdated: number; failures: string[] }
  | { ok: false; error: string };

async function upsertSynthesizedPromo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  promo: SynthesizedPromoPlan,
  ownerId: string,
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const title = `${promo.programName} promo`;

  if (promo.existingItemId === null) {
    const { data: item, error: itemError } = await supabase
      .from("log_content_items")
      .insert({
        content_type: "program_promo",
        title,
        dad_cart_number: promo.representativeCutNumber,
        dad_group: promo.dadGroup,
        approval_status: "approved",
        owner_id: ownerId,
        created_by: ownerId,
      })
      .select("id")
      .single();
    if (itemError || !item) return { ok: false, error: `Could not create the ${promo.programName} promo.` };

    const { error: componentsError } = await supabase.from("log_content_components").insert([
      {
        content_item_id: item.id,
        component_type: "recorded_audio",
        sequence: 1,
        duration_seconds: promo.recordedAudioDurationSeconds,
        required: true,
        dad_cart_number: promo.representativeCutNumber,
      },
      {
        content_item_id: item.id,
        component_type: "live_outro",
        sequence: 2,
        duration_seconds: promo.tagDurationSeconds,
        // Not required: the tag is read live over the promo's own trailing
        // music bed, not appended after it, so it adds no time on top of
        // the item's own expected_duration_seconds (computeTotalDurationSeconds
        // only sums required components).
        required: false,
        script: promo.tagScript,
      },
    ]);
    if (componentsError) return { ok: false, error: `Created the ${promo.programName} promo but not its components.` };
    return { ok: true, created: true };
  }

  const { error: itemError } = await supabase
    .from("log_content_items")
    .update({
      title,
      dad_cart_number: promo.representativeCutNumber,
      dad_group: promo.dadGroup,
      approval_status: "approved",
    })
    .eq("id", promo.existingItemId);
  if (itemError) return { ok: false, error: `Could not update the ${promo.programName} promo.` };

  const { data: components, error: componentsReadError } = await supabase
    .from("log_content_components")
    .select("id, component_type")
    .eq("content_item_id", promo.existingItemId);
  if (componentsReadError) return { ok: false, error: `Could not read the ${promo.programName} promo's components.` };

  const recordedAudio = (components ?? []).find((component) => component.component_type === "recorded_audio");
  const liveOutro = (components ?? []).find((component) => component.component_type === "live_outro");

  if (recordedAudio) {
    await supabase
      .from("log_content_components")
      .update({ duration_seconds: promo.recordedAudioDurationSeconds, dad_cart_number: promo.representativeCutNumber })
      .eq("id", recordedAudio.id);
  } else {
    await supabase.from("log_content_components").insert({
      content_item_id: promo.existingItemId,
      component_type: "recorded_audio",
      sequence: 1,
      duration_seconds: promo.recordedAudioDurationSeconds,
      required: true,
      dad_cart_number: promo.representativeCutNumber,
    });
  }

  if (liveOutro) {
    await supabase
      .from("log_content_components")
      .update({ duration_seconds: promo.tagDurationSeconds, script: promo.tagScript, required: false })
      .eq("id", liveOutro.id);
  } else {
    await supabase.from("log_content_components").insert({
      content_item_id: promo.existingItemId,
      component_type: "live_outro",
      sequence: 2,
      duration_seconds: promo.tagDurationSeconds,
      required: false,
      script: promo.tagScript,
    });
  }

  return { ok: true, created: false };
}

export async function executeDadLibraryImport(planJson: string): Promise<ExecuteDadLibraryImportResult> {
  const { profile } = await assertLogAccess();

  let plan: DadLibraryPlan;
  try {
    plan = JSON.parse(planJson) as DadLibraryPlan;
  } catch {
    return { ok: false, error: "The import plan could not be read — re-upload the export." };
  }
  if (!Array.isArray(plan.directItems) || !Array.isArray(plan.synthesizedPromos)) {
    return { ok: false, error: "The import plan could not be read — re-upload the export." };
  }

  const supabase = await createClient();
  const failures: string[] = [];

  const toCreate = plan.directItems.filter((item) => item.existingItemId === null);
  const toUpdate = plan.directItems.filter((item) => item.existingItemId !== null);

  let itemsCreated = 0;
  let itemsUpdated = 0;

  if (toCreate.length > 0) {
    const { error } = await supabase.from("log_content_items").insert(
      toCreate.map((item) => ({
        content_type: item.contentType,
        title: item.title,
        expected_duration_seconds: item.lengthSeconds,
        dad_cart_number: item.cutNumber,
        dad_group: item.group,
        approval_status: "approved",
        owner_id: profile.id,
        created_by: profile.id,
      })),
    );
    if (error) failures.push(`Could not create ${toCreate.length} new content item(s).`);
    else itemsCreated = toCreate.length;
  }

  for (const item of toUpdate) {
    const { error } = await supabase
      .from("log_content_items")
      .update({
        content_type: item.contentType,
        title: item.title,
        expected_duration_seconds: item.lengthSeconds,
        dad_group: item.group,
        approval_status: "approved",
      })
      .eq("id", item.existingItemId!);
    if (error) failures.push(`Could not update "${item.title}" (cart ${item.cutNumber}).`);
    else itemsUpdated += 1;
  }

  let promosCreated = 0;
  let promosUpdated = 0;
  for (const promo of plan.synthesizedPromos) {
    const result = await upsertSynthesizedPromo(supabase, promo, profile.id);
    if (!result.ok) {
      failures.push(result.error);
      continue;
    }
    if (result.created) promosCreated += 1;
    else promosUpdated += 1;
  }

  await logAuditEvent({
    actorId: profile.id,
    action: "log.content_library.dad_import",
    targetType: "log_content_item",
    metadata: {
      items_created: itemsCreated,
      items_updated: itemsUpdated,
      promos_created: promosCreated,
      promos_updated: promosUpdated,
      failures: failures.length,
    },
  });

  return { ok: true, itemsCreated, itemsUpdated, promosCreated, promosUpdated, failures };
}

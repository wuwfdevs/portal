"use server";

// The program-log import's two Server Actions: parse an uploaded DAD export
// into a plan (nothing written), and execute a confirmed plan. Both return
// plain results for the client screen (import/import-client.tsx) rather
// than redirecting — the same non-redirecting shape Editorial Inquiry's
// canvas actions use, since the preview/confirm flow round-trips the plan
// through the client. The plan travels back as JSON; every write it drives
// still goes through RLS and the security-definer import functions
// (20260821180000_log_program_log_import.sql), so a tampered plan can't
// reach anything the session couldn't already write.

import { strFromU8, unzipSync } from "fflate";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { logAuditEvent } from "@/lib/audit";
import { resolveCurrentVersion } from "@/lib/log/clock-versions";
import {
  buildRundownBreakDrafts,
  selectNonOverlappingBreakDrafts,
} from "@/lib/log/rundown-generation";
import { placeAssignedContent } from "@/lib/log/opportunity-assignment-placement";
import { stationLocalDateTimeToUTC } from "@/lib/log/timezone";
import { extractDocxPlainText } from "@/lib/log/program-log-docx-text";
import { extractPdfPlainText } from "@/lib/log/program-log-pdf-text";
import { parseProgramLogWithAI } from "@/lib/log/program-log-ai-parse";
import {
  buildProgramLogPlan,
  importedBreakPermittedTypes,
  IMPORTED_BREAK_REQUIREMENT,
  secondsToClockTime,
  type PlanCopy,
  type PlanUnderwriter,
  type ProgramLogPlan,
} from "@/lib/log/program-log-plan";
import {
  getClockTemplateDetail,
  listContentItems,
  listLocalOpportunitiesForVersion,
  listPrograms,
  listScheduleEntries,
  toRundownOpportunity,
} from "@/lib/log/queries";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ParseImportResult = { ok: true; plan: ProgramLogPlan } | { ok: false; error: string };

type TextExtractionResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Gets plain text out of whichever supported format was uploaded — the
 * deterministic, format-specific half of this import (see program-log-
 * docx-text.ts and program-log-pdf-text.ts's own comments for why this
 * stays mechanical while everything about *interpreting* the text is the
 * AI-parse step's job). Dispatches on the file's own name, since a
 * browser's reported MIME type for a .docx varies by OS/browser and isn't
 * worth relying on.
 */
async function extractSourceText(file: File): Promise<TextExtractionResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    return extractPdfPlainText(new Uint8Array(await file.arrayBuffer()));
  }
  if (name.endsWith(".docx")) {
    try {
      const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const entry = archive["word/document.xml"];
      if (!entry) return { ok: false, error: "That file isn't a Word document (no word/document.xml inside)." };
      return { ok: true, text: extractDocxPlainText(strFromU8(entry)) };
    } catch {
      return { ok: false, error: "That file couldn't be read as a .docx archive." };
    }
  }
  return { ok: false, error: "Choose a program-log export as a Word (.docx) or PDF (.pdf) file." };
}

export async function parseProgramLogUpload(formData: FormData): Promise<ParseImportResult> {
  await assertLogAccess();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a program-log export (.docx or .pdf) to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That file is too large to be a program-log export." };
  }

  const extraction = await extractSourceText(file);
  if (!extraction.ok) return { ok: false, error: extraction.error };

  const supabase = await createClient();
  const [programs, scheduleEntries, contentItems, uwResult] = await Promise.all([
    listPrograms(),
    listScheduleEntries(),
    listContentItems({ approvalStatus: "approved" }),
    supabase.rpc("log_import_list_underwriting_copy"),
  ]);

  if (uwResult.error) return { ok: false, error: "Could not read the underwriting copy library." };
  const uwData = uwResult.data as
    | { underwriters: PlanUnderwriter[]; copy: PlanCopy[] }
    | { error: string };
  if ("error" in uwData) return { ok: false, error: "Could not read the underwriting copy library." };

  // The one call that does all the structural + credit judgment (see
  // program-log-ai-parse.ts) — needs the day's existing underwriters up
  // front, as a closed set it matches credits against rather than guessing
  // at free text (its "NEW" escape hatch is the only way a credit's
  // underwriter isn't one of these).
  const aiResult = await parseProgramLogWithAI(extraction.text, uwData.underwriters.map((row) => row.name));
  if (!aiResult.ok) return { ok: false, error: aiResult.error };
  const parsed = aiResult.parsed;

  const rundownsResult = parsed.airDate
    ? await supabase.from("log_rundowns").select("id, program_id, source").eq("air_date", parsed.airDate)
    : { data: [], error: null };
  if (rundownsResult.error) return { ok: false, error: "Could not check for existing rundowns." };

  const plan = buildProgramLogPlan({
    parsed,
    programs: programs.map((program) => ({ id: program.id, name: program.name })),
    scheduleEntries,
    existingRundowns: rundownsResult.data ?? [],
    underwriters: uwData.underwriters,
    copy: uwData.copy,
    contentItems: contentItems.map((item) => ({ id: item.id, title: item.title })),
  });
  return { ok: true, plan };
}

export interface ImportedRundownResult {
  programName: string;
  rundownId: string | null;
  breaks: number;
  items: number;
  skippedReason: string | null;
}

export type ExecuteImportResult =
  | {
      ok: true;
      rundowns: ImportedRundownResult[];
      copyCreated: number;
      copyReused: number;
      underwritersCreated: number;
    }
  | { ok: false; error: string };

/**
 * Applies a confirmed plan. Order matters: underwriters and copy first
 * (find-or-create through the security-definer import functions, so a
 * re-import or a concurrent import never mints duplicates), then one
 * rundown per program — skipping any that now exists — with its breaks and
 * items. A partial failure leaves whatever already succeeded in place and
 * reports it; re-running the import is additive, not duplicating, because
 * every write path here is keyed (find-or-create for uw rows, the
 * (program_id, air_date) unique constraint for rundowns).
 */
export async function executeProgramLogImport(planJson: string): Promise<ExecuteImportResult> {
  const context = await assertLogAccess();

  let plan: ProgramLogPlan;
  try {
    plan = JSON.parse(planJson) as ProgramLogPlan;
  } catch {
    return { ok: false, error: "The import plan could not be read — re-upload the export." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.airDate ?? "")) {
    return { ok: false, error: "The plan has no valid air date — re-upload the export." };
  }
  if (!Array.isArray(plan.rundowns) || !Array.isArray(plan.copyPlans)) {
    return { ok: false, error: "The import plan could not be read — re-upload the export." };
  }

  const supabase = await createClient();

  // ---- Underwriters + copy (only what a writable rundown references) -------
  const referencedCopyKeys = new Set(
    plan.rundowns
      .filter((rundown) => rundown.existingRundownId === null)
      .flatMap((rundown) => rundown.breaks)
      .flatMap((brk) => brk.items)
      .flatMap((item) => (item.kind === "credit" ? [item.copyKey] : [])),
  );
  const copyIdByKey = new Map<string, string>();
  let copyCreated = 0;
  let copyReused = 0;
  let underwritersCreated = 0;
  for (const copyPlan of plan.copyPlans) {
    if (!referencedCopyKeys.has(copyPlan.key)) continue;
    if (copyPlan.existingCopyId) {
      copyIdByKey.set(copyPlan.key, copyPlan.existingCopyId);
      copyReused += 1;
      continue;
    }
    const underwriter = await supabase.rpc("log_import_underwriter", {
      p_name: copyPlan.underwriterName,
    });
    if (underwriter.error || typeof underwriter.data !== "string") {
      return { ok: false, error: `Could not create underwriter "${copyPlan.underwriterName}".` };
    }
    if (copyPlan.underwriterIsNew) underwritersCreated += 1;
    const copy = await supabase.rpc("log_import_underwriting_copy", {
      p_underwriter_id: underwriter.data,
      p_label: copyPlan.label,
      p_cart_identifier: copyPlan.cart,
      p_script: copyPlan.script,
      p_duration_seconds: copyPlan.durationSeconds,
    });
    if (copy.error || typeof copy.data !== "string") {
      return { ok: false, error: `Could not create copy "${copyPlan.label}" for "${copyPlan.underwriterName}".` };
    }
    copyIdByKey.set(copyPlan.key, copy.data);
    copyCreated += 1;
  }

  // ---- Rundowns, breaks, items ---------------------------------------------
  const results: ImportedRundownResult[] = [];
  for (const rundownPlan of plan.rundowns) {
    if (rundownPlan.existingRundownId !== null) {
      results.push({
        programName: rundownPlan.programName,
        rundownId: rundownPlan.existingRundownId,
        breaks: 0,
        items: 0,
        skippedReason: "A rundown for this program and date already exists.",
      });
      continue;
    }

    const template = await getClockTemplateDetail(rundownPlan.clockTemplateId);
    const version = template ? resolveCurrentVersion(template.versions, plan.airDate) : null;
    if (!version) {
      results.push({
        programName: rundownPlan.programName,
        rundownId: null,
        breaks: 0,
        items: 0,
        skippedReason: "This program's clock has no version in effect on that date.",
      });
      continue;
    }

    const shiftStartAt = stationLocalDateTimeToUTC(plan.airDate, rundownPlan.shiftStartTime);
    const shiftEndAt = new Date(
      new Date(shiftStartAt).getTime() + rundownPlan.shiftDurationMinutes * 60_000,
    ).toISOString();
    const { data: rundown, error: rundownError } = await supabase
      .from("log_rundowns")
      .insert({
        program_id: rundownPlan.programId,
        schedule_entry_id: rundownPlan.scheduleEntryId,
        clock_version_id: version.id,
        air_date: plan.airDate,
        shift_start_at: shiftStartAt,
        shift_end_at: shiftEndAt,
        status: "generated",
        generated_at: new Date().toISOString(),
        source: "imported",
      })
      .select("id")
      .single();
    if (rundownError || !rundown) {
      results.push({
        programName: rundownPlan.programName,
        rundownId: null,
        breaks: 0,
        items: 0,
        skippedReason:
          rundownError?.code === "23505"
            ? "A rundown for this program and date was created while you were previewing."
            : "Could not create this rundown.",
      });
      continue;
    }

    let itemCount = 0;
    const breakRows = rundownPlan.breaks.map((brk, index) => {
      const scheduledAt = stationLocalDateTimeToUTC(plan.airDate, secondsToClockTime(brk.startSeconds));
      return {
        rundown_id: rundown.id,
        local_opportunity_id: null,
        position: index + 1,
        label: brk.label,
        requirement: IMPORTED_BREAK_REQUIREMENT,
        permitted_content_types: importedBreakPermittedTypes(),
        scheduled_at: scheduledAt,
        available_duration_seconds: Math.max(1, brk.availableDurationSeconds),
        network_rejoin_at: new Date(
          new Date(scheduledAt).getTime() + Math.max(1, brk.availableDurationSeconds) * 1000,
        ).toISOString(),
      };
    });
    const { data: insertedBreaks, error: breaksError } =
      breakRows.length > 0
        ? await supabase.from("log_rundown_breaks").insert(breakRows).select("id, position")
        : { data: [], error: null };
    if (breaksError || !insertedBreaks) {
      results.push({
        programName: rundownPlan.programName,
        rundownId: rundown.id,
        breaks: 0,
        items: 0,
        skippedReason: "The rundown was created but its breaks could not be.",
      });
      continue;
    }

    const breakIdByPosition = new Map(insertedBreaks.map((brk) => [brk.position, brk.id]));
    interface ItemInsert {
      break_id: string;
      position: number;
      planned_duration_seconds: number;
      item_kind: "underwriting_credit" | "content" | "live_read";
      underwriting_copy_id?: string;
      content_item_id?: string;
      live_read_title?: string;
      live_read_script?: string;
    }
    const itemRows: ItemInsert[] = rundownPlan.breaks.flatMap((brk, index) => {
      const breakId = breakIdByPosition.get(index + 1);
      if (!breakId) return [];
      return brk.items.flatMap((item, itemIndex): ItemInsert[] => {
        const base = {
          break_id: breakId,
          position: itemIndex + 1,
          planned_duration_seconds: Math.max(1, item.durationSeconds),
        };
        if (item.kind === "credit") {
          const copyId = copyIdByKey.get(item.copyKey);
          if (!copyId) return [];
          return [{ ...base, item_kind: "underwriting_credit", underwriting_copy_id: copyId }];
        }
        if (item.kind === "content") {
          return [{ ...base, item_kind: "content", content_item_id: item.contentItemId }];
        }
        return [
          {
            ...base,
            item_kind: "live_read",
            live_read_title: item.title,
            ...(item.script ? { live_read_script: item.script } : {}),
          },
        ];
      });
    });
    const { error: itemsError } =
      itemRows.length > 0 ? await supabase.from("log_rundown_items").insert(itemRows) : { error: null };
    if (itemsError) {
      results.push({
        programName: rundownPlan.programName,
        rundownId: rundown.id,
        breaks: insertedBreaks.length,
        items: 0,
        skippedReason: "The rundown and breaks were created but some items could not be.",
      });
      continue;
    }
    itemCount = itemRows.length;

    // The export only prints the windows DAD scheduled something into — the
    // clock's other local opportunities (a newscast cover, a promo slot)
    // are real, fillable windows a host expects to see alongside them, so
    // bring them in the same way syncRundownBreaks does for an existing
    // imported rundown: window-overlap dedup against the imported breaks,
    // then the same assigned-content placement generation runs. Best-effort
    // — a failure here still leaves a complete imported rundown, and the
    // rundown screen's own sync affordance can finish the job.
    let clockBreakCount = 0;
    const opportunities = (await listLocalOpportunitiesForVersion(version.id)).map(
      toRundownOpportunity,
    );
    const clockDrafts = selectNonOverlappingBreakDrafts(
      buildRundownBreakDrafts(opportunities, shiftStartAt, rundownPlan.shiftDurationMinutes),
      breakRows,
    );
    if (clockDrafts.length > 0) {
      const { data: insertedClockBreaks, error: clockBreaksError } = await supabase
        .from("log_rundown_breaks")
        .upsert(
          clockDrafts.map((draft) => ({
            rundown_id: rundown.id,
            local_opportunity_id: draft.local_opportunity_id,
            position: draft.position,
            label: draft.label,
            requirement: draft.requirement,
            permitted_content_types: draft.permitted_content_types,
            scheduled_at: draft.scheduled_at,
            available_duration_seconds: draft.available_duration_seconds,
            network_rejoin_at: draft.network_rejoin_at,
          })),
          { onConflict: "rundown_id,local_opportunity_id,scheduled_at", ignoreDuplicates: true },
        )
        .select("id, local_opportunity_id, scheduled_at");
      if (clockBreaksError) {
        console.error("Could not add clock-opportunity breaks to an imported rundown:", clockBreaksError.message);
      } else {
        clockBreakCount = (insertedClockBreaks ?? []).length;
        await placeAssignedContent(supabase, insertedClockBreaks ?? [], clockDrafts, plan.airDate);
      }
    }

    results.push({
      programName: rundownPlan.programName,
      rundownId: rundown.id,
      breaks: insertedBreaks.length + clockBreakCount,
      items: itemCount,
      skippedReason: null,
    });
  }

  await logAuditEvent({
    actorId: context.profile.id,
    action: "log.program_log.imported",
    targetType: "log_rundown",
    metadata: {
      air_date: plan.airDate,
      rundowns_created: results.filter((result) => result.skippedReason === null).length,
      rundowns_skipped: results.filter((result) => result.skippedReason !== null).length,
      breaks: results.reduce((sum, result) => sum + result.breaks, 0),
      items: results.reduce((sum, result) => sum + result.items, 0),
      copy_created: copyCreated,
      copy_reused: copyReused,
      underwriters_created: underwritersCreated,
    },
  });

  return { ok: true, rundowns: results, copyCreated, copyReused, underwritersCreated };
}

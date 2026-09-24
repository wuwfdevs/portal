"use server";

// The program-log import's two Server Actions: read an uploaded PDF export
// into a plan (nothing written), and execute a confirmed plan. Both return
// plain results for the client screen (import/import-client.tsx) rather
// than redirecting — the same non-redirecting shape Editorial Inquiry's
// canvas actions use, since the preview/confirm flow round-trips the plan
// through the client. The plan travels back as JSON; every write it drives
// still goes through RLS and the security-definer import functions
// (20260821180000_log_program_log_import.sql), so a tampered plan can't
// reach anything the session couldn't already write.

import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { logAuditEvent } from "@/lib/audit";
import { resolveCurrentVersion } from "@/lib/log/clock-versions";
import { alignBreaksToClock } from "@/lib/log/program-log-clock-alignment";
import { placeAssignedContentIntoBreaks } from "@/lib/log/opportunity-assignment-placement";
import { stationLocalDateTimeToUTC } from "@/lib/log/timezone";
import { importProgramLogWithAI } from "@/lib/log/program-log-ai-import";
import type { ImportLookupData } from "@/lib/log/program-log-lookups";
import {
  assembleProgramLogPlan,
  clockTimeToSeconds,
  type PlanCopy,
  type PlanUnderwriter,
  type ProgramLogPlan,
} from "@/lib/log/program-log-plan";
import {
  getClockTemplateDetail,
  listContentItems,
  listScheduleEntries,
  type ClockTemplateDetail,
} from "@/lib/log/queries";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ParseImportResult = { ok: true; plan: ProgramLogPlan } | { ok: false; error: string };

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * Reads an uploaded PDF export into a plan. The model does the reading
 * (program-log-ai-import.ts) and pulls the schedule, an underwriter's
 * copy, and content-library candidates through lookup tools over the lists
 * preloaded here — so the context it sees is the document plus what the
 * document mentions, not the whole library. The plan it returns is
 * resolved against the same lists (program-log-plan.ts) and shown for
 * review; nothing is written.
 */
export async function parseProgramLogUpload(formData: FormData): Promise<ParseImportResult> {
  await assertLogAccess();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a program-log export (.pdf) to upload." };
  }
  if (!isPdf(file)) {
    return { ok: false, error: "Choose the program-log export as a PDF file." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That file is too large to be a program-log export." };
  }

  const supabase = await createClient();
  const [scheduleEntries, contentItems, uwResult] = await Promise.all([
    listScheduleEntries(),
    listContentItems({ approvalStatus: "approved" }),
    supabase.rpc("log_import_list_underwriting_copy"),
  ]);

  if (uwResult.error) return { ok: false, error: "Could not read the underwriting copy library." };
  const uwData = uwResult.data as
    { underwriters: PlanUnderwriter[]; copy: PlanCopy[] } | { error: string };
  if ("error" in uwData)
    return { ok: false, error: "Could not read the underwriting copy library." };

  const data: ImportLookupData = {
    scheduleEntries: scheduleEntries.map((entry) => ({
      id: entry.id,
      program_id: entry.program_id,
      program_name: entry.programName,
      clock_template_id: entry.clock_template_id,
      air_time: entry.air_time,
      duration_minutes: entry.duration_minutes,
      entry_type: entry.entry_type,
      days_of_week: entry.days_of_week,
      start_date: entry.start_date,
      end_date: entry.end_date,
    })),
    underwriters: uwData.underwriters,
    copy: uwData.copy,
    contentItems: contentItems.map((item) => ({
      id: item.id,
      title: item.title,
      content_type: item.content_type,
    })),
  };

  const ai = await importProgramLogWithAI({
    pdf: new Uint8Array(await file.arrayBuffer()),
    filename: file.name,
    data,
  });
  if (!ai.ok) return { ok: false, error: ai.error };

  const airDate = /^\d{4}-\d{2}-\d{2}$/.test(ai.output.air_date) ? ai.output.air_date : null;
  const rundownsResult = airDate
    ? await supabase.from("log_rundowns").select("id, program_id, source").eq("air_date", airDate)
    : { data: [], error: null };
  if (rundownsResult.error) return { ok: false, error: "Could not check for existing rundowns." };

  const plan = assembleProgramLogPlan({
    output: ai.output,
    ...data,
    existingRundowns: rundownsResult.data ?? [],
  });
  if (plan.airDate) await alignPlanToClocks(plan, plan.airDate);
  return { ok: true, plan };
}

/**
 * Moves each rundown's breaks from the export's printed windows onto its
 * program's clock (program-log-clock-alignment.ts): the clock defines every
 * window, the export decides what goes in it. Done here rather than in the
 * executor so the preview shows exactly the breaks that will be written.
 * A rundown whose clock has no version in effect is left unaligned, and
 * the executor skips it with that reason.
 */
async function alignPlanToClocks(plan: ProgramLogPlan, airDate: string): Promise<void> {
  const templates = new Map<string, Promise<ClockTemplateDetail | null>>();
  for (const rundown of plan.rundowns) {
    if (rundown.existingRundownId !== null) continue;
    if (!templates.has(rundown.clockTemplateId)) {
      templates.set(rundown.clockTemplateId, getClockTemplateDetail(rundown.clockTemplateId));
    }
    const template = await templates.get(rundown.clockTemplateId)!;
    const version = template ? resolveCurrentVersion(template.versions, airDate) : null;
    if (!version) continue;
    rundown.breaks = alignBreaksToClock({
      exportBreaks: rundown.breaks,
      shiftStartSeconds: clockTimeToSeconds(rundown.shiftStartTime),
      shiftDurationMinutes: rundown.shiftDurationMinutes,
      slots: version.slots,
      opportunities: version.opportunities,
    });
    rundown.clockVersionId = version.id;
  }
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
      /** Reused copy rows whose script was replaced with the export's. */
      copyUpdated: number;
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
  let copyUpdated = 0;
  let underwritersCreated = 0;
  for (const copyPlan of plan.copyPlans) {
    if (!referencedCopyKeys.has(copyPlan.key)) continue;
    if (copyPlan.existingCopyId) {
      copyIdByKey.set(copyPlan.key, copyPlan.existingCopyId);
      copyReused += 1;
      // The export's wording prevails (see CopyPlan.scriptChanged): replace
      // the library row's script so every rundown that reuses it — this
      // one and earlier ones — reads what the traffic system currently
      // says, not what an earlier import happened to capture.
      if (copyPlan.scriptChanged && copyPlan.script) {
        const updated = await supabase.rpc("log_import_update_underwriting_copy", {
          p_copy_id: copyPlan.existingCopyId,
          p_script: copyPlan.script,
          p_duration_seconds: copyPlan.durationSeconds,
        });
        if (updated.error) {
          return {
            ok: false,
            error: `Could not update the library script for "${copyPlan.underwriterName} / ${copyPlan.label}".`,
          };
        }
        if (updated.data === true) copyUpdated += 1;
      }
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
      return {
        ok: false,
        error: `Could not create copy "${copyPlan.label}" for "${copyPlan.underwriterName}".`,
      };
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
    if (!version || rundownPlan.clockVersionId === null) {
      results.push({
        programName: rundownPlan.programName,
        rundownId: null,
        breaks: 0,
        items: 0,
        skippedReason: "This program's clock has no version in effect on that date.",
      });
      continue;
    }
    // The breaks were aligned to the clock at preview time; a clock that
    // changed since would put them at the wrong times.
    if (version.id !== rundownPlan.clockVersionId) {
      results.push({
        programName: rundownPlan.programName,
        rundownId: null,
        breaks: 0,
        items: 0,
        skippedReason: "This program's clock changed since the preview — upload the export again.",
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
    const shiftStartMs = new Date(shiftStartAt).getTime();
    const alignedBreaks = rundownPlan.breaks.flatMap((brk) =>
      brk.placement ? [{ ...brk, placement: brk.placement }] : [],
    );
    const breakRows = alignedBreaks.map(({ label, placement }) => ({
      rundown_id: rundown.id,
      local_opportunity_id: placement.localOpportunityId,
      position: placement.position,
      label,
      requirement: placement.requirement,
      permitted_content_types: placement.permittedContentTypes,
      scheduled_at: new Date(shiftStartMs + placement.offsetSeconds * 1000).toISOString(),
      available_duration_seconds: Math.max(
        1,
        placement.rejoinOffsetSeconds - placement.offsetSeconds,
      ),
      network_rejoin_at: new Date(
        shiftStartMs + Math.max(placement.rejoinOffsetSeconds, placement.offsetSeconds + 1) * 1000,
      ).toISOString(),
    }));
    const { data: insertedBreaks, error: breaksError } =
      breakRows.length > 0
        ? await supabase.from("log_rundown_breaks").insert(breakRows).select("id, position")
        : { data: [], error: null };
    if (breaksError || !insertedBreaks || insertedBreaks.length !== breakRows.length) {
      results.push({
        programName: rundownPlan.programName,
        rundownId: rundown.id,
        breaks: 0,
        items: 0,
        skippedReason: "The rundown was created but its breaks could not be.",
      });
      continue;
    }
    // Positions are unique within an aligned rundown (hour × slot, with
    // export-only windows in their own range), so they map each returned
    // row back to its break regardless of the order the insert returns.
    const breakIdByPosition = new Map(insertedBreaks.map((brk) => [brk.position, brk.id]));
    const breakIdFor = (index: number) =>
      breakIdByPosition.get(alignedBreaks[index]!.placement.position);

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
    const itemRows: ItemInsert[] = alignedBreaks.flatMap((brk, index) => {
      const breakId = breakIdFor(index);
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
      itemRows.length > 0
        ? await supabase.from("log_rundown_items").insert(itemRows)
        : { error: null };
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

    // Opportunity assignments (the legal ID pin) apply to every opportunity
    // break, exactly as on a generated rundown — appended after whatever the
    // export put there, and never a second copy of an item it already holds.
    // Best-effort, like generation's own placement.
    const targets = alignedBreaks.flatMap(({ placement }, index) => {
      const breakId = breakIdFor(index);
      return placement.localOpportunityId && breakId
        ? [
            {
              break_id: breakId,
              local_opportunity_id: placement.localOpportunityId,
              hour_index: placement.hourIndex,
            },
          ]
        : [];
    });
    const existingContents = new Map(
      insertedBreaks.map(({ id }) => {
        const items = itemRows.filter((item) => item.break_id === id);
        return [
          id,
          {
            itemCount: items.length,
            contentItemIds: items.flatMap((item) =>
              item.content_item_id ? [item.content_item_id] : [],
            ),
          },
        ];
      }),
    );
    await placeAssignedContentIntoBreaks(supabase, targets, existingContents, plan.airDate);

    results.push({
      programName: rundownPlan.programName,
      rundownId: rundown.id,
      breaks: insertedBreaks.length,
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
      copy_updated: copyUpdated,
      underwriters_created: underwritersCreated,
    },
  });

  return { ok: true, rundowns: results, copyCreated, copyReused, copyUpdated, underwritersCreated };
}

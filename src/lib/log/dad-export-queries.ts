import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { isRecordedInDad, normalizeDadCut } from "@/lib/underwriting/dad-cut";
import { automatedSegments } from "./automated-hours";
import { loadAutomatedHours } from "./automated-hours-queries";
import {
  automatedBreaksOn,
  buildDadEvents,
  dadLogFileName,
  rowsFromEvents,
  serializeDadLog,
  validateDadEvents,
  type DadEvent,
  type DadExportBreak,
  type DadExportItem,
  type DadIssue,
} from "./dad-export";
import { entriesInForceOn } from "./schedule";
import { stationLocalParts, stationLocalToUTC } from "./automated-hours";
import { shiftDateISO } from "./timezone";
import { listScheduleEntries } from "./queries";
import type { Database } from "@/lib/database.types";

export type LogDadExportRow = Database["public"]["Tables"]["log_dad_exports"]["Row"];

/**
 * Loads a station-local day's automated breaks in the shape
 * lib/log/dad-export.ts builds from. Rundowns are read for the day and the
 * one before it, since an overnight shift that starts the evening before
 * airs past midnight into this day. Reads go through the RLS client: Log
 * members read rundowns, and the credits' copy through uw_copy_select_for_log
 * and log_underwriters_for_copy().
 */
export interface DadDay {
  dateISO: string;
  fileName: string;
  automatedBreaks: DadExportBreak[];
  events: DadEvent[];
  issues: DadIssue[];
  automatedSeconds: number;
  releases: LogDadExportRow[];
}

export async function loadDadDay(dateISO: string): Promise<DadDay> {
  const supabase = await createClient();
  const [hours, rundowns, releases, scheduleEntries] = await Promise.all([
    loadAutomatedHours(),
    supabase
      .from("log_rundowns")
      .select("id, program_id, air_date")
      .in("air_date", [shiftDateISO(dateISO, -1), dateISO]),
    supabase
      .from("log_dad_exports")
      .select("*")
      .eq("air_date", dateISO)
      .order("version", { ascending: false }),
    listScheduleEntries(),
  ]);
  const rundownRows = unwrapRead(rundowns, "the day's rundowns") ?? [];
  const releaseRows = unwrapRead(releases, "the DAD log's releases") ?? [];

  const programNameById = new Map(scheduleEntries.map((e) => [e.program_id, e.programName]));
  const rundownById = new Map(rundownRows.map((r) => [r.id, r]));

  const breaks =
    rundownRows.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("log_rundown_breaks")
            .select("id, rundown_id, label, scheduled_at, available_duration_seconds")
            .in(
              "rundown_id",
              rundownRows.map((r) => r.id),
            ),
          "the day's breaks",
        ) ?? []);

  // Only the breaks in automated time need their items.
  const candidateBreaks: DadExportBreak[] = breaks.map((brk) => {
    const rundown = rundownById.get(brk.rundown_id);
    return {
      id: brk.id,
      rundownId: brk.rundown_id,
      programName: (rundown && programNameById.get(rundown.program_id)) ?? "Unknown program",
      label: brk.label,
      scheduledAt: brk.scheduled_at,
      availableSeconds: brk.available_duration_seconds,
      items: [],
    };
  });
  const automated = automatedBreaksOn(dateISO, candidateBreaks, hours.weekly, hours.changes);
  const breakIds = automated.map((brk) => brk.id);

  const items =
    breakIds.length === 0
      ? []
      : (unwrapRead(
          await supabase
            .from("log_rundown_items")
            .select(
              "id, break_id, position, item_kind, content_item_id, live_read_title, planned_duration_seconds, underwriting_copy_id, dad_spot_number",
            )
            .in("break_id", breakIds),
          "the automated breaks' items",
        ) ?? []);

  const contentIds = [
    ...new Set(items.flatMap((i) => (i.content_item_id ? [i.content_item_id] : []))),
  ];
  const copyIds = [
    ...new Set(items.flatMap((i) => (i.underwriting_copy_id ? [i.underwriting_copy_id] : []))),
  ];
  const [contentResult, componentResult, copyResult, underwriterResult] = await Promise.all([
    contentIds.length === 0
      ? null
      : supabase
          .from("log_content_items")
          .select("id, title, dad_cart_number")
          .in("id", contentIds),
    contentIds.length === 0
      ? null
      : supabase
          .from("log_content_components")
          .select("content_item_id, component_type, dad_cart_number")
          .in("content_item_id", contentIds),
    copyIds.length === 0
      ? null
      : supabase
          .from("uw_copy")
          .select(
            "id, label, dad_cut, dad_recorded_at, approval_status, effective_from, effective_to",
          )
          .in("id", copyIds),
    copyIds.length === 0
      ? null
      : supabase.rpc("log_underwriters_for_copy", { p_copy_ids: copyIds }),
  ]);
  const contentById = new Map(
    (contentResult ? (unwrapRead(contentResult, "the library items") ?? []) : []).map((c) => [
      c.id,
      c,
    ]),
  );
  const componentCut = new Map<string, string>();
  for (const component of componentResult
    ? (unwrapRead(componentResult, "the library items' parts") ?? [])
    : []) {
    // The recorded part is what DAD plays; any other part's cut is a fallback.
    if (
      component.dad_cart_number &&
      (component.component_type === "recorded_audio" ||
        !componentCut.has(component.content_item_id))
    ) {
      componentCut.set(component.content_item_id, component.dad_cart_number);
    }
  }
  const copyById = new Map(
    (copyResult ? (unwrapRead(copyResult, "the credits' copy") ?? []) : []).map((c) => [c.id, c]),
  );
  const underwriterByCopy = new Map(
    (underwriterResult
      ? (unwrapRead(underwriterResult, "the credits' underwriters") ?? [])
      : []
    ).map((row) => [row.copy_id, row.underwriter_name]),
  );

  const breakById = new Map(automated.map((brk) => [brk.id, brk]));
  for (const item of items) {
    const brk = breakById.get(item.break_id);
    if (!brk) continue;
    const airDate = stationLocalParts(brk.scheduledAt).dateISO;
    let exportItem: DadExportItem;
    if (item.item_kind === "underwriting_credit" && item.underwriting_copy_id) {
      const copy = copyById.get(item.underwriting_copy_id);
      const underwriter = underwriterByCopy.get(item.underwriting_copy_id);
      exportItem = {
        id: item.id,
        position: item.position,
        kind: item.item_kind,
        durationSeconds: item.planned_duration_seconds,
        description: [copy?.label ?? "Credit", underwriter].filter(Boolean).join(" - "),
        cut: copy?.dad_cut ?? null,
        spotNumber: item.dad_spot_number,
        copyApproved: copy ? copy.approval_status === "approved" : false,
        recorded: copy ? isRecordedInDad(copy) : false,
        copyInDate: copy
          ? copy.effective_from <= airDate &&
            (copy.effective_to === null || copy.effective_to >= airDate)
          : false,
        fixHref: `/underwriting/copy/${item.underwriting_copy_id}/edit`,
      };
    } else {
      const content = item.content_item_id ? contentById.get(item.content_item_id) : undefined;
      const rawCut =
        content?.dad_cart_number ?? (content ? (componentCut.get(content.id) ?? null) : null);
      exportItem = {
        id: item.id,
        position: item.position,
        kind: item.item_kind,
        durationSeconds: item.planned_duration_seconds,
        description:
          content?.title ??
          item.live_read_title ??
          (item.item_kind === "weather" ? "Weather" : "Item"),
        cut: rawCut ? normalizeDadCut(rawCut) : null,
        spotNumber: item.dad_spot_number,
        fixHref: content ? `/log/library/${content.id}` : null,
      };
    }
    brk.items.push(exportItem);
  }

  // Programs airing in automated hours with no rundown: their breaks can't
  // be in the file. Worth knowing, not a reason to hold the file back.
  const segments = automatedSegments(dateISO, hours.weekly, hours.changes).filter(
    (s) => s.automated,
  );
  const withRundown = new Set(
    rundownRows.filter((r) => r.air_date === dateISO).map((r) => r.program_id),
  );
  const warnings: DadIssue[] = [];
  const warned = new Set<string>();
  for (const entry of entriesInForceOn(scheduleEntries, dateISO)) {
    if (withRundown.has(entry.program_id) || warned.has(entry.program_id)) continue;
    const start = Date.parse(stationLocalToUTC(dateISO, entry.air_time));
    const end = start + entry.duration_minutes * 60_000;
    const overlaps = segments.some(
      (s) => Date.parse(s.startsAt) < end && Date.parse(s.endsAt) > start,
    );
    if (!overlaps) continue;
    warned.add(entry.program_id);
    warnings.push({
      severity: "warning",
      code: "empty_automated_hours",
      message: `${entry.programName} airs in automated hours and has no rundown for this day, so none of its breaks are in the file.`,
      breakId: null,
      rundownId: null,
      itemId: null,
      href: `/log?date=${dateISO}`,
    });
  }

  const automatedSeconds = segments.reduce(
    (sum, s) => sum + (Date.parse(s.endsAt) - Date.parse(s.startsAt)) / 1000,
    0,
  );

  return {
    dateISO,
    fileName: dadLogFileName(dateISO),
    automatedBreaks: automated,
    events: buildDadEvents(automated),
    issues: validateDadEvents(automated, warnings),
    automatedSeconds,
    releases: releaseRows,
  };
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "latin1").digest("hex");
}

/**
 * Whether the latest release still matches what the rundowns say now. An
 * item with no spot number has never been released, so the file is out of
 * date; otherwise the file is rebuilt and its hash compared.
 */
export function isReleaseCurrent(day: DadDay): boolean | null {
  const latest = day.releases[0];
  if (!latest) return null;
  if (day.events.some((event) => event.spotNumber === null)) return false;
  return sha256(serializeDadLog(rowsFromEvents(day.events))) === latest.sha256;
}

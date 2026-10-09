import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { readPage } from "@/lib/pagination-read";
import { pageRange } from "@/lib/pagination";
import type { Database } from "@/lib/database.types";
import type { OnAirChange, WeeklyAutomatedWindow } from "./automated-hours";

/**
 * Reads for automated hours (lib/log/automated-hours.ts). Log members and
 * Underwriting members can read both tables (20261002130000,
 * 20261002130100) — Underwriting's auto-fill needs them to keep cut-less
 * copy out of automated breaks.
 */

export type LogAutomatedWeeklyRow = Database["public"]["Tables"]["log_automated_weekly"]["Row"];
export type LogOnAirChangeRow = Database["public"]["Tables"]["log_on_air_changes"]["Row"];

export function toWeeklyWindow(row: LogAutomatedWeeklyRow): WeeklyAutomatedWindow {
  return {
    id: row.id,
    daysOfWeek: row.days_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    active: row.active,
  };
}

export function toOnAirChange(row: LogOnAirChangeRow): OnAirChange {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    mode: row.mode,
    active: row.active,
  };
}

/** Every active weekly window and one-time change — what isAutomated() needs. */
export async function loadAutomatedHours(): Promise<{
  weekly: WeeklyAutomatedWindow[];
  changes: OnAirChange[];
  /** Each change's reason, by id — what the week view labels a change with. */
  reasons: Map<string, string | null>;
}> {
  const supabase = await createClient();
  const [weekly, changes] = await Promise.all([
    supabase.from("log_automated_weekly").select("*").eq("active", true),
    supabase.from("log_on_air_changes").select("*").eq("active", true),
  ]);
  const changeRows = unwrapRead(changes, "the one-time changes") ?? [];
  return {
    weekly: (unwrapRead(weekly, "the automated hours") ?? []).map(toWeeklyWindow),
    changes: changeRows.map(toOnAirChange),
    reasons: new Map(changeRows.map((row) => [row.id, row.reason])),
  };
}

/** The weekly windows for the screen's table, current ones first. */
export async function listWeeklyWindows(): Promise<LogAutomatedWeeklyRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("log_automated_weekly")
        .select("*")
        .eq("active", true)
        .order("start_time")
        .order("effective_from"),
      "the automated hours",
    ) ?? []
  );
}

export const ONE_TIME_CHANGES_PAGE_SIZE = 20;

/** One page of one-time changes: upcoming (not yet over, soonest first) or past (most recent first). */
export async function listOnAirChanges(
  scope: "upcoming" | "past",
  page: number,
  nowISO: string,
): Promise<{ rows: LogOnAirChangeRow[]; total: number }> {
  const supabase = await createClient();
  const { from, to } = pageRange(page, ONE_TIME_CHANGES_PAGE_SIZE);
  let query = supabase
    .from("log_on_air_changes")
    .select("*", { count: "exact" })
    .eq("active", true);
  query =
    scope === "upcoming"
      ? query.gt("ends_at", nowISO).order("starts_at", { ascending: true })
      : query.lte("ends_at", nowISO).order("starts_at", { ascending: false });
  const result = await query.order("id").range(from, to);
  return readPage(result, "the one-time changes", async () => {
    const counts = await countOnAirChanges(nowISO);
    return counts[scope];
  });
}

/** How many active changes are upcoming and past — the filter chips' counts. */
export async function countOnAirChanges(
  nowISO: string,
): Promise<{ upcoming: number; past: number }> {
  const supabase = await createClient();
  const [upcoming, past] = await Promise.all([
    supabase
      .from("log_on_air_changes")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .gt("ends_at", nowISO),
    supabase
      .from("log_on_air_changes")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .lte("ends_at", nowISO),
  ]);
  unwrapRead(upcoming, "the one-time changes");
  unwrapRead(past, "the one-time changes");
  return { upcoming: upcoming.count ?? 0, past: past.count ?? 0 };
}

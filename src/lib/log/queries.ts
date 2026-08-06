import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";

/**
 * Data access for Log. Every read goes through the RLS-scoped server client,
 * so private.has_log_access is what actually decides what comes back — these
 * functions add shape, not authorization. Reads are unwrapped rather than
 * defaulted to `[]`, per CLAUDE.md: a query that errors and falls back to
 * empty renders exactly like a healthy empty state.
 */

export type LogProgramRow = Database["public"]["Tables"]["log_programs"]["Row"];
export type LogClockTemplateRow = Database["public"]["Tables"]["log_clock_templates"]["Row"];
export type LogClockVersionRow = Database["public"]["Tables"]["log_clock_versions"]["Row"];
export type LogClockSlotRow = Database["public"]["Tables"]["log_clock_slots"]["Row"];
export type LogScheduleRow = Database["public"]["Tables"]["log_schedule"]["Row"];

export async function listPrograms(): Promise<LogProgramRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(await supabase.from("log_programs").select("*").order("name"), "the programs") ?? []
  );
}

export async function getProgram(id: string): Promise<LogProgramRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("log_programs").select("*").eq("id", id).maybeSingle(),
    "this program",
  );
}

export async function listClockTemplates(): Promise<LogClockTemplateRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.from("log_clock_templates").select("*").order("name"),
      "the clock templates",
    ) ?? []
  );
}

export interface ClockVersionWithSlots extends LogClockVersionRow {
  slots: LogClockSlotRow[];
}

export interface ClockTemplateDetail extends LogClockTemplateRow {
  versions: ClockVersionWithSlots[];
}

/** A template plus every version it has ever had, each with its own slots, newest first. */
export async function getClockTemplateDetail(id: string): Promise<ClockTemplateDetail | null> {
  const supabase = await createClient();
  const template = unwrapRead(
    await supabase.from("log_clock_templates").select("*").eq("id", id).maybeSingle(),
    "this clock template",
  );
  if (!template) return null;

  const versions =
    unwrapRead(
      await supabase
        .from("log_clock_versions")
        .select("*")
        .eq("clock_template_id", id)
        .order("effective_from", { ascending: false }),
      "this clock template's versions",
    ) ?? [];

  if (versions.length === 0) return { ...template, versions: [] };

  const slots =
    unwrapRead(
      await supabase
        .from("log_clock_slots")
        .select("*")
        .in(
          "clock_version_id",
          versions.map((version) => version.id),
        )
        .order("position"),
      "this clock template's slots",
    ) ?? [];

  const slotsByVersion = new Map<string, LogClockSlotRow[]>();
  for (const slot of slots) {
    const existing = slotsByVersion.get(slot.clock_version_id);
    if (existing) existing.push(slot);
    else slotsByVersion.set(slot.clock_version_id, [slot]);
  }

  return {
    ...template,
    versions: versions.map((version) => ({
      ...version,
      slots: slotsByVersion.get(version.id) ?? [],
    })),
  };
}

export interface ScheduleEntryWithNames extends LogScheduleRow {
  programName: string;
  clockTemplateName: string;
}

/** Every schedule entry, with the program/clock template names the screens display. */
export async function listScheduleEntries(): Promise<ScheduleEntryWithNames[]> {
  const supabase = await createClient();
  const [entries, programs, templates] = await Promise.all([
    unwrapRead(
      await supabase.from("log_schedule").select("*").order("start_date", { ascending: false }),
      "the schedule",
    ) ?? [],
    listPrograms(),
    listClockTemplates(),
  ]);

  const programNameById = new Map(programs.map((program) => [program.id, program.name]));
  const templateNameById = new Map(templates.map((template) => [template.id, template.name]));

  return entries.map((entry) => ({
    ...entry,
    programName: programNameById.get(entry.program_id) ?? "Unknown program",
    clockTemplateName: templateNameById.get(entry.clock_template_id) ?? "Unknown clock",
  }));
}

/** Schedule entries for one program, most recent start date first. */
export async function listScheduleEntriesForProgram(programId: string): Promise<LogScheduleRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("log_schedule")
        .select("*")
        .eq("program_id", programId)
        .order("start_date", { ascending: false }),
      "this program's schedule",
    ) ?? []
  );
}

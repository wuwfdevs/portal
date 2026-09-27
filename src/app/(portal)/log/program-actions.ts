"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogProducer } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { LogProgramKind, LogScheduleEntryType } from "@/lib/database.types";

const LIST_PATH = "/log/programs";
/** The list with the inline "New program" card open — where a create failure lands. */
const NEW_PROGRAM_PATH = `${LIST_PATH}?new=1`;

function programPath(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optionalField(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === "" ? null : value;
}

const PROGRAM_KINDS: LogProgramKind[] = ["recurring", "special"];

export async function createProgram(formData: FormData): Promise<void> {
  const { profile } = await assertLogProducer();
  const name = field(formData, "name");
  if (name === "") failWith(NEW_PROGRAM_PATH, "Give the program a name.");
  const kind = field(formData, "kind") as LogProgramKind;
  if (!PROGRAM_KINDS.includes(kind)) {
    failWith(NEW_PROGRAM_PATH, "That is not a recognized program kind.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_programs")
    .insert({
      name,
      description: optionalField(formData, "description"),
      kind,
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, NEW_PROGRAM_PATH, "Could not create the program");
  if (!data) failWith(NEW_PROGRAM_PATH, "Could not create the program.");

  revalidatePath(LIST_PATH);
  revalidatePath("/log");
  redirect(programPath(data.id));
}

const ENTRY_TYPES: LogScheduleEntryType[] = ["recurring", "override", "holiday"];

/** Posted from /log/programs/[id]/schedule/new; a failure returns there, success lands on the program's page. */
export async function createScheduleEntry(formData: FormData): Promise<void> {
  const { profile } = await assertLogProducer();
  const programId = field(formData, "program_id");
  if (programId === "") failWith(LIST_PATH, "Choose a program to schedule.");
  const formPath = `${programPath(programId)}/schedule/new`;
  const clockTemplateId = field(formData, "clock_template_id");
  if (clockTemplateId === "") failWith(formPath, "Choose a clock template.");
  const entryType = field(formData, "entry_type") as LogScheduleEntryType;
  if (!ENTRY_TYPES.includes(entryType)) failWith(formPath, "That is not a recognized entry type.");
  const startDate = field(formData, "start_date");
  if (startDate === "") failWith(formPath, "Give the entry a start date.");
  const airTime = field(formData, "air_time");
  if (airTime === "") failWith(formPath, "Give the entry an air time.");
  const durationMinutes = Number.parseInt(field(formData, "duration_minutes"), 10);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    failWith(formPath, "Give the entry a duration greater than zero.");
  }

  const daysOfWeek = formData
    .getAll("days_of_week")
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value));

  const supabase = await createClient();
  const { error } = await supabase.from("log_schedule").insert({
    program_id: programId,
    clock_template_id: clockTemplateId,
    entry_type: entryType,
    days_of_week: daysOfWeek,
    start_date: startDate,
    end_date: optionalField(formData, "end_date"),
    effective_from: optionalField(formData, "effective_from") ?? startDate,
    air_time: airTime,
    duration_minutes: durationMinutes,
    notes: optionalField(formData, "notes"),
    created_by: profile.id,
  });
  failIfError(error, formPath, "Could not add the schedule entry");

  revalidatePath(LIST_PATH);
  revalidatePath(programPath(programId));
  revalidatePath("/log");
  redirect(`${programPath(programId)}?saved=scheduled`);
}

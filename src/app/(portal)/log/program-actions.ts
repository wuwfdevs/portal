"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertProgramDirector } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { parseNprMapping } from "@/lib/log/program-npr";
import { stationTodayISO } from "@/lib/log/timezone";
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
  const { profile } = await assertProgramDirector();
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

type ScheduleEntryFields = {
  programId: string;
  clockTemplateId: string;
  entryType: LogScheduleEntryType;
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  airTime: string;
  durationMinutes: number;
  notes: string | null;
};

/** Reads and validates the schedule-entry form shared by create and edit; a bad field returns to `formPath` with a message. */
function readScheduleEntryFields(formData: FormData, formPath: string): ScheduleEntryFields {
  const programId = field(formData, "program_id");
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
  return {
    programId,
    clockTemplateId,
    entryType,
    daysOfWeek,
    startDate,
    endDate: optionalField(formData, "end_date"),
    airTime,
    durationMinutes,
    notes: optionalField(formData, "notes"),
  };
}

/** Posted from /log/programs/[id]/schedule/new; a failure returns there, success lands on the program's page. */
export async function createScheduleEntry(formData: FormData): Promise<void> {
  const { profile } = await assertProgramDirector();
  const programId = field(formData, "program_id");
  if (programId === "") failWith(LIST_PATH, "Choose a program to schedule.");
  const formPath = `${programPath(programId)}/schedule/new`;
  const fields = readScheduleEntryFields(formData, formPath);

  const supabase = await createClient();
  const { error } = await supabase.from("log_schedule").insert({
    program_id: programId,
    clock_template_id: fields.clockTemplateId,
    entry_type: fields.entryType,
    days_of_week: fields.daysOfWeek,
    start_date: fields.startDate,
    end_date: fields.endDate,
    effective_from: optionalField(formData, "effective_from") ?? fields.startDate,
    air_time: fields.airTime,
    duration_minutes: fields.durationMinutes,
    notes: fields.notes,
    created_by: profile.id,
  });
  failIfError(error, formPath, "Could not add the schedule entry");

  revalidatePath(LIST_PATH);
  revalidatePath(programPath(programId));
  revalidatePath("/log");
  redirect(`${programPath(programId)}?saved=scheduled`);
}

/**
 * Posted from /log/programs/[id]/schedule/[entryId]/edit — "Edit entry" and
 * "Change clock" both land there. `effective_from` is left as it was: it
 * records when the entry took effect, not something an edit rewrites.
 */
export async function updateScheduleEntry(formData: FormData): Promise<void> {
  await assertProgramDirector();
  const programId = field(formData, "program_id");
  const entryId = field(formData, "entry_id");
  if (programId === "" || entryId === "") failWith(LIST_PATH, "Choose a schedule entry to edit.");
  const formPath = `${programPath(programId)}/schedule/${entryId}/edit`;
  const fields = readScheduleEntryFields(formData, formPath);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_schedule")
    .update({
      clock_template_id: fields.clockTemplateId,
      entry_type: fields.entryType,
      days_of_week: fields.daysOfWeek,
      start_date: fields.startDate,
      end_date: fields.endDate,
      air_time: fields.airTime,
      duration_minutes: fields.durationMinutes,
      notes: fields.notes,
    })
    .eq("id", entryId)
    .eq("program_id", programId)
    .select("id");
  failIfError(error, formPath, "Could not save the schedule entry");
  // RLS turns an update it forbids into zero matched rows, not an error.
  if (!data || data.length === 0) failWith(formPath, "Could not save the schedule entry.");

  revalidatePath(LIST_PATH);
  revalidatePath(programPath(programId));
  revalidatePath("/log");
  redirect(`${programPath(programId)}?saved=entry`);
}

/**
 * Posted from the program page's in-place Details edit (`?edit=1`). Changing
 * the NPR collection clears the program's saved NPR episodes from today on, so
 * the next read fetches the new collection instead of showing the old one's
 * stories until they go stale; earlier dates keep the episodes they aired with.
 */
export async function updateProgram(formData: FormData): Promise<void> {
  await assertProgramDirector();
  const id = field(formData, "id");
  const editPath = `${programPath(id)}?edit=1`;
  const name = field(formData, "name");
  if (name === "") failWith(editPath, "Give the program a name.");
  const kind = field(formData, "kind") as LogProgramKind;
  if (!PROGRAM_KINDS.includes(kind)) failWith(editPath, "That is not a recognized program kind.");
  const npr = parseNprMapping(
    field(formData, "npr_collection_id"),
    field(formData, "npr_feed_start_hour_et"),
  );
  if (!npr.ok) failWith(editPath, npr.error);

  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("log_programs")
    .select("npr_collection_id")
    .eq("id", id)
    .maybeSingle();
  failIfError(readError, editPath, "Could not read the program");
  if (!before) failWith(editPath, "Could not find that program.");

  const { data, error } = await supabase
    .from("log_programs")
    .update({
      name,
      kind,
      description: optionalField(formData, "description"),
      npr_collection_id: npr.collectionId,
      npr_feed_start_hour_et: npr.feedStartHourEt,
    })
    .eq("id", id)
    .select("id");
  failIfError(error, editPath, "Could not save the program");
  // RLS turns an update it forbids into zero matched rows, not an error.
  if (!data || data.length === 0) failWith(editPath, "Could not save the program.");

  if (before.npr_collection_id !== npr.collectionId) {
    const { error: clearError } = await supabase
      .from("log_npr_episodes")
      .delete()
      .eq("program_id", id)
      .gte("show_date", stationTodayISO());
    failIfError(
      clearError,
      programPath(id),
      "The program was saved, but its old NPR stories could not be cleared",
    );
  }

  revalidatePath(LIST_PATH);
  revalidatePath(programPath(id));
  revalidatePath("/log");
  revalidatePath("/log/sources/npr");
  redirect(`${programPath(id)}?saved=program`);
}

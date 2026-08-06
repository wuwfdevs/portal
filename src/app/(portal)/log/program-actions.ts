"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogProducer } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import type { LogProgramKind, LogScheduleEntryType } from "@/lib/database.types";

const LIST_PATH = "/log/programs";

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
  if (name === "") failWith(LIST_PATH, "Give the program a name.");
  const kind = field(formData, "kind") as LogProgramKind;
  if (!PROGRAM_KINDS.includes(kind)) failWith(LIST_PATH, "That is not a recognized program kind.");

  const supabase = await createClient();
  const { error } = await supabase.from("log_programs").insert({
    name,
    description: optionalField(formData, "description"),
    kind,
    created_by: profile.id,
  });
  failIfError(error, LIST_PATH, "Could not create the program");

  revalidatePath(LIST_PATH);
  revalidatePath("/log");
  redirect(LIST_PATH);
}

const ENTRY_TYPES: LogScheduleEntryType[] = ["recurring", "override", "holiday"];

export async function createScheduleEntry(formData: FormData): Promise<void> {
  const { profile } = await assertLogProducer();
  const programId = field(formData, "program_id");
  const clockTemplateId = field(formData, "clock_template_id");
  if (programId === "" || clockTemplateId === "") {
    failWith(LIST_PATH, "Choose a program and a clock template.");
  }
  const entryType = field(formData, "entry_type") as LogScheduleEntryType;
  if (!ENTRY_TYPES.includes(entryType)) failWith(LIST_PATH, "That is not a recognized entry type.");
  const startDate = field(formData, "start_date");
  if (startDate === "") failWith(LIST_PATH, "Give the entry a start date.");

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
    notes: optionalField(formData, "notes"),
    created_by: profile.id,
  });
  failIfError(error, LIST_PATH, "Could not add the schedule entry");

  revalidatePath(LIST_PATH);
  revalidatePath("/log");
  redirect(LIST_PATH);
}

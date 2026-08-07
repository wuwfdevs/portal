"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertLogAccess } from "@/lib/log/access";
import { refreshNprEpisodeForProgramOnDate } from "@/lib/log/npr";
import { failWith } from "@/lib/editorial/action-result";

/** Manual "Refresh" button on /log/npr — any member, same as reading it (Workflow D, docs/log-design.md §3). */
export async function refreshNprEpisodeAction(formData: FormData): Promise<void> {
  await assertLogAccess();
  const programId = String(formData.get("program_id") ?? "").trim();
  const showDate = String(formData.get("show_date") ?? "").trim();
  if (programId === "" || showDate === "") failWith("/log/npr", "Choose a program and a date first.");
  const path = `/log/npr?program=${programId}&date=${showDate}`;

  const { error } = await refreshNprEpisodeForProgramOnDate(programId, showDate);
  if (error) failWith(path, error);

  revalidatePath("/log/npr");
  redirect(path);
}

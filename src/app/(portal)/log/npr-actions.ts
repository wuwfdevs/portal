"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertLogAccess } from "@/lib/log/access";
import { refreshNprRundownForProgram } from "@/lib/log/npr";
import { failWith } from "@/lib/editorial/action-result";

/** Manual "Refresh" button on /log/npr — any member, same as reading it (Workflow D, docs/log-design.md §3). */
export async function refreshNprRundownAction(formData: FormData): Promise<void> {
  await assertLogAccess();
  const programId = String(formData.get("program_id") ?? "").trim();
  const path = `/log/npr?program=${programId}`;
  if (programId === "") failWith("/log/npr", "Choose a program first.");

  const { error } = await refreshNprRundownForProgram(programId);
  if (error) failWith(path, error);

  revalidatePath("/log/npr");
  redirect(path);
}

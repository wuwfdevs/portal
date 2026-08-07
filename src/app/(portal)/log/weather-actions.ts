"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertLogAccess } from "@/lib/log/access";
import { refreshWeatherReading } from "@/lib/log/weather";
import { failWith } from "@/lib/editorial/action-result";

const PATH = "/log/weather";

/** Manual "Refresh" button on /log/weather — any member, same as reading it (Workflow D, docs/log-design.md §3). */
export async function refreshWeatherAction(): Promise<void> {
  await assertLogAccess();

  const { error } = await refreshWeatherReading();
  if (error) failWith(PATH, error);

  revalidatePath(PATH);
  redirect(PATH);
}

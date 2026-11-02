"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertLogAccess } from "@/lib/log/access";
import { refreshWeatherReading } from "@/lib/log/weather";
import { failWith } from "@/lib/editorial/action-result";

const WEATHER_PATH = "/log/sources/weather";
const OVERVIEW_PATH = "/log/sources";

/**
 * Manual "Refresh" button on the weather source page and on the Sources
 * overview's weather card — any member, same as reading it (Workflow D,
 * docs/log-design.md §3). `return_to` picks which of the two to come back to;
 * anything else falls back to the weather page.
 */
export async function refreshWeatherAction(formData: FormData): Promise<void> {
  await assertLogAccess();
  const returnTo = formData.get("return_to") === OVERVIEW_PATH ? OVERVIEW_PATH : WEATHER_PATH;

  const { error } = await refreshWeatherReading();
  if (error) failWith(returnTo, error);

  revalidatePath(WEATHER_PATH);
  revalidatePath(OVERVIEW_PATH);
  redirect(returnTo);
}

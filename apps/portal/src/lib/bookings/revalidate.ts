// Which Bookings screens show what a write changed, written once. A project
// (request) write and a calendar write touch overlapping screens: the dashboard
// counts both, the calendar shows every booking a request holds, the term report
// totals requests, settlements and the plan's capacity, and a request's page shows
// its dates. Before this each action file kept its own list and they had drifted
// (requests skipped the report; settlement skipped the calendar).

import { revalidatePath } from "next/cache";
import { BOOKINGS_PATH, CALENDAR_PATH, PLAN_PATH, REQUESTS_PATH, requestHref } from "./paths";

export const REPORT_PATH = `${BOOKINGS_PATH}/report`;

/** After a request, estimate, date or settlement write. */
export function revalidateRequestScreens(projectId?: string): void {
  revalidatePath(BOOKINGS_PATH);
  revalidatePath(REQUESTS_PATH);
  revalidatePath(CALENDAR_PATH);
  revalidatePath(REPORT_PATH);
  if (projectId) revalidatePath(requestHref(projectId));
}

/**
 * After a term plan, capacity, resource, blackout, hold or booking write. A booking
 * released or confirmed here may belong to a request, so every request page is
 * refreshed too.
 */
export function revalidateCalendarScreens(): void {
  revalidatePath(BOOKINGS_PATH);
  revalidatePath(CALENDAR_PATH);
  revalidatePath(PLAN_PATH);
  revalidatePath(REPORT_PATH);
  revalidatePath(`${REQUESTS_PATH}/[id]`, "page");
}

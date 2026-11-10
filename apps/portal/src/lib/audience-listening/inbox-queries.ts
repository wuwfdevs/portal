import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database, AlHostRequestState, AlInboxState } from "@/lib/database.types";
import { pageRange } from "@/lib/pagination";
import {
  HOST_REQUEST_STATES,
  HOST_REQUEST_WARN_AFTER_DAYS,
  INBOX_STATES,
  hostRequestMatches,
  inboxMatches,
  type HostRequestFilter,
  type InboxFilter,
} from "./inboxes";

/**
 * Staff-side reads for Ask WUWF and host requests. Through the RLS-scoped server client, so
 * `private.has_audience_listening_access` decides what comes back; these add shape and paging, not authorization.
 * A failed read throws (caught by the route's error.tsx) rather than showing an empty list.
 */

export type AlInboxItem = Database["public"]["Tables"]["al_inbox"]["Row"];
export type AlHostRequest = Database["public"]["Tables"]["al_host_requests"]["Row"];

const PAGE_SIZE = 20;
export const INBOX_PAGE_SIZE = PAGE_SIZE;

export interface InboxPage<Row, State extends string> {
  rows: Row[];
  /** Rows matching the filter, across all pages. */
  total: number;
  /** Rows per state, for the filter chips. */
  counts: Record<State, number>;
}

async function stateCounts<State extends string>(table: "al_inbox" | "al_host_requests", states: readonly State[]): Promise<Record<State, number>> {
  const supabase = await createClient();
  const entries = await Promise.all(
    states.map(async (state) => {
      // The table is one of two, whose state columns are different unions; the caller passes that table's own states.
      const result = await supabase.from(table).select("id", { count: "exact", head: true }).eq("state", state as AlInboxState & AlHostRequestState);
      unwrapRead(result, `the ${table} count`);
      return [state, result.count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<State, number>;
}

/** Newest first for Ask WUWF; a person reads them in the order they came in. */
export async function listInboxPage(filter: InboxFilter, page: number): Promise<InboxPage<AlInboxItem, AlInboxState>> {
  const supabase = await createClient();
  const states = INBOX_STATES.filter((s) => inboxMatches(s, filter));
  const { from, to } = pageRange(page, PAGE_SIZE);
  const [result, counts] = await Promise.all([
    supabase.from("al_inbox").select("*", { count: "exact" }).in("state", states).order("created_at", { ascending: false }).range(from, to),
    stateCounts("al_inbox", INBOX_STATES),
  ]);
  const rows = unwrapRead(result, "Ask WUWF") ?? [];
  return { rows, total: result.count ?? 0, counts };
}

/** Oldest first for host requests: the one waiting longest is the one the site promised an answer to. */
export async function listHostRequestsPage(filter: HostRequestFilter, page: number): Promise<InboxPage<AlHostRequest, AlHostRequestState>> {
  const supabase = await createClient();
  const states = HOST_REQUEST_STATES.filter((s) => hostRequestMatches(s, filter));
  const { from, to } = pageRange(page, PAGE_SIZE);
  const [result, counts] = await Promise.all([
    supabase.from("al_host_requests").select("*", { count: "exact" }).in("state", states).order("created_at", { ascending: true }).range(from, to),
    stateCounts("al_host_requests", HOST_REQUEST_STATES),
  ]);
  const rows = unwrapRead(result, "host requests") ?? [];
  return { rows, total: result.count ?? 0, counts };
}

export interface InboxWorkCounts {
  inboxNew: number;
  hostNew: number;
  hostOverdue: number;
}

/**
 * What waits for a person, for the section's navigation: new Ask WUWF items, new host requests, and those past the warning.
 * A courtesy on every page of the tool, so a failure here is logged and the counts are left off rather than taking the query
 * list down with it (the pages that are about the inboxes still read strictly and say what failed).
 */
export async function getInboxWorkCounts(now: Date = new Date()): Promise<InboxWorkCounts | null> {
  try {
    const supabase = await createClient();
    const cutoff = new Date(now.getTime() - HOST_REQUEST_WARN_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [inboxNew, hostNew, hostOverdue] = await Promise.all([
      supabase.from("al_inbox").select("id", { count: "exact", head: true }).eq("state", "new"),
      supabase.from("al_host_requests").select("id", { count: "exact", head: true }).eq("state", "new"),
      supabase.from("al_host_requests").select("id", { count: "exact", head: true }).eq("state", "new").lte("created_at", cutoff),
    ]);
    unwrapRead(inboxNew, "the Ask WUWF count");
    unwrapRead(hostNew, "the host request count");
    unwrapRead(hostOverdue, "the overdue host request count");
    return { inboxNew: inboxNew.count ?? 0, hostNew: hostNew.count ?? 0, hostOverdue: hostOverdue.count ?? 0 };
  } catch (error) {
    console.error("Audience Listening: could not count the inboxes for the navigation:", error);
    return null;
  }
}

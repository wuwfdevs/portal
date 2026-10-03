import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";

export interface DadReleaseDay {
  dateISO: string;
  /** The latest release for the day, or null when nothing has been released. */
  latest: { version: number; releasedAt: string; eventCount: number } | null;
}

/**
 * The latest DAD log release for each of the given days, for Traffic's
 * dashboard (docs/broadcast-roles.md §5). Reads log_dad_exports, which only
 * On Air members can see; the caller shows this only to them.
 */
export async function listDadReleaseDays(dates: string[]): Promise<DadReleaseDay[]> {
  if (dates.length === 0) return [];
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("log_dad_exports")
        .select("air_date, version, released_at, event_count")
        .in("air_date", dates)
        .order("version", { ascending: false }),
      "the DAD log releases",
    ) ?? [];
  return dates.map((dateISO) => {
    const row = rows.find((candidate) => candidate.air_date === dateISO);
    return {
      dateISO,
      latest: row
        ? { version: row.version, releasedAt: row.released_at, eventCount: row.event_count }
        : null,
    };
  });
}

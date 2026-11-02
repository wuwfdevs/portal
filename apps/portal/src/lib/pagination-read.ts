import type { PostgrestError } from "@supabase/supabase-js";
import { unwrapRead } from "@/lib/read-result";

/**
 * Turns one ranged list read (`.select(..., { count: "exact" }).range(a, b)`)
 * into `{ rows, total }`.
 *
 * Asking for a page past the end is not an empty page to PostgREST: it answers
 * 416 (PGRST103) with no count. A stale bookmark (`?page=9` after rows were
 * deleted) must not throw to the error boundary, so that one error reports no
 * rows and the real total — from `countAll`, the list's own head-count query —
 * and the screen redirects to the last page (`isPastLastPage`). Every other
 * error throws like any read (`unwrapRead`).
 */
export async function readPage<Row>(
  result: { data: Row[] | null; count: number | null; error: PostgrestError | null },
  what: string,
  countAll: () => Promise<number>,
): Promise<{ rows: Row[]; total: number }> {
  if (result.error?.code === "PGRST103") {
    return { rows: [], total: await countAll() };
  }
  const rows = unwrapRead(result, what) ?? [];
  return { rows, total: result.count ?? 0 };
}

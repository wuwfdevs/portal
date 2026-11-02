import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";

/**
 * Display names for profile ids (authors, owners, assignees, voters) — the
 * one place the portal reads them. Returns an id → name map; an id with no
 * visible profile is simply absent, so callers fall back to their own "—".
 *
 * Profile RLS lets most members read only some rows, so a short result is
 * normal and never an error. A genuine read failure throws like any read; a
 * screen where the names are only decoration (a list's "by Dana" line) passes
 * `degrade: true` to render without them instead of failing the page — the
 * error is still logged, never swallowed.
 */
export async function getDisplayNames(
  ids: Iterable<string | null | undefined>,
  options: { degrade?: boolean } = {},
): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const result = await supabase.from("profiles").select("id, display_name").in("id", unique);
  if (result.error && options.degrade) {
    console.error("Read failed (member names):", result.error);
    return new Map();
  }
  const rows = unwrapRead(result, "member names") ?? [];
  return new Map(rows.map((row) => [row.id, row.display_name]));
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getVersionDetail, type BkVersionRow } from "./queries";
import { cardForVersion, snapshotLinesForCard } from "./version-card";

/**
 * Replace a version's bk_rate_card_lines with the card its rows compute to.
 * Called when a version is put in use or adopted, so an estimate priced later
 * keeps the rate it was priced at. Returns an error message rather than
 * throwing, so the caller can bounce it back to the screen.
 */
export async function writeRateCardSnapshot(version: BkVersionRow): Promise<string | null> {
  const detail = await getVersionDetail(version);
  const computed = cardForVersion(detail);
  if (!computed.ok) {
    return `This version can't be priced yet; it is missing: ${computed.missing.join(", ")}.`;
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("bk_rate_card_lines")
    .delete()
    .eq("version_id", version.id);
  if (deleteError) {
    console.error("Could not clear the rate card snapshot", deleteError);
    return `Could not record the rate card: ${deleteError.message}`;
  }
  const { error: insertError } = await supabase
    .from("bk_rate_card_lines")
    .insert(snapshotLinesForCard(computed.card, version.id));
  if (insertError) {
    console.error("Could not write the rate card snapshot", insertError);
    return `Could not record the rate card: ${insertError.message}`;
  }
  return null;
}

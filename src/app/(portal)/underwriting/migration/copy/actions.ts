"use server";

// Seeding active copy from RadioTraffic (docs/underwriting-traffic-
// redesign.md §15). One non-redirecting action: the review screen keeps its
// state (the file, the answers) and shows the result in place. The plan the
// screen showed is recomputed here from the same file and answers against a
// fresh read, so the screen is never trusted for what gets written.

import { revalidatePath } from "next/cache";
import { assertAgreementMigrationAccess } from "@/lib/underwriting/access";
import {
  parseLegacyCopyAnswers,
  parseLegacyCopyCsv,
  planLegacyCopyImport,
} from "@/lib/underwriting/legacy-copy";
import {
  executeLegacyCopyImport,
  loadLegacyCopySnapshot,
  type LegacyCopyImportResult,
} from "@/lib/underwriting/legacy-copy-import";

const MAX_CSV_CHARACTERS = 1024 * 1024;

export type LegacyCopyImportResponse =
  { ok: true; data: LegacyCopyImportResult } | { ok: false; error: string };

export async function importLegacyCopy(input: {
  csv: string;
  answers: string;
  fileName: string;
}): Promise<LegacyCopyImportResponse> {
  const { profile } = await assertAgreementMigrationAccess();
  if (typeof input.csv !== "string" || input.csv.trim() === "")
    return { ok: false, error: "Choose the export's CSV file first." };
  if (input.csv.length > MAX_CSV_CHARACTERS) return { ok: false, error: "That file is over 1 MB." };

  const parsed = parseLegacyCopyCsv(input.csv);
  if (parsed.rows.length === 0)
    return { ok: false, error: parsed.errors[0]?.message ?? "No rows to import." };

  try {
    const snapshot = await loadLegacyCopySnapshot();
    const plan = planLegacyCopyImport(parsed.rows, snapshot, parseLegacyCopyAnswers(input.answers));
    if (plan.counts.ready === 0)
      return {
        ok: false,
        error:
          "Nothing is ready to import — every row is already in the portal, left out, or waiting on a question.",
      };
    const result = await executeLegacyCopyImport(
      plan,
      snapshot,
      profile.id,
      String(input.fileName ?? "").slice(0, 200) || "RadioTraffic export",
    );
    revalidatePath("/underwriting/copy");
    revalidatePath("/underwriting/contracts");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The import failed." };
  }
}

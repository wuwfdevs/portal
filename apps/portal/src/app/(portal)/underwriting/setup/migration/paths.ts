// Where the migration's screens live. A batch is named by its label (the
// migration table has no batch row of its own), carried in `b`.

import { withQuery } from "@/lib/paths";

export const MIGRATION_PATH = "/underwriting/setup/migration";
export const NEW_BATCH_PATH = `${MIGRATION_PATH}/new`;

/** The batch's review page. */
export function batchPath(label: string, query: Record<string, string | undefined> = {}): string {
  return withQuery(`${MIGRATION_PATH}/batch`, { b: label, ...query });
}

/** The batch's documents step, where its entries are matched to files and run. */
export function batchDocumentsPath(
  label: string,
  query: Record<string, string | undefined> = {},
): string {
  return withQuery(`${MIGRATION_PATH}/batch/documents`, { b: label, ...query });
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogProducer } from "@/lib/log/access";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { hasBlockingIssues, rowsFromEvents, serializeDadLog } from "@/lib/log/dad-export";
import { loadDadDay, sha256 } from "@/lib/log/dad-export-queries";
import { isValidDateISO } from "@/lib/log/week-layout";

const EXPORTS_BUCKET = "log-exports";

/**
 * Releases a day's DAD log as its next version: refused while anything in
 * the automated breaks can't play, spot numbers minted for items released
 * for the first time, the file stored with its hash, and the release
 * audited as `log.dad_log.released`. A release is never edited — a change
 * afterwards is a new version.
 */
export async function releaseDadLog(formData: FormData): Promise<void> {
  const { profile } = await assertLogProducer();
  const date = String(formData.get("date") ?? "");
  if (!isValidDateISO(date)) failWith("/log/dad-log", "That isn't a date.");
  const path = `/log/dad-log?date=${date}`;

  let day = await loadDadDay(date);
  if (hasBlockingIssues(day.issues)) {
    failWith(path, "Fix what can't play from DAD before releasing.");
  }
  if (day.events.length === 0) {
    failWith(path, "There's nothing in automated hours on this day to release.");
  }

  const supabase = await createClient();
  const unnumbered = day.events.filter((event) => event.spotNumber === null);
  if (unnumbered.length > 0) {
    const { data, error } = await supabase.rpc("log_assign_dad_spot_numbers", {
      p_item_ids: unnumbered.map((event) => event.itemId),
    });
    failIfError(error, path, "Could not number the spots");
    if (!data || "error" in data) failWith(path, "Could not number the spots.");
    day = await loadDadDay(date);
    if (hasBlockingIssues(day.issues) || day.events.some((event) => event.spotNumber === null)) {
      failWith(path, "The rundowns changed while releasing. Check the list and try again.");
    }
  }

  const content = serializeDadLog(rowsFromEvents(day.events));
  const hash = sha256(content);
  const version = (day.releases[0]?.version ?? 0) + 1;
  const filePath = `${date}/v${version}/${day.fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .upload(filePath, new Blob([Buffer.from(content, "latin1")], { type: "text/plain" }));
  if (uploadError) {
    console.error("Could not store the DAD log:", uploadError);
    failWith(path, `Could not store the file: ${uploadError.message}`);
  }

  const warnings = day.issues.filter((issue) => issue.severity === "warning");
  const { data: release, error } = await supabase
    .from("log_dad_exports")
    .insert({
      air_date: date,
      version,
      file_name: day.fileName,
      file_path: filePath,
      sha256: hash,
      event_count: day.events.length,
      warnings: warnings.map((issue) => issue.message),
      released_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, path, "Could not record the release");

  await logAuditEvent({
    actorId: profile.id,
    action: "log.dad_log.released",
    targetType: "log_dad_exports",
    targetId: release?.id,
    metadata: { air_date: date, version, event_count: day.events.length, sha256: hash },
  });

  revalidatePath("/log/dad-log");
  redirect(`${path}&released=${version}`);
}

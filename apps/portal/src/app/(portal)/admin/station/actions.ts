"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAdministrator } from "@/lib/auth/authz";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";

const STATION_PATH = "/admin/station";

/** The text fields an administrator edits, with the longest value each accepts (the table's own limits). */
const FIELDS = {
  display_name: 120,
  short_name: 40,
  call_sign: 40,
  licensee: 160,
  primary_city: 80,
  region: 80,
  coverage_area: 160,
  mailing_address: 400,
  support_email: 200,
  public_attribution: 200,
  public_notice_text: 300,
  public_notice_link_label: 160,
  public_notice_link_url: 300,
} as const;

type FieldName = keyof typeof FIELDS;

/**
 * Saves the station's identity. The time zone is not on this form: the TypeScript half of the station's
 * clock is deployment configuration (lib/station-time.ts), so changing the database half alone would put
 * the two out of step. It is set at install.
 */
export async function updateStation(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();

  const values = {} as Record<FieldName, string | null>;
  for (const [name, max] of Object.entries(FIELDS) as [FieldName, number][]) {
    const raw = String(formData.get(name) ?? "").trim();
    if (raw.length > max)
      failWith(
        STATION_PATH,
        `That is too long: keep ${name.replaceAll("_", " ")} under ${max} characters.`,
      );
    values[name] = raw === "" ? null : raw;
  }

  const email = values.support_email;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    failWith(STATION_PATH, "The support email does not look like an email address.");
  }

  // A link people click on a public page: a path on this site, or https. Never javascript: or http:.
  const url = values.public_notice_link_url;
  if (url && !/^(\/(?!\/)|https:\/\/)/.test(url)) {
    failWith(STATION_PATH, "The notice link must start with / (a page on this site) or https://.");
  }
  if ((values.public_notice_link_label === null) !== (url === null)) {
    failWith(STATION_PATH, "A notice link needs both its words and its address, or neither.");
  }

  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("station_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  failIfError(readError, STATION_PATH, "Could not read the station settings");

  const { error } = await supabase
    .from("station_settings")
    .update({ ...values, updated_by: admin.id })
    .eq("id", true);
  failIfError(error, STATION_PATH, "Could not save the station settings");

  const changed = (Object.keys(FIELDS) as FieldName[]).filter(
    (name) => (before?.[name] ?? null) !== values[name],
  );
  await logAuditEvent({
    actorId: admin.id,
    action: "station.updated",
    targetType: "station",
    // Which fields changed, never their contents.
    metadata: { changed },
  });

  redirect(`${STATION_PATH}?saved=1`);
}

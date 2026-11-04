"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAdministrator } from "@/lib/auth/authz";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import {
  coverageCountiesProblem,
  formatCoverageCounties,
  parseCoverageCounties,
} from "@/lib/log/weather-station";

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

  // Where the studio is, for the weather: both coordinates or neither, within range.
  const coordinate = (name: "latitude" | "longitude", limit: number): number | null => {
    const raw = String(formData.get(name) ?? "").trim();
    if (raw === "") return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || Math.abs(value) > limit) {
      failWith(STATION_PATH, `The ${name} must be a number between -${limit} and ${limit}.`);
    }
    return Math.round(value * 100000) / 100000;
  };
  const latitude = coordinate("latitude", 90);
  const longitude = coordinate("longitude", 180);
  if ((latitude === null) !== (longitude === null)) {
    failWith(STATION_PATH, "Give both the latitude and the longitude, or neither.");
  }
  const countiesText = String(formData.get("alert_counties") ?? "");
  const countiesProblem = coverageCountiesProblem(countiesText);
  if (countiesProblem) failWith(STATION_PATH, countiesProblem);
  const alertCounties = formatCoverageCounties(parseCoverageCounties(countiesText)) || null;

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
    .update({ ...values, latitude, longitude, alert_counties: alertCounties, updated_by: admin.id })
    .eq("id", true);
  failIfError(error, STATION_PATH, "Could not save the station settings");

  const changed: string[] = (Object.keys(FIELDS) as FieldName[]).filter(
    (name) => (before?.[name] ?? null) !== values[name],
  );
  if ((before?.latitude ?? null) !== latitude) changed.push("latitude");
  if ((before?.longitude ?? null) !== longitude) changed.push("longitude");
  if ((before?.alert_counties ?? null) !== alertCounties) changed.push("alert_counties");
  await logAuditEvent({
    actorId: admin.id,
    action: "station.updated",
    targetType: "station",
    // Which fields changed, never their contents.
    metadata: { changed },
  });

  redirect(`${STATION_PATH}?saved=1`);
}

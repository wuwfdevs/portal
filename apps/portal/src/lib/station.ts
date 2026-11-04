import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { stationZoneMismatch } from "@/lib/station-time";
import { stationProfileFrom, type StationProfile } from "@/lib/station-brand";
import type { Database } from "@/lib/database.types";

/**
 * The station this deployment serves: the single `public.station_settings` row, read once per request.
 * Identity text (name, call sign, address…) is nullable and unset until a station fills it in; callers
 * decide their own fallback rather than this module inventing one.
 *
 * Server-only because it reads through the signed-in user's session. The wall clock the TypeScript side
 * uses is NOT read from here — those functions are synchronous and also run in client components — it is
 * deployment configuration (lib/station-time.ts). `zoneMismatch` is how the two are kept honest.
 */
export type Station = Database["public"]["Tables"]["station_settings"]["Row"] & {
  /** A sentence when the database's time zone and this deployment's clock differ, else null. */
  zoneMismatch: string | null;
};

export const getStation = cache(async (): Promise<Station> => {
  const supabase = await createClient();
  const row = unwrapRead(
    await supabase.from("station_settings").select("*").eq("id", true).maybeSingle(),
    "the station settings",
  );
  if (!row) {
    throw new Error(
      "public.station_settings has no row; the migration that creates it was not applied.",
    );
  }
  return { ...row, zoneMismatch: stationZoneMismatch(row.time_zone) };
});

/**
 * What a screen may say about the station, for any visitor: signed in or not. Reads the narrow
 * `public.station_public_profile()` (names, city, support address, the public notice) rather than the
 * table, which only staff can read. Never throws: a station whose settings are unreadable gets the
 * neutral wording instead of a broken login page.
 */
export const getStationProfile = cache(async (): Promise<StationProfile> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("station_public_profile");
    if (error) {
      console.error("Could not read the station profile:", error);
      return stationProfileFrom(null);
    }
    return stationProfileFrom(data);
  } catch (error) {
    console.error("Could not read the station profile:", error);
    return stationProfileFrom(null);
  }
});

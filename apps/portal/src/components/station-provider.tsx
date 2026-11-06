"use client";

import { createContext, useContext, type ReactNode } from "react";
import { stationProfileFrom, type StationProfile } from "@/lib/station-brand";

/**
 * Hands the station's public profile to client components. The root layout reads it once per request
 * (lib/station.ts, getStationProfile) and provides it here; a server component calls that function
 * itself instead. With no provider (a test, an isolated render) the neutral wording applies, so a
 * component never needs a guard for "the station is not known".
 */
const StationContext = createContext<StationProfile>(stationProfileFrom(null));

export function StationProvider({
  profile,
  children,
}: {
  profile: StationProfile;
  children: ReactNode;
}) {
  return <StationContext.Provider value={profile}>{children}</StationContext.Provider>;
}

export function useStation(): StationProfile {
  return useContext(StationContext);
}

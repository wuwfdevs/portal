import type { Profile } from "@/lib/auth/session";

// Pure, dependency-free checks factored out of authz.ts so they're testable
// without pulling in "server-only" / Supabase server clients.

export function isActive(profile: Profile | null): profile is Profile {
  return profile !== null && profile.account_status === "active";
}

/** Whether the profile's platform role is administrator (ignores account status; see isActiveAdministrator). */
export function isPlatformAdministrator(profile: Pick<Profile, "platform_role">): boolean {
  return profile.platform_role === "administrator";
}

export function isActiveAdministrator(profile: Profile | null): boolean {
  return isActive(profile) && isPlatformAdministrator(profile);
}

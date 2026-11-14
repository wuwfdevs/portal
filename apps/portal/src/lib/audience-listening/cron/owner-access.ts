// Whether a campaign's owner may be the person a scheduled hand-off is made as. The normal check (lib/auth/authz canUseTool) asks the
// database as the signed-in user, and a scheduled run has none, so the same rule is applied here to rows the service client read:
// the tool is on, the person is active, and they hold a grant (or the tool is open to all active staff).

export interface OwnerAccessFacts {
  toolEnabled: boolean;
  /** `tools.default_access` of the Sourcework row. */
  toolDefaultAccess: string | null;
  profileActive: boolean;
  hasGrant: boolean;
}

export function ownerMayRun(facts: OwnerAccessFacts): boolean {
  if (!facts.toolEnabled || !facts.profileActive) return false;
  return facts.toolDefaultAccess === "approved_staff" ? true : facts.hasGrant;
}

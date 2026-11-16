// Who is told, and where (docs/notifications-design.md §4). Pure: the caller reads the facts, this decides, and notify() writes.

import type { NotificationTypeDef } from "./catalog";
import { resolveChannels, type StoredPreference } from "./preferences";

export interface RecipientFacts {
  id: string;
  /** `profiles.account_status = 'active'`. */
  active: boolean;
  /** Whether they can open the tool the type belongs to (`canUseTool`, restated for a caller with no session). */
  canOpenTool: boolean;
  stored?: StoredPreference;
}

export interface PlannedDelivery {
  recipientId: string;
  inApp: boolean;
  email: boolean;
}

/**
 * One delivery per person who should be told. Dropped: the person who acted (nobody is told of their own action), a repeated id, an
 * inactive account, a person who cannot open the tool, and anyone who turned both places off.
 */
export function planDeliveries(
  def: NotificationTypeDef,
  recipients: readonly RecipientFacts[],
  actorId: string | null,
): PlannedDelivery[] {
  const seen = new Set<string>();
  const plan: PlannedDelivery[] = [];
  for (const person of recipients) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    if (person.id === actorId || !person.active || !person.canOpenTool) continue;
    const channels = resolveChannels(def, person.stored);
    if (!channels.inApp && !channels.email) continue;
    plan.push({ recipientId: person.id, inApp: channels.inApp, email: channels.email });
  }
  return plan;
}

/** Whether a person can open a tool, from the registry row and their grants: the rule `canUseTool` applies, for a caller with no session. */
export function canOpenTool(facts: {
  toolEnabled: boolean;
  /** `grantRequiredForTool(tool)`: false when the tool is open to every active member. */
  grantRequired: boolean;
  hasGrant: boolean;
}): boolean {
  return facts.toolEnabled && (!facts.grantRequired || facts.hasGrant);
}

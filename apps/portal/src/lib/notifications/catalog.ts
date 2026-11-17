// The notification catalog (docs/notifications-design.md §2): every kind of event a person can be told about, keyed `<tool>.<event>`.
// A static manifest like `lib/modules.ts`, not an extension point: a tool that raises a new kind adds a line here in the same change.
// Pure. A stored preference for a type that is no longer listed is ignored, and a listed type with none uses its defaults, so adding or
// retiring a line needs no migration.

export interface NotificationTypeDef {
  /** `<tool>.<event>`; stored on every row, so never rename one in place. */
  key: string;
  /** `tools.key` of the tool it belongs to: a person is told only about a tool they can open. */
  toolKey: string;
  /** The heading it sits under on the preferences screen. */
  group: string;
  label: string;
  description: string;
  /**
   * Who is told, in words, shown on the preferences screen. A type is raised for the people it concerns (a request's author, a project's
   * owner), never "everyone who can open the tool": the tool that raises it works out the ids and hands them to `notify()`.
   */
  audience: string;
  defaults: { inApp: boolean; email: boolean };
}

export const NOTIFICATION_TYPES = [
  {
    key: "roadmap.status_changed",
    toolKey: "roadmap",
    group: "Roadmap",
    label: "A request of mine changes status",
    description:
      "When a curator moves a request you filed to another status, with the reason if it is declined.",
    audience: "The person who filed the request",
    defaults: { inApp: true, email: true },
  },
  {
    key: "roadmap.comment_added",
    toolKey: "roadmap",
    group: "Roadmap",
    label: "Someone comments on a request of mine",
    description: "When another person comments on a request you filed.",
    audience: "The person who filed the request",
    defaults: { inApp: true, email: false },
  },
] as const satisfies readonly NotificationTypeDef[];

export type NotificationTypeKey = (typeof NOTIFICATION_TYPES)[number]["key"];

const BY_KEY: ReadonlyMap<string, NotificationTypeDef> = new Map(
  NOTIFICATION_TYPES.map((def) => [def.key, def]),
);

export function getNotificationType(key: string): NotificationTypeDef | null {
  return BY_KEY.get(key) ?? null;
}

/** The catalog grouped for the preferences screen, in catalog order. */
export function notificationTypesByGroup(
  types: readonly NotificationTypeDef[] = NOTIFICATION_TYPES,
): { group: string; types: NotificationTypeDef[] }[] {
  const groups: { group: string; types: NotificationTypeDef[] }[] = [];
  for (const def of types) {
    const found = groups.find((entry) => entry.group === def.group);
    if (found) found.types.push(def);
    else groups.push({ group: def.group, types: [def] });
  }
  return groups;
}

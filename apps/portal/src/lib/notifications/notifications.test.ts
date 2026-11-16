import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  getNotificationType,
  notificationTypesByGroup,
  type NotificationTypeDef,
} from "./catalog";
import { notificationEmailText, notificationIdempotencyKey } from "./email-text";
import { canOpenTool, planDeliveries } from "./plan";
import {
  diffPreferences,
  emailFieldName,
  inAppFieldName,
  readPreferenceForm,
  resolveChannels,
} from "./preferences";
import { bellLabel, unreadBadge } from "./unread";

const status = getNotificationType("roadmap.status_changed")!;
const comment = getNotificationType("roadmap.comment_added")!;

describe("the catalog", () => {
  it("has unique keys shaped <tool>.<event>, each under its own tool", () => {
    const keys = NOTIFICATION_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const def of NOTIFICATION_TYPES) {
      expect(def.key).toMatch(/^[a-z0-9-]+\.[a-z_]+$/);
      expect(def.key.startsWith(`${def.toolKey}.`)).toBe(true);
      expect(def.label.length).toBeGreaterThan(0);
      // A type is raised for the people it concerns; saying who is part of the entry, shown on the preferences screen.
      expect(def.audience.trim().length).toBeGreaterThan(0);
    }
  });

  it("finds a type by key and says null for an unknown one", () => {
    expect(getNotificationType("roadmap.status_changed")?.toolKey).toBe("roadmap");
    expect(getNotificationType("nope.nothing")).toBeNull();
  });

  it("groups in catalog order", () => {
    const defs: NotificationTypeDef[] = [
      { ...status, group: "B" },
      { ...comment, group: "A" },
      { ...comment, key: "roadmap.other", group: "B" },
    ];
    expect(notificationTypesByGroup(defs).map((g) => [g.group, g.types.length])).toEqual([
      ["B", 2],
      ["A", 1],
    ]);
  });
});

describe("resolveChannels", () => {
  it("uses the default with nothing stored, and the stored choice otherwise", () => {
    expect(resolveChannels(status, undefined)).toEqual({ inApp: true, email: true });
    expect(resolveChannels(status, { type: status.key, in_app: false, email: true })).toEqual({
      inApp: false,
      email: true,
    });
  });
});

describe("diffPreferences", () => {
  const form = (entries: [string, { inApp: boolean; email: boolean }][]) => new Map(entries);

  it("stores only what differs from the default and removes what now matches", () => {
    const changes = diffPreferences(
      NOTIFICATION_TYPES,
      form([
        [status.key, { inApp: true, email: false }],
        [comment.key, { inApp: true, email: false }],
      ]),
    );
    expect(changes.upserts).toEqual([{ type: status.key, in_app: true, email: false }]);
    expect(changes.deletes).toEqual([comment.key]);
  });

  it("leaves alone a type the form did not carry", () => {
    expect(diffPreferences(NOTIFICATION_TYPES, form([]))).toEqual({ upserts: [], deletes: [] });
  });
});

describe("readPreferenceForm", () => {
  it("reads a ticked box as true and a missing one as false", () => {
    const ticked = new Set([inAppFieldName(status.key), emailFieldName(comment.key)]);
    const read = readPreferenceForm(NOTIFICATION_TYPES, (name) => ticked.has(name));
    expect(read.get(status.key)).toEqual({ inApp: true, email: false });
    expect(read.get(comment.key)).toEqual({ inApp: false, email: true });
  });
});

describe("planDeliveries", () => {
  const person = (
    id: string,
    over: Partial<Parameters<typeof planDeliveries>[1][number]> = {},
  ) => ({
    id,
    active: true,
    canOpenTool: true,
    ...over,
  });

  it("tells a person where their defaults say", () => {
    expect(planDeliveries(status, [person("a")], "actor")).toEqual([
      { recipientId: "a", inApp: true, email: true },
    ]);
    expect(planDeliveries(comment, [person("a")], "actor")).toEqual([
      { recipientId: "a", inApp: true, email: false },
    ]);
  });

  it("never tells the person who acted", () => {
    expect(planDeliveries(status, [person("actor")], "actor")).toEqual([]);
  });

  it("drops an inactive account, a person who cannot open the tool, and a repeat", () => {
    const plan = planDeliveries(
      status,
      [
        person("a", { active: false }),
        person("b", { canOpenTool: false }),
        person("c"),
        person("c"),
      ],
      null,
    );
    expect(plan.map((p) => p.recipientId)).toEqual(["c"]);
  });

  it("drops someone who turned both places off, and keeps email-only", () => {
    const off = { type: status.key, in_app: false, email: false };
    const emailOnly = { type: status.key, in_app: false, email: true };
    const plan = planDeliveries(
      status,
      [person("a", { stored: off }), person("b", { stored: emailOnly })],
      null,
    );
    expect(plan).toEqual([{ recipientId: "b", inApp: false, email: true }]);
  });
});

describe("canOpenTool", () => {
  it("needs the tool on, and a grant only when the tool requires one", () => {
    expect(canOpenTool({ toolEnabled: false, grantRequired: false, hasGrant: true })).toBe(false);
    expect(canOpenTool({ toolEnabled: true, grantRequired: false, hasGrant: false })).toBe(true);
    expect(canOpenTool({ toolEnabled: true, grantRequired: true, hasGrant: false })).toBe(false);
    expect(canOpenTool({ toolEnabled: true, grantRequired: true, hasGrant: true })).toBe(true);
  });
});

describe("notificationEmailText", () => {
  it("builds a subject, the body, the link and the way to stop", () => {
    const { subject, text } = notificationEmailText(
      { title: "Your request  moved", body: "It is now planned.", href: "/roadmap/1" },
      "https://tools.example.org/",
    );
    expect(subject).toBe("Your request moved");
    expect(text).toContain("It is now planned.");
    expect(text).toContain("Open it: https://tools.example.org/roadmap/1");
    expect(text).toContain("https://tools.example.org/notifications/preferences");
  });

  it("leaves out the link and body when there are none", () => {
    const { text } = notificationEmailText(
      { title: "Hi", body: " ", href: null },
      "https://x.test",
    );
    expect(text).not.toContain("Open it");
    expect(text.startsWith("Choose which")).toBe(true);
  });
});

describe("notificationIdempotencyKey", () => {
  it("is the same for every attempt at one notification and different between notifications", () => {
    expect(notificationIdempotencyKey("abc")).toBe(notificationIdempotencyKey("abc"));
    expect(notificationIdempotencyKey("abc")).not.toBe(notificationIdempotencyKey("abd"));
  });
});

describe("the bell", () => {
  it("shows nothing for none or unknown, the number, and 99+", () => {
    expect(unreadBadge(null)).toBeNull();
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(7)).toBe("7");
    expect(unreadBadge(100)).toBe("99+");
    expect(bellLabel(3)).toBe("Notifications, 3 unread");
    expect(bellLabel(0)).toBe("Notifications");
  });
});

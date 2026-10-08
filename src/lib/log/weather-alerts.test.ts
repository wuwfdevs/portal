import { describe, expect, it } from "vitest";
import {
  activeAlerts,
  abbreviateAreas,
  alertFullText,
  alertLabels,
  alertsDisplay,
  alertLeadText,
  alertTiming,
  alertsCheckState,
  alertsToHazards,
  classifyAlertTier,
  normalizeNwsText,
  parseNwsAlerts,
  readStoredAlerts,
  sortAlerts,
  type WeatherAlert,
} from "./weather-alerts";

function feature(properties: Record<string, unknown>) {
  return { properties };
}

function alert(overrides: Partial<WeatherAlert>): WeatherAlert {
  return {
    id: "a",
    event: "Flood Watch",
    tier: "watch",
    severity: "Moderate",
    headline: null,
    description: null,
    instruction: null,
    areaDesc: null,
    senderName: null,
    issuedAt: "2026-10-08T06:00:00Z",
    endsAt: null,
    ...overrides,
  };
}

describe("classifyAlertTier", () => {
  it("reads the tier from the event name", () => {
    expect(classifyAlertTier("Hurricane Warning", "Extreme")).toBe("warning");
    expect(classifyAlertTier("High Surf Warning", "Moderate")).toBe("warning");
    expect(classifyAlertTier("Flood Watch", "Moderate")).toBe("watch");
    expect(classifyAlertTier("Rip Current Statement", "Minor")).toBe("statement");
    expect(classifyAlertTier("Tropical Cyclone Local Statement", "Minor")).toBe("statement");
  });

  it("treats Extreme severity as a warning whatever it is called", () => {
    expect(classifyAlertTier("Tropical Cyclone Local Statement", "Extreme")).toBe("warning");
  });
});

describe("parseNwsAlerts", () => {
  it("parses real fields and ranks warnings above watches above statements", () => {
    const alerts = parseNwsAlerts({
      features: [
        feature({
          id: "1",
          event: "Rip Current Statement",
          severity: "Minor",
          sent: "2026-10-08T09:30:00Z",
        }),
        feature({
          id: "2",
          event: "Flood Watch",
          severity: "Moderate",
          sent: "2026-10-08T06:37:00Z",
          ends: "2026-10-10T18:00:00Z",
        }),
        feature({
          id: "3",
          event: "Hurricane Warning",
          severity: "Extreme",
          sent: "2026-10-08T11:56:00Z",
          instruction: "Follow officials.",
          areaDesc: "Escambia",
        }),
      ],
    });
    expect(alerts.map((a) => a.event)).toEqual([
      "Hurricane Warning",
      "Flood Watch",
      "Rip Current Statement",
    ]);
    expect(alerts[0]).toMatchObject({
      tier: "warning",
      instruction: "Follow officials.",
      areaDesc: "Escambia",
      endsAt: null,
    });
    expect(alerts[1]!.endsAt).toBe("2026-10-10T18:00:00Z");
  });

  it("drops cancellations, tests and exercises, and nameless entries", () => {
    const alerts = parseNwsAlerts({
      features: [
        feature({ event: "Flood Watch", messageType: "Cancel" }),
        feature({ event: "Flood Watch", status: "Test" }),
        feature({ event: "Flood Watch", status: "Exercise" }),
        feature({ event: "  " }),
        feature({ event: "Flood Watch", status: "Actual", messageType: "Update" }),
      ],
    });
    expect(alerts).toHaveLength(1);
  });

  it("handles a malformed or empty response", () => {
    expect(parseNwsAlerts(null)).toEqual([]);
    expect(parseNwsAlerts({})).toEqual([]);
    expect(parseNwsAlerts({ features: [{}] })).toEqual([]);
  });
});

describe("sortAlerts", () => {
  it("breaks ties by severity, then newest first", () => {
    const sorted = sortAlerts([
      alert({
        id: "old",
        event: "A Warning",
        tier: "warning",
        severity: "Severe",
        issuedAt: "2026-10-08T01:00:00Z",
      }),
      alert({
        id: "new",
        event: "B Warning",
        tier: "warning",
        severity: "Severe",
        issuedAt: "2026-10-08T05:00:00Z",
      }),
      alert({
        id: "x",
        event: "C Warning",
        tier: "warning",
        severity: "Extreme",
        issuedAt: "2026-10-07T01:00:00Z",
      }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["x", "new", "old"]);
  });
});

describe("activeAlerts", () => {
  const now = "2026-10-08T18:00:00Z";
  it("drops an alert whose hard end has passed", () => {
    expect(activeAlerts([alert({ endsAt: "2026-10-08T17:59:00Z" })], now)).toEqual([]);
  });
  it("keeps an alert still before its end, or with none", () => {
    expect(
      activeAlerts([alert({ endsAt: "2026-10-08T18:01:00Z" }), alert({ endsAt: null })], now),
    ).toHaveLength(2);
  });
});

describe("alertTiming", () => {
  it("says in effect when NWS sets no end", () => {
    expect(alertTiming(alert({ endsAt: null }))).toBe("in effect");
  });
  it("words an end in station time", () => {
    // 18:00Z on Sat 2026-10-10 is 1:00 PM CDT.
    expect(alertTiming(alert({ endsAt: "2026-10-10T18:00:00Z" }))).toBe("until Sat 1:00 PM");
  });
});

describe("alertsToHazards", () => {
  it("joins event names, or returns null", () => {
    expect(
      alertsToHazards([alert({ event: "Hurricane Warning" }), alert({ event: "Flood Watch" })]),
    ).toBe("Hurricane Warning; Flood Watch");
    expect(alertsToHazards([])).toBeNull();
  });
});

describe("readStoredAlerts", () => {
  it("tolerates a missing or malformed column", () => {
    expect(readStoredAlerts(null)).toEqual([]);
    expect(readStoredAlerts("nope")).toEqual([]);
    expect(readStoredAlerts([{ nope: true }, alert({})])).toHaveLength(1);
  });
});

describe("alertsCheckState", () => {
  it("is unknown until a check has ever succeeded", () => {
    expect(alertsCheckState([], null, true)).toBe("unknown");
    expect(alertsCheckState([], null, false)).toBe("unknown");
  });
  it("is stale when the latest check failed but one succeeded earlier", () => {
    expect(alertsCheckState([alert({})], "2026-10-08T17:00:00Z", true)).toBe("stale");
  });
  it("distinguishes none from current", () => {
    expect(alertsCheckState([], "2026-10-08T17:00:00Z", false)).toBe("none");
    expect(alertsCheckState([alert({})], "2026-10-08T17:00:00Z", false)).toBe("current");
  });
});

describe("normalizeNwsText", () => {
  it("joins hard-wrapped lines and keeps paragraph breaks", () => {
    expect(
      normalizeNwsText("A Hurricane Warning is in\neffect for the\ncounty.\n\nPrepare now."),
    ).toBe("A Hurricane Warning is in effect for the county.\n\nPrepare now.");
  });
  it("drops a leading bullet marker", () => {
    expect(normalizeNwsText("* WHAT...Hurricane force winds.")).toBe(
      "WHAT...Hurricane force winds.",
    );
  });
});

describe("alertLeadText / alertFullText", () => {
  it("leads with the instruction", () => {
    const a = alert({ instruction: "Move to shelter.\nNow.", description: "Long text.\n\nMore." });
    expect(alertLeadText(a)).toBe("Move to shelter. Now.");
    expect(alertFullText(a)).toBe("Long text.\n\nMore.\n\nMove to shelter. Now.");
  });
  it("falls back to the description, then the headline", () => {
    expect(alertLeadText(alert({ description: "First.\n\nSecond." }))).toBe("First.");
    expect(alertLeadText(alert({ headline: "Flood Watch issued today" }))).toBe(
      "Flood Watch issued today",
    );
    expect(alertLeadText(alert({}))).toBeNull();
  });
  it("has no full text when it would only repeat the lead", () => {
    expect(alertFullText(alert({ description: "Only this." }))).toBeNull();
    expect(alertFullText(alert({}))).toBeNull();
  });
});

describe("alertsDisplay", () => {
  it("draws nothing for a checked, empty list", () => {
    expect(alertsDisplay([], "none")).toBe("hidden");
    expect(alertsDisplay([], "current")).toBe("hidden");
  });
  it("says it could not verify when alerts were never checked", () => {
    expect(alertsDisplay([], "unknown")).toBe("unverified");
  });
  it("does not treat a failed check after an all-clear as all clear", () => {
    expect(alertsDisplay([], "stale")).toBe("unverified");
  });
  it("lists alerts, current or stale", () => {
    expect(alertsDisplay([alert({})], "current")).toBe("list");
    expect(alertsDisplay([alert({})], "stale")).toBe("list");
  });
});

describe("alertLabels", () => {
  it("moves the tier word to the badge and out of the name", () => {
    expect(alertLabels({ event: "Hurricane Warning", tier: "warning" })).toEqual({
      badge: "Warning",
      name: "Hurricane",
    });
    expect(alertLabels({ event: "Flood Watch", tier: "watch" })).toEqual({
      badge: "Watch",
      name: "Flood",
    });
    expect(alertLabels({ event: "Rip Current Statement", tier: "statement" })).toEqual({
      badge: "Statement",
      name: "Rip Current",
    });
  });
  it("labels an advisory as an advisory, not a statement", () => {
    expect(alertLabels({ event: "Small Craft Advisory", tier: "statement" })).toEqual({
      badge: "Advisory",
      name: "Small Craft",
    });
  });
  it("keeps the full name when the tier came from severity, not the name", () => {
    expect(alertLabels({ event: "Tropical Cyclone Local Statement", tier: "warning" })).toEqual({
      badge: "Warning",
      name: "Tropical Cyclone Local Statement",
    });
  });
  it("does not empty a name that is only the suffix, or invent a suffix", () => {
    expect(alertLabels({ event: "Warning", tier: "warning" }).name).toBe("Warning");
    expect(alertLabels({ event: "Dense Fog", tier: "statement" })).toEqual({
      badge: "Alert",
      name: "Dense Fog",
    });
  });
});

describe("abbreviateAreas", () => {
  it("shows two areas and counts the rest", () => {
    expect(abbreviateAreas("Escambia; Santa Rosa; Okaloosa; Walton")).toBe(
      "Escambia, Santa Rosa +2",
    );
  });
  it("lists one or two areas in full, dropping duplicates", () => {
    expect(abbreviateAreas("Escambia")).toBe("Escambia");
    expect(abbreviateAreas("Escambia; Santa Rosa; Escambia")).toBe("Escambia, Santa Rosa");
  });
  it("is null when there is no area", () => {
    expect(abbreviateAreas(null)).toBeNull();
    expect(abbreviateAreas(" ; ")).toBeNull();
  });
});

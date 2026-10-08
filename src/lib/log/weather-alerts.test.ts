import { describe, expect, it } from "vitest";
import { NWS_EVENT_TYPES } from "./fixtures/nws-event-types";
import {
  activeAlerts,
  abbreviateAreas,
  consolidateAlerts,
  alertPlaces,
  coveragePlaces,
  mergeAlerts,
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
    urgency: "Expected",
    headline: null,
    description: null,
    instruction: null,
    areaDesc: null,
    places: [],
    senderName: null,
    issuedAt: "2026-10-08T06:00:00Z",
    startsAt: null,
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
    expect(alertTiming(alert({ endsAt: null }), "2026-10-08T18:00:00Z")).toBe("in effect");
  });
  it("words an end in station time", () => {
    // 18:00Z on Sat 2026-10-10 is 1:00 PM CDT.
    expect(alertTiming(alert({ endsAt: "2026-10-10T18:00:00Z" }), "2026-10-08T18:00:00Z")).toBe(
      "until Sat 1:00 PM",
    );
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
  it("treats Local Statement as one product name", () => {
    expect(alertLabels({ event: "Tropical Cyclone Local Statement", tier: "statement" })).toEqual({
      badge: "Statement",
      name: "Tropical Cyclone",
    });
    expect(alertLabels({ event: "Hurricane Local Statement", tier: "statement" })).toEqual({
      badge: "Statement",
      name: "Hurricane",
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

describe("alertTiming for a hazard that has not begun", () => {
  const now = "2026-10-08T18:00:00Z";
  it("says when it begins", () => {
    // 23:00Z on Fri 2026-10-09 is 6:00 PM CDT.
    expect(alertTiming(alert({ startsAt: "2026-10-09T23:00:00Z" }), now)).toBe(
      "begins Fri 6:00 PM",
    );
  });
  it("gives the start and the end", () => {
    expect(
      alertTiming(alert({ startsAt: "2026-10-09T23:00:00Z", endsAt: "2026-10-10T18:00:00Z" }), now),
    ).toBe("begins Fri 6:00 PM, until Sat 1:00 PM");
  });
  it("ignores a start already past", () => {
    expect(alertTiming(alert({ startsAt: "2026-10-08T06:00:00Z" }), now)).toBe("in effect");
  });
});

describe("the range of NWS event names and CAP values", () => {
  const cases: Array<[string, string, string]> = [
    // event, severity, expected tier
    ["Hurricane Warning", "Extreme", "warning"],
    ["Storm Surge Warning", "Extreme", "warning"],
    ["Tornado Warning", "Severe", "warning"],
    ["Extreme Wind Warning", "Extreme", "warning"],
    ["Flash Flood Warning", "Severe", "warning"],
    ["Special Marine Warning", "Severe", "warning"],
    ["Law Enforcement Warning", "Severe", "warning"],
    ["Shelter In Place Warning", "Severe", "warning"],
    ["Civil Emergency Message", "Extreme", "warning"],
    ["Civil Emergency Message", "Unknown", "warning"],
    ["Child Abduction Emergency", "Severe", "warning"],
    ["911 Telephone Outage Emergency", "Severe", "warning"],
    ["Local Area Emergency", "Severe", "warning"],
    ["Evacuation - Immediate", "Extreme", "warning"],
    ["Evacuation - Immediate", "Unknown", "warning"],
    ["Hurricane Watch", "Severe", "watch"],
    ["Tropical Storm Watch", "Severe", "watch"],
    ["Tornado Watch", "Severe", "watch"],
    ["Flood Watch", "Moderate", "watch"],
    ["Small Craft Advisory", "Minor", "statement"],
    ["Dense Fog Advisory", "Minor", "statement"],
    ["Rip Current Statement", "Minor", "statement"],
    ["Tropical Cyclone Local Statement", "Minor", "statement"],
    ["Hurricane Local Statement", "Minor", "statement"],
    ["Special Weather Statement", "Moderate", "statement"],
    ["Severe Weather Statement", "Severe", "statement"],
    ["Beach Hazards Statement", "Minor", "statement"],
    ["Hydrologic Outlook", "Minor", "statement"],
    ["Administrative Message", "Unknown", "statement"],
  ];
  it.each(cases)("%s (%s) is a %s", (event, severity, tier) => {
    expect(classifyAlertTier(event, severity)).toBe(tier);
  });

  it("gives every one of those a non-empty badge and name", () => {
    for (const [event, severity] of cases) {
      const labels = alertLabels({ event, tier: classifyAlertTier(event, severity) });
      expect(labels.badge.length).toBeGreaterThan(0);
      expect(labels.name.length).toBeGreaterThan(0);
    }
  });

  it("drops system traffic: Cancel, Ack, Error, tests and drafts", () => {
    const alerts = parseNwsAlerts({
      features: [
        feature({ event: "Hurricane Warning", messageType: "Cancel" }),
        feature({ event: "Hurricane Warning", messageType: "Ack" }),
        feature({ event: "Hurricane Warning", messageType: "Error" }),
        feature({ event: "Test" }),
        feature({ event: "Hurricane Warning", status: "Draft" }),
        feature({ event: "Hurricane Warning", status: "System" }),
        feature({ event: "Hurricane Warning", messageType: "Alert", status: "Actual" }),
        feature({ event: "Hurricane Warning", messageType: "Update", status: "Actual" }),
      ],
    });
    expect(alerts).toHaveLength(2);
  });

  it("ranks an unrecognized severity or urgency last, without failing", () => {
    const sorted = sortAlerts([
      alert({
        id: "odd",
        event: "A Warning",
        tier: "warning",
        severity: "Catastrophic",
        urgency: "Soon",
      }),
      alert({
        id: "minor",
        event: "B Warning",
        tier: "warning",
        severity: "Minor",
        urgency: "Immediate",
      }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["minor", "odd"]);
  });

  it("breaks a severity tie by urgency, most immediate first", () => {
    const sorted = sortAlerts([
      alert({ id: "future", tier: "watch", severity: "Severe", urgency: "Future" }),
      alert({ id: "immediate", tier: "watch", severity: "Severe", urgency: "Immediate" }),
      alert({ id: "past", tier: "watch", severity: "Severe", urgency: "Past" }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["immediate", "future", "past"]);
  });

  it("fills in fields a stored alert predates", () => {
    const [stored] = readStoredAlerts([
      { id: "x", event: "Flood Watch", tier: "watch", severity: "Moderate" },
    ]);
    expect(stored).toMatchObject({ urgency: "Unknown", startsAt: null });
  });

  it("reads onset as the start, falling back to effective", () => {
    const [withOnset] = parseNwsAlerts({
      features: [
        feature({
          event: "Flood Watch",
          onset: "2026-10-09T23:00:00Z",
          effective: "2026-10-08T12:00:00Z",
        }),
      ],
    });
    expect(withOnset!.startsAt).toBe("2026-10-09T23:00:00Z");
    const [withEffective] = parseNwsAlerts({
      features: [feature({ event: "Flood Watch", effective: "2026-10-08T12:00:00Z" })],
    });
    expect(withEffective!.startsAt).toBe("2026-10-08T12:00:00Z");
  });
});

describe("every event type api.weather.gov publishes", () => {
  const tierOf = (event: string) => classifyAlertTier(event, "Moderate");

  it("classifies every Warning and Watch by its name", () => {
    for (const event of NWS_EVENT_TYPES) {
      if (/Warning$/.test(event)) expect(tierOf(event), event).toBe("warning");
      if (/Watch$/.test(event)) expect(tierOf(event), event).toBe("watch");
    }
  });

  it("ranks the emergencies and the evacuation order as warnings though they do not end in Warning", () => {
    for (const event of [
      "Child Abduction Emergency",
      "Civil Emergency Message",
      "Local Area Emergency",
      "Evacuation Immediate",
      "911 Telephone Outage",
    ]) {
      expect(tierOf(event), event).toBe("warning");
    }
  });

  it("leaves advisories, statements, outlooks, alerts and notices in the quiet tier", () => {
    for (const event of NWS_EVENT_TYPES) {
      if (/(Advisory|Statement|Outlook)$/.test(event))
        expect(tierOf(event), event).toBe("statement");
    }
    for (const event of ["Air Quality Alert", "Blue Alert", "Extreme Fire Danger"]) {
      expect(tierOf(event), event).toBe("statement");
    }
  });

  it("promotes any of them to a warning on Extreme severity", () => {
    for (const event of NWS_EVENT_TYPES) {
      expect(classifyAlertTier(event, "Extreme"), event).toBe("warning");
    }
  });

  it("never leaves the badge word repeated in the name, or the name empty", () => {
    for (const event of NWS_EVENT_TYPES) {
      const { badge, name } = alertLabels({ event, tier: tierOf(event) });
      expect(name.length, event).toBeGreaterThan(0);
      if (event !== "Blue Alert")
        expect(name.toLowerCase().endsWith(badge.toLowerCase()), event).toBe(false);
    }
  });

  it("words the awkward ones sensibly", () => {
    const labels = (event: string) => alertLabels({ event, tier: tierOf(event) });
    expect(labels("Air Quality Alert")).toEqual({ badge: "Alert", name: "Air Quality" });
    expect(labels("Blue Alert")).toEqual({ badge: "Alert", name: "Blue Alert" });
    expect(labels("Short Term Forecast")).toEqual({ badge: "Alert", name: "Short Term Forecast" });
    expect(labels("911 Telephone Outage")).toEqual({
      badge: "Warning",
      name: "911 Telephone Outage",
    });
    expect(labels("Extreme Fire Danger")).toEqual({ badge: "Alert", name: "Extreme Fire Danger" });
    expect(labels("Hazardous Weather Outlook")).toEqual({
      badge: "Outlook",
      name: "Hazardous Weather",
    });
    expect(labels("Civil Emergency Message")).toEqual({
      badge: "Warning",
      name: "Civil Emergency Message",
    });
    expect(labels("Hurricane Force Wind Warning")).toEqual({
      badge: "Warning",
      name: "Hurricane Force Wind",
    });
    expect(labels("Tropical Cyclone Local Statement")).toEqual({
      badge: "Statement",
      name: "Tropical Cyclone",
    });
  });

  it("does not show products that are not hazards", () => {
    for (const event of ["Test", "Short Term Forecast", "Administrative Message"]) {
      expect(parseNwsAlerts({ features: [feature({ event })] }), event).toEqual([]);
    }
  });
});

describe("coverage counties", () => {
  const ESCAMBIA = "012033";
  const SANTA_ROSA = "012113";
  const OKALOOSA = "012091";
  const MOBILE = "001097";
  const WALTON = "012131";
  const BALDWIN = "001003";
  const ESCAMBIA_AL = "001053";

  it("names the coverage counties in a fixed order whatever order NWS lists them", () => {
    expect(coveragePlaces([MOBILE, OKALOOSA, WALTON, ESCAMBIA, SANTA_ROSA])).toEqual([
      "Escambia",
      "Santa Rosa",
      "Okaloosa",
      "Mobile",
    ]);
  });

  it("does not mistake Escambia County, Alabama, or Baldwin for coverage", () => {
    expect(coveragePlaces([ESCAMBIA_AL, BALDWIN, WALTON])).toEqual([]);
  });

  it("handles missing codes", () => {
    expect(coveragePlaces(undefined)).toEqual([]);
    expect(coveragePlaces([])).toEqual([]);
  });

  it("keeps an alert that touches a coverage county and lists only those counties", () => {
    const [kept] = parseNwsAlerts({
      features: [
        feature({
          event: "Flood Watch",
          areaDesc: "Escambia; Covington; Baldwin Coastal",
          geocode: { SAME: [ESCAMBIA_AL, "001039", BALDWIN, ESCAMBIA] },
        }),
      ],
    });
    expect(kept!.places).toEqual(["Escambia"]);
  });

  it("drops an alert whose counties are all outside coverage", () => {
    const alerts = parseNwsAlerts({
      features: [
        feature({ event: "Flood Watch", geocode: { SAME: [WALTON, BALDWIN] } }),
        feature({ event: "Flood Watch", geocode: { SAME: [MOBILE] } }),
      ],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.places).toEqual(["Mobile"]);
  });

  it("keeps an alert with no county codes at all, since it cannot be judged", () => {
    const alerts = parseNwsAlerts({
      features: [feature({ event: "Small Craft Advisory", areaDesc: "Pensacola Bay" })],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.places).toEqual([]);
  });
});

describe("alertPlaces", () => {
  it("lists every coverage county, not an abbreviation", () => {
    expect(
      alertPlaces({
        places: ["Escambia", "Santa Rosa", "Okaloosa", "Mobile"],
        areaDesc: "x; y; z",
      }),
    ).toBe("Escambia, Santa Rosa, Okaloosa, Mobile");
  });
  it("falls back to the abbreviated zones when there are no county codes", () => {
    expect(alertPlaces({ places: [], areaDesc: "Pensacola Bay; Perdido Bay; Mobile Bay" })).toBe(
      "Pensacola Bay, Perdido Bay +1",
    );
    expect(alertPlaces({ places: [], areaDesc: null })).toBeNull();
  });
});

describe("mergeAlerts", () => {
  it("keeps one entry per alert id, the first list winning, and ranks the result", () => {
    const merged = mergeAlerts(
      [alert({ id: "a", event: "Flood Watch", tier: "watch" })],
      [
        alert({ id: "a", event: "Different", tier: "watch" }),
        alert({ id: "b", event: "Hurricane Warning", tier: "warning", severity: "Extreme" }),
      ],
    );
    expect(merged.map((a) => a.id)).toEqual(["b", "a"]);
    expect(merged.find((a) => a.id === "a")!.event).toBe("Flood Watch");
  });
});

describe("alertLeadText skips a list of places", () => {
  it("leads with prose, not LOCATIONS AFFECTED or NEXT UPDATE", () => {
    const description =
      "LOCATIONS AFFECTED\n- Pensacola\n- Perdido Bay\n\nA Hurricane Warning is in effect.\n\nNEXT UPDATE\nAt 4 PM.";
    expect(alertLeadText(alert({ description }))).toBe("A Hurricane Warning is in effect.");
  });
  it("falls back to the first paragraph when every paragraph is skippable", () => {
    expect(alertLeadText(alert({ description: "NEXT UPDATE\nAt 4 PM." }))).toBe(
      "NEXT UPDATE At 4 PM.",
    );
  });
});

describe("consolidateAlerts (shapes taken from the 2026-10-08 hurricane feed)", () => {
  const A = (id: string, event: string, places: string[], over: Partial<WeatherAlert> = {}) =>
    alert({
      id,
      event,
      tier: /Warning$/.test(event) ? "warning" : /Watch$/.test(event) ? "watch" : "statement",
      severity: "Extreme",
      places,
      issuedAt: "2026-10-08T10:06:00-05:00",
      ...over,
    });

  it("collapses a Hurricane Warning issued once per county group into one, listing every county", () => {
    const merged = consolidateAlerts([
      A("a.019.1", "Hurricane Warning", ["Escambia"]),
      A("a.015.1", "Hurricane Warning", ["Mobile"]),
      A("a.021.1", "Hurricane Warning", ["Escambia"]),
      A("a.020.1", "Hurricane Warning", ["Okaloosa"]),
      A("a.018.1", "Hurricane Warning", ["Santa Rosa"]),
      A("a.019.2", "Storm Surge Warning", ["Escambia"]),
      A("a.015.2", "Storm Surge Warning", ["Mobile"]),
    ]);
    expect(merged.map((a) => a.event)).toEqual(["Hurricane Warning", "Storm Surge Warning"]);
    expect(merged[0]!.places).toEqual(["Escambia", "Santa Rosa", "Okaloosa", "Mobile"]);
    expect(merged[1]!.places).toEqual(["Escambia", "Mobile"]);
  });

  it("keeps only the newest of a repeatedly reissued statement", () => {
    const merged = consolidateAlerts([
      A("old", "Tropical Cyclone Local Statement", ["Escambia"], {
        issuedAt: "2026-10-08T04:23:00-05:00",
        description: "old",
      }),
      A("new", "Tropical Cyclone Local Statement", ["Escambia"], {
        issuedAt: "2026-10-08T10:42:00-05:00",
        description: "new",
      }),
      A("mid", "Tropical Cyclone Local Statement", ["Escambia"], {
        issuedAt: "2026-10-08T07:01:00-05:00",
        description: "mid",
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "new", description: "new" });
  });

  it("compares issue times as instants, not strings, across different offsets", () => {
    // 10:00 at -05:00 is 15:00Z, later than 14:00Z even though "14" sorts after "10".
    const merged = consolidateAlerts([
      A("z", "Flood Watch", ["Escambia"], { issuedAt: "2026-10-08T14:00:00Z" }),
      A("c", "Flood Watch", ["Escambia"], { issuedAt: "2026-10-08T10:00:00-05:00" }),
    ]);
    expect(merged[0]!.id).toBe("c");
  });

  it("merges several Flood Warnings into one covering the union of their counties", () => {
    const merged = consolidateAlerts([
      A("1", "Flood Warning", ["Okaloosa"], { severity: "Severe" }),
      A("2", "Flood Warning", ["Escambia"], { severity: "Severe" }),
      A("3", "Flood Warning", ["Santa Rosa", "Okaloosa"], { severity: "Severe" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.places).toEqual(["Escambia", "Santa Rosa", "Okaloosa"]);
  });

  it("is open-ended if any member is, otherwise ends with the latest member", () => {
    const withEnds = consolidateAlerts([
      A("1", "Flood Warning", ["Escambia"], { endsAt: "2026-10-09T12:00:00Z" }),
      A("2", "Flood Warning", ["Okaloosa"], { endsAt: "2026-10-10T12:00:00Z" }),
    ]);
    expect(withEnds[0]!.endsAt).toBe("2026-10-10T12:00:00Z");
    const open = consolidateAlerts([
      A("1", "Flood Warning", ["Escambia"], { endsAt: "2026-10-09T12:00:00Z" }),
      A("2", "Flood Warning", ["Okaloosa"], { endsAt: null }),
    ]);
    expect(open[0]!.endsAt).toBeNull();
  });

  it("takes the strongest severity and urgency of the group", () => {
    const merged = consolidateAlerts([
      A("1", "Flood Watch", ["Escambia"], { severity: "Moderate", urgency: "Future" }),
      A("2", "Flood Watch", ["Okaloosa"], { severity: "Severe", urgency: "Expected" }),
    ]);
    expect(merged[0]).toMatchObject({ severity: "Severe", urgency: "Expected" });
  });

  it("leaves distinct events alone, ranked, and is idempotent", () => {
    const input = [
      A("w", "Flood Watch", ["Escambia"]),
      A("h", "Hurricane Warning", ["Escambia"]),
      A("h2", "Hurricane Warning", ["Mobile"]),
    ];
    const once = consolidateAlerts(input);
    expect(once.map((a) => a.event)).toEqual(["Hurricane Warning", "Flood Watch"]);
    expect(consolidateAlerts(once)).toEqual(once);
  });

  it("is case-insensitive about the event name and keeps a lone alert untouched", () => {
    const only = A("x", "Rip Current Statement", ["Escambia"]);
    expect(consolidateAlerts([only])).toEqual([only]);
    expect(
      consolidateAlerts([A("a", "Flood Watch", ["Escambia"]), A("b", "flood watch", ["Mobile"])]),
    ).toHaveLength(1);
  });
});

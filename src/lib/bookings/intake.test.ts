import { describe, expect, it } from "vitest";
import {
  INTAKE_ERROR_MESSAGES,
  buildIntakePayload,
  intakeErrorMessage,
  parseOfferedPackages,
  validateIntakeInput,
  visibleIntakeSteps,
  type IntakeInput,
} from "./intake";

const OFFERED = ["Studio access", "Event webcast", "Field production", "Post-production / editing"];

function input(overrides: Partial<IntakeInput> = {}): IntakeInput {
  return {
    contactName: "Pat Jordan",
    contactEmail: "pjordan@uwf.edu",
    contactPhone: "",
    partnerName: "UWF Libraries",
    partnerKind: "uwf_unit",
    title: "Finals-week hours",
    description: "A live read during finals week.",
    requested: "production",
    packages: ["Studio access"],
    offeredPackages: OFFERED,
    eventStartsOn: "",
    eventEndsOn: "",
    deliverablesDueOn: "",
    location: "",
    airingsPerWeek: "",
    seconds: "",
    airtimeStartsOn: "",
    airtimeEndsOn: "",
    honeypot: "",
    renderedAtMs: 0,
    nowMs: 60_000,
    ...overrides,
  };
}

describe("visibleIntakeSteps", () => {
  it("shows the airtime step only when airtime is asked for", () => {
    expect(visibleIntakeSteps("production")).toEqual(["about", "ask", "when", "wrapup"]);
    expect(visibleIntakeSteps("airtime")).toEqual(["about", "ask", "when", "airtime", "wrapup"]);
    expect(visibleIntakeSteps("both")).toContain("airtime");
  });
});

describe("validateIntakeInput", () => {
  it("accepts a complete production request", () => {
    expect(validateIntakeInput(input())).toBeNull();
  });

  it("stays silent on a tripped honeypot", () => {
    expect(validateIntakeInput(input({ honeypot: "http://spam", contactName: "" }))).toBeNull();
  });

  it("refuses a submission faster than a person could fill it in", () => {
    expect(validateIntakeInput(input({ renderedAtMs: 59_000 }))).toMatch(/too fast/);
  });

  it("requires the contact, the organization, the title and the description", () => {
    expect(validateIntakeInput(input({ contactName: " " }))).toBe("Enter your name.");
    expect(validateIntakeInput(input({ contactEmail: "nope" }))).toBe(
      "Enter a valid email address.",
    );
    expect(validateIntakeInput(input({ partnerName: "" }))).toMatch(/Name your/);
    expect(validateIntakeInput(input({ title: "" }))).toMatch(/title/);
    expect(validateIntakeInput(input({ description: "" }))).toBe("Describe what you need.");
  });

  it("refuses a package the form did not offer, but only when production is asked for", () => {
    expect(validateIntakeInput(input({ packages: ["Drone"] }))).toBe(
      "Choose from the listed services.",
    );
    expect(validateIntakeInput(input({ requested: "airtime", packages: ["Drone"] }))).toBeNull();
  });

  it("checks dates and their order", () => {
    expect(validateIntakeInput(input({ eventStartsOn: "soon" }))).toMatch(/must be a date/);
    expect(
      validateIntakeInput(input({ eventStartsOn: "2027-03-02", eventEndsOn: "2027-03-01" })),
    ).toMatch(/end on or after/);
  });

  it("checks the airtime numbers only when airtime is asked for", () => {
    expect(validateIntakeInput(input({ airingsPerWeek: "x" }))).toBeNull();
    expect(validateIntakeInput(input({ requested: "both", airingsPerWeek: "x" }))).toMatch(
      /Airings a week/,
    );
    expect(validateIntakeInput(input({ requested: "both", airingsPerWeek: "100" }))).toMatch(
      /Airings a week/,
    );
    expect(validateIntakeInput(input({ requested: "airtime", seconds: "0" }))).toMatch(/length/);
    expect(
      validateIntakeInput(input({ requested: "airtime", airingsPerWeek: "5", seconds: "60" })),
    ).toBeNull();
  });
});

describe("buildIntakePayload", () => {
  it("trims, deduplicates packages, and drops the fields of a track not asked for", () => {
    const payload = buildIntakePayload(
      input({
        requested: "production",
        packages: [" Studio access", "Studio access"],
        airingsPerWeek: "5",
        seconds: "30",
        title: "  Hours  ",
      }),
    );
    expect(payload.title).toBe("Hours");
    expect(payload.packages).toEqual(["Studio access"]);
    expect(payload.airings_per_week).toBe("");
    expect(payload.seconds).toBe("");
  });

  it("keeps the airtime numbers and drops the packages for an airtime-only request", () => {
    const payload = buildIntakePayload(
      input({
        requested: "airtime",
        packages: ["Studio access"],
        airingsPerWeek: "5",
        seconds: "30",
      }),
    );
    expect(payload.packages).toEqual([]);
    expect(payload.airings_per_week).toBe("5");
  });
});

describe("intakeErrorMessage", () => {
  it("maps every code the function returns, and falls back for an unknown one", () => {
    for (const code of Object.keys(INTAKE_ERROR_MESSAGES)) {
      expect(intakeErrorMessage(code)).toBe(INTAKE_ERROR_MESSAGES[code]);
    }
    expect(intakeErrorMessage("mystery")).toMatch(/try again/);
    expect(intakeErrorMessage(null)).toMatch(/try again/);
  });
});

describe("parseOfferedPackages", () => {
  it("reads one name a line, trimmed, without blanks or duplicates", () => {
    expect(parseOfferedPackages("Studio access\n\n  Event webcast \nstudio access\r\n")).toEqual({
      ok: true,
      names: ["Studio access", "Event webcast"],
    });
  });

  it("refuses a name that is too long, and too many names", () => {
    expect(parseOfferedPackages("x".repeat(61)).ok).toBe(false);
    expect(
      parseOfferedPackages(Array.from({ length: 21 }, (_, i) => `Service ${i}`).join("\n")).ok,
    ).toBe(false);
  });
});

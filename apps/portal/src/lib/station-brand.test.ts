import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emailPlaceholder,
  fillStation,
  searchLocation,
  sentenceStart,
  stationProfileFrom,
  toolsTitle,
  isRemoteLogo,
} from "./station-brand";
import { STATION_TIME_ZONE } from "./station-time";

const WUWF = stationProfileFrom({
  display_name: "WUWF Public Media",
  short_name: "WUWF",
  call_sign: "WUWF-FM",
  primary_city: "Pensacola",
  region: "Florida",
  coverage_area: "Pensacola and Northwest Florida",
  support_email: "tools-support@wuwf.org",
  public_attribution: "— WUWF Public Media, Pensacola, FL",
  public_notice_text: "This page is provided by the University of West Florida under its",
  public_notice_link_label: "Information Security and Privacy Policy (IT-04)",
  public_notice_link_url: "/policies/it-04-information-security-and-privacy.pdf",
});

describe("stationProfileFrom", () => {
  it("carries a fully set station through", () => {
    expect(WUWF).toMatchObject({
      name: "WUWF Public Media",
      shortName: "WUWF",
      callSign: "WUWF-FM",
      coverageArea: "Pensacola and Northwest Florida",
      supportEmail: "tools-support@wuwf.org",
      attribution: "— WUWF Public Media, Pensacola, FL",
      named: true,
    });
    expect(WUWF.notice).toEqual({
      text: "This page is provided by the University of West Florida under its",
      linkLabel: "Information Security and Privacy Policy (IT-04)",
      linkUrl: "/policies/it-04-information-security-and-privacy.pdf",
    });
  });

  it("reads correctly in a sentence before a station has set anything", () => {
    const blank = stationProfileFrom(null);
    expect(blank.named).toBe(false);
    expect(blank.shortName).toBe("the station");
    expect(sentenceStart(blank.shortName)).toBe("The station");
    expect(blank.name).toBe("Station");
    expect(toolsTitle(blank)).toBe("Station Tools");
    expect(blank.coverageArea).toBe("its community");
    expect(blank.attribution).toBe("— Station");
    expect(blank.supportEmail).toBeNull();
    expect(blank.notice).toBeNull();
    // Nothing that is another station's.
    expect(JSON.stringify(blank)).not.toMatch(/WUWF|Pensacola|Florida/);
  });

  it("treats empty and whitespace-only values as unset", () => {
    const profile = stationProfileFrom({ display_name: "  ", short_name: "", support_email: " " });
    expect(profile.named).toBe(false);
    expect(profile.supportEmail).toBeNull();
  });

  it("falls back from one name to the other", () => {
    expect(stationProfileFrom({ display_name: "Gulf Coast Public Radio" })).toMatchObject({
      name: "Gulf Coast Public Radio",
      shortName: "Gulf Coast Public Radio",
    });
    expect(stationProfileFrom({ short_name: "KXYZ" })).toMatchObject({
      name: "KXYZ",
      shortName: "KXYZ",
    });
  });

  it("builds the coverage area from city and region when none is given", () => {
    expect(stationProfileFrom({ primary_city: "Mobile", region: "Alabama" }).coverageArea).toBe(
      "Mobile, Alabama",
    );
    expect(stationProfileFrom({ primary_city: "Mobile" }).coverageArea).toBe("Mobile");
  });

  it("shows a notice only when it has something to say", () => {
    expect(
      stationProfileFrom({ public_notice_text: "Provided by the licensee." })?.notice?.text,
    ).toBe("Provided by the licensee.");
    // A link needs both its label and its address.
    expect(stationProfileFrom({ public_notice_link_label: "Policy" }).notice).toBeNull();
    expect(stationProfileFrom({ public_notice_link_url: "/p.pdf" }).notice).toBeNull();
    expect(
      stationProfileFrom({ public_notice_link_label: "Policy", public_notice_link_url: "/p.pdf" })
        .notice,
    ).not.toBeNull();
  });
});

describe("the helpers", () => {
  it("titles the portal after the station", () => {
    expect(toolsTitle(WUWF)).toBe("WUWF Tools");
    expect(toolsTitle(stationProfileFrom({ short_name: "KXYZ" }))).toBe("KXYZ Tools");
  });

  it("builds an email placeholder from the support address's domain", () => {
    expect(emailPlaceholder(WUWF)).toBe("you@wuwf.org");
    expect(emailPlaceholder(WUWF, "name")).toBe("name@wuwf.org");
    expect(emailPlaceholder(stationProfileFrom(null))).toBe("you@example.org");
  });

  it("fills the placeholders in a prompt and leaves nothing behind", () => {
    const text =
      "You are the {{tools}} assistant for {{station}}, serving {{area}}. {{station}}'s desk.";
    expect(fillStation(text, WUWF)).toBe(
      "You are the WUWF Tools assistant for WUWF, serving Pensacola and Northwest Florida. WUWF's desk.",
    );
    expect(
      fillStation(
        text,
        stationProfileFrom({ short_name: "KXYZ", primary_city: "Tulsa", region: "Oklahoma" }),
      ),
    ).toBe("You are the KXYZ Tools assistant for KXYZ, serving Tulsa, Oklahoma. KXYZ's desk.");
    expect(fillStation(text, stationProfileFrom(null))).not.toContain("{{");
  });

  it("gives a web search the station's own place, and omits what is unknown", () => {
    expect(searchLocation(WUWF)).toEqual({
      type: "approximate",
      city: "Pensacola",
      region: "Florida",
      country: "US",
      timezone: STATION_TIME_ZONE,
    });
    expect(searchLocation(stationProfileFrom(null))).toEqual({
      type: "approximate",
      country: "US",
      timezone: STATION_TIME_ZONE,
    });
  });
});

/**
 * The pilot-visible screens and the AI prompts must say the station's own name, not WUWF's. A literal
 * that creeps back in would show another station's name to its public. Comments may mention WUWF.
 */
describe("the station's name on the pilot-visible surfaces", () => {
  const FILES = [
    "src/app/layout.tsx",
    "src/components/portal-nav.tsx",
    "src/components/ui/public-shell.tsx",
    "src/components/ui/public-policy-notice.tsx",
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/login/login-form.tsx",
    "src/app/(auth)/request-access/page.tsx",
    "src/app/(auth)/request-access/request-access-form.tsx",
    "src/app/listen/[publicId]/listen-shell.tsx",
    "src/app/listen/[publicId]/listen-page-content.tsx",
    "src/app/listen/[publicId]/participate.tsx",
    "src/app/listen/[publicId]/error.tsx",
    "src/lib/agent/chat.ts",
    "src/lib/editorial-inquiry/ai.ts",
    "src/lib/sourcework/analyze-ai.ts",
    "src/lib/underwriting/affidavits.ts",
    "src/lib/underwriting/affidavit-pdf.tsx",
    "src/lib/underwriting/agreement-ai-import.ts",
    "src/lib/log/program-log-ai-import.ts",
    "src/lib/log/providers/weather.ts",
    "src/lib/log/weather-alerts.ts",
    "src/lib/log/weather.ts",
    "src/lib/log/clock-face.ts",
    "src/lib/log/data-sources.ts",
    "src/components/log/clock-viewer.tsx",
    "src/app/(portal)/underwriting/copy/script-field.tsx",
    "src/app/(portal)/log/sources/npr/page.tsx",
    "src/app/(portal)/log/import/page.tsx",
    "src/app/(portal)/underwriting/affidavits/[id]/page.tsx",
  ];

  for (const file of FILES) {
    it(`${file} names no station`, () => {
      const code = readFileSync(join(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\{?\/\*.*\*\/\}?\s*$/gm, "")
        .replace(/(^|\s)\/\/.*$/gm, "");
      // `wuwf-listen-submission` is a storage key inside the browser, deliberately unchanged.
      const withoutStorageKey = code.replace(/wuwf-listen-submission/g, "");
      expect(withoutStorageKey).not.toMatch(/WUWF|\bUWF\b|Pensacola|wuwf\.org/);
    });
  }
});

describe("isRemoteLogo", () => {
  it("is true only for an http(s) address", () => {
    expect(isRemoteLogo("https://cdn.example.org/logo.png")).toBe(true);
    expect(isRemoteLogo("HTTP://example.org/logo.png")).toBe(true);
    expect(isRemoteLogo("/wuwf-logo.png")).toBe(false);
    expect(isRemoteLogo("logo.png")).toBe(false);
  });
});

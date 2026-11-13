import { describe, expect, it } from "vitest";
import {
  availableCampaignActions,
  eventSpanProblem,
  isValidSlug,
  openingProblem,
  parseTagList,
  slugify,
  validateCampaignInput,
  validatePromptInput,
} from "./campaigns";

describe("slugify", () => {
  it("makes a short name of lowercase words", () => {
    expect(slugify("Housing & Home: Fall 2026!")).toBe("housing-home-fall-2026");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
  });
  it("never ends in a hyphen after the length cut, and stays valid", () => {
    const slug = slugify(`${"word ".repeat(30)}end`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });
  it("is empty for a title with nothing to keep, which the form refuses", () => {
    expect(slugify("!!!")).toBe("");
    expect(isValidSlug("")).toBe(false);
  });
});

describe("validateCampaignInput", () => {
  const ok = { title: "Housing", question: "How is housing treating you?", slug: "housing" };
  it("accepts a title, a question and a slug", () => {
    expect(validateCampaignInput(ok)).toBeNull();
  });
  it("names what is missing", () => {
    expect(validateCampaignInput({ ...ok, title: " " })).toMatch(/title/);
    expect(validateCampaignInput({ ...ok, question: "" })).toMatch(/question/);
    expect(validateCampaignInput({ ...ok, slug: "Bad Slug" })).toMatch(/short name/);
  });
  it("refuses a span that closes before it opens", () => {
    expect(validateCampaignInput({ ...ok, opensAt: "2026-12-10T00:00:00Z", closesAt: "2026-12-01T00:00:00Z" })).toMatch(/close after/);
    expect(validateCampaignInput({ ...ok, opensAt: "2026-12-01T00:00:00Z", closesAt: "2026-12-10T00:00:00Z" })).toBeNull();
  });
});

describe("validatePromptInput", () => {
  it("needs a known kind and some words", () => {
    expect(validatePromptInput({ kind: "prompt", text: "Tell us more." })).toBeNull();
    expect(validatePromptInput({ kind: "other", text: "x" })).toMatch(/kind/);
    expect(validatePromptInput({ kind: "prompt", text: "  " })).toMatch(/Write the prompt/);
  });
  it("keeps a suggested time to something a table can use", () => {
    expect(validatePromptInput({ kind: "prompt", text: "x", suggestedSeconds: 10 })).toMatch(/Suggested time/);
    expect(validatePromptInput({ kind: "prompt", text: "x", suggestedSeconds: 120 })).toBeNull();
    expect(validatePromptInput({ kind: "prompt", text: "x", suggestedSeconds: 4000 })).toMatch(/Suggested time/);
  });
});

describe("parseTagList", () => {
  it("splits on lines and commas, trims, and keeps the first spelling of a repeat", () => {
    expect(parseTagList("Cost, Safety\n cost \n\nNeighbors ").tags).toEqual(["Cost", "Safety", "Neighbors"]);
  });
  it("reports what it left out rather than dropping it silently", () => {
    const long = "x".repeat(41);
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(",");
    expect(parseTagList(long).tooLong).toEqual([long]);
    const result = parseTagList(many);
    expect(result.tags).toHaveLength(24);
    expect(result.tooMany).toBe(6);
  });
});

describe("campaign status", () => {
  it("moves draft to open to closed, and archives a closed one", () => {
    expect(availableCampaignActions("draft")).toEqual(["open"]);
    expect(availableCampaignActions("open")).toEqual(["close"]);
    expect(availableCampaignActions("closed")).toEqual(["reopen", "archive"]);
    expect(availableCampaignActions("archived")).toEqual([]);
  });
  it("will not open with nothing to ask, or after its own closing date", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    expect(openingProblem({ promptCount: 0, closesAt: null }, now)).toMatch(/prompt/);
    expect(openingProblem({ promptCount: 2, closesAt: "2026-11-01T00:00:00Z" }, now)).toMatch(/passed/);
    expect(openingProblem({ promptCount: 2, closesAt: null }, now)).toBeNull();
  });
});

describe("eventSpanProblem (twin of al_events_check_span)", () => {
  const span = { opensAt: "2026-12-01T00:00:00Z", closesAt: "2026-12-31T00:00:00Z" };
  it("accepts a start inside the span, including either end", () => {
    expect(eventSpanProblem("2026-12-05T18:00:00Z", span)).toBeNull();
    expect(eventSpanProblem("2026-12-01T00:00:00Z", span)).toBeNull();
    expect(eventSpanProblem("2026-12-31T00:00:00Z", span)).toBeNull();
  });
  it("refuses a start before or after, and treats a missing bound as none", () => {
    expect(eventSpanProblem("2026-11-30T23:59:00Z", span)).toMatch(/before/);
    expect(eventSpanProblem("2027-01-01T00:00:00Z", span)).toMatch(/after/);
    expect(eventSpanProblem("2030-01-01T00:00:00Z", { opensAt: null, closesAt: null })).toBeNull();
  });
});

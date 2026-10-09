import { describe, expect, it } from "vitest";
import {
  buildContextInput,
  buildContextOutputSchema,
  contextNeedsRefresh,
  extractCandidateTerms,
  noteKey,
  parseContextOutput,
  questionsFingerprint,
  selectNewNotes,
} from "./context-prompt";

describe("extractCandidateTerms", () => {
  const text =
    "Well, we went to Fort Barrancas every summer. The Advanced Redoubt was north of Fort Barrancas. " +
    "Tom Reyes said the Navy base was close. Oh yeah, the Navy base closed it. We loved Fort Barrancas.";

  it("finds recurring multi-word names, most used first", () => {
    const terms = extractCandidateTerms([text], { exclude: ["Tom Reyes"] });
    expect(terms[0]).toBe("Fort Barrancas");
    expect(terms).toContain("Advanced Redoubt");
  });

  it("keeps interviewee names out", () => {
    const terms = extractCandidateTerms([text], { exclude: ["Tom Reyes"] });
    expect(terms.some((term) => term.includes("Tom") || term.includes("Reyes"))).toBe(false);
  });

  it("ignores filler and a single capitalized word that doesn't recur", () => {
    const terms = extractCandidateTerms([text]);
    expect(terms).not.toContain("Well");
    expect(terms).not.toContain("Oh");
    expect(terms).not.toContain("We");
  });

  it("respects the limit", () => {
    const many = Array.from(
      { length: 60 },
      (_, i) => `Fort Number${String.fromCharCode(65 + (i % 26))}${i}`,
    ).join(". ");
    expect(extractCandidateTerms([many], { limit: 10 })).toHaveLength(10);
  });
});

describe("buildContextInput", () => {
  it("lists what to search about and what never to search", () => {
    const text = buildContextInput({
      projectTitle: "Fort",
      projectDescription: "Memories.",
      questions: ["What was it like?"],
      sourceTitles: ["Tom Reyes, interview"],
      terms: ["Fort Barrancas"],
      speakerNames: ["Tom Reyes"],
    });
    expect(text).toContain("1. What was it like?");
    expect(text).toContain("- Fort Barrancas");
    expect(text).toContain("Do not use any of these names in a search: Tom Reyes.");
  });
  it("has a strict schema with every property required", () => {
    const schema = buildContextOutputSchema() as {
      properties: { notes: { items: { required: string[]; properties: object } } };
    };
    expect(schema.properties.notes.items.required.sort()).toEqual(
      Object.keys(schema.properties.notes.items.properties).sort(),
    );
  });
});

describe("parseContextOutput", () => {
  const note = {
    title: "Fort Barrancas",
    summary: "A fort.",
    url: "https://www.nps.gov/pere/fort.htm",
  };
  const raw = (notes: unknown[]) => JSON.stringify({ notes });

  it("reads good notes and names their site", () => {
    const result = parseContextOutput(raw([note]));
    expect(result.notes).toEqual([{ ...note, sourceName: "nps.gov" }]);
  });
  it("drops notes with no usable address, summary or title, and repeats", () => {
    const result = parseContextOutput(
      raw([
        { ...note, url: "ftp://x" },
        { ...note, url: "not a url" },
        { ...note, summary: " " },
        { ...note, title: "" },
        note,
        { ...note, url: "https://example.org/other" },
      ]),
    );
    expect(result.notes).toHaveLength(1);
    expect(result.dropped).toBe(5);
  });
  it("drops an address the search never returned, when the response says what it returned", () => {
    const seen = new Set(["https://www.nps.gov/pere/fort.htm"]);
    const result = parseContextOutput(
      raw([note, { title: "Invented", summary: "Made up.", url: "https://made.up/page" }]),
      { seenUrls: seen },
    );
    expect(result.notes.map((n) => n.title)).toEqual(["Fort Barrancas"]);
  });
  it("caps at eight notes", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      title: `Subject ${i}`,
      summary: "x",
      url: `https://a.org/${i}`,
    }));
    expect(parseContextOutput(raw(many)).notes).toHaveLength(8);
  });
  it("treats garbage as no notes", () => {
    expect(parseContextOutput("nope")).toEqual({ notes: [], dropped: 0 });
  });
});

describe("selectNewNotes", () => {
  it("skips a subject already on file, dismissed or not, by title or address", () => {
    const candidates = [
      { title: "Fort Barrancas", summary: "s", url: "https://a.org/1", sourceName: "a.org" },
      { title: "Advanced Redoubt", summary: "s", url: "https://a.org/2", sourceName: "a.org" },
      { title: "Navy Base", summary: "s", url: "https://a.org/3", sourceName: "a.org" },
    ];
    const fresh = selectNewNotes(candidates, [
      { title: "fort barrancas!", url: "https://elsewhere" },
      { title: "Other", url: "https://a.org/2" },
    ]);
    expect(fresh.map((note) => note.title)).toEqual(["Navy Base"]);
    expect(noteKey("Fort  Barrancas!")).toBe("fort barrancas");
  });
});

describe("contextNeedsRefresh", () => {
  const questions = ["What was it like?"];
  const fingerprint = questionsFingerprint(questions);
  it("needs questions", () => {
    expect(contextNeedsRefresh({ questions: [], lastRun: null })).toBe(false);
  });
  it("gathers when never gathered", () => {
    expect(contextNeedsRefresh({ questions, lastRun: null })).toBe(true);
  });
  it("leaves a running run alone and retries a failed one", () => {
    expect(
      contextNeedsRefresh({ questions, lastRun: { status: "running", fingerprint: null } }),
    ).toBe(false);
    expect(
      contextNeedsRefresh({ questions, lastRun: { status: "failed", fingerprint: null } }),
    ).toBe(true);
  });
  it("refreshes only when the questions changed since a good run", () => {
    expect(contextNeedsRefresh({ questions, lastRun: { status: "succeeded", fingerprint } })).toBe(
      false,
    );
    expect(
      contextNeedsRefresh({
        questions: [...questions, "And?"],
        lastRun: { status: "succeeded", fingerprint },
      }),
    ).toBe(true);
    expect(questionsFingerprint(["  WHAT was it like? "])).toBe(fingerprint);
  });
});

import { describe, expect, it } from "vitest";
import { UNDERSTANDING_URL, cleanSuggestedName, parseSpeakerMapping, speakerIdentificationBody, speakerRangeFor } from "./speaker-identification";

describe("speakerIdentificationBody", () => {
  it("asks for names inferred from the conversation, with no list, at medium effort", () => {
    expect(speakerIdentificationBody("tr_1")).toEqual({
      transcript_id: "tr_1",
      speech_understanding: { request: { speaker_identification: { speaker_type: "name", effort: "medium" } } },
    });
  });
  it("can ask for low effort", () => {
    const body = speakerIdentificationBody("tr_1", "low") as { speech_understanding: { request: { speaker_identification: { effort: string } } } };
    expect(body.speech_understanding.request.speaker_identification.effort).toBe("low");
  });
  it("goes to the speech understanding endpoint of the LLM gateway", () => {
    expect(UNDERSTANDING_URL).toBe("https://llm-gateway.assemblyai.com/v1/understanding");
  });
});

describe("cleanSuggestedName", () => {
  it("keeps a first name or a short full name, trimmed and unquoted", () => {
    expect(cleanSuggestedName("  Rosa ")).toBe("Rosa");
    expect(cleanSuggestedName('"Sam Ortiz"')).toBe("Sam Ortiz");
    expect(cleanSuggestedName("Mary  Ann")).toBe("Mary Ann");
  });
  it("refuses a label, a role, a single letter, or an empty value", () => {
    for (const bad of ["Speaker A", "Voice 2", "Unknown", "Interviewer", "Host", "Participant 3", "A", "", "   ", null, 5]) expect(cleanSuggestedName(bad)).toBeNull();
  });
  it("refuses something that is not a name: digits, an address, a long description", () => {
    expect(cleanSuggestedName("Rosa42")).toBeNull();
    expect(cleanSuggestedName("rosa@example.org")).toBeNull();
    expect(cleanSuggestedName("the woman who lives near the water tower")).toBeNull();
    expect(cleanSuggestedName("x".repeat(61))).toBeNull();
  });
});

describe("parseSpeakerMapping", () => {
  const answer = (mapping: unknown, status = "success") => ({ speech_understanding: { response: { speaker_identification: { mapping, status } } } });

  it("maps the labels that got a usable name", () => {
    expect([...parseSpeakerMapping(answer({ A: "Rosa", B: "Sam", C: "Speaker C", D: "Unknown" }))]).toEqual([
      ["A", "Rosa"],
      ["B", "Sam"],
    ]);
  });
  it("counts only a success", () => {
    expect(parseSpeakerMapping(answer({ A: "Rosa" }, "error")).size).toBe(0);
  });
  it("drops two voices given one name, because that is probably one person split in two and a person should decide", () => {
    expect([...parseSpeakerMapping(answer({ A: "Rosa", B: "rosa", C: "Sam" }))]).toEqual([["C", "Sam"]]);
  });
  it("is empty for anything it cannot read", () => {
    for (const payload of [null, undefined, "x", {}, { speech_understanding: {} }, answer(null), answer("A=Rosa")]) expect(parseSpeakerMapping(payload).size).toBe(0);
  });
});

describe("speakerRangeFor", () => {
  it("gives headroom above the count and a lower floor, because some people at a table never speak", () => {
    expect(speakerRangeFor(6)).toEqual({ min: 4, max: 8 });
    expect(speakerRangeFor(2)).toEqual({ min: 1, max: 4 });
    expect(speakerRangeFor(1)).toEqual({ min: 1, max: 3 });
  });
  it("says nothing when the count is missing or not believable", () => {
    for (const n of [null, undefined, 0, 41, 2.5, Number.NaN]) expect(speakerRangeFor(n)).toBeNull();
  });
});

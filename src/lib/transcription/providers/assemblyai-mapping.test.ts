import { describe, expect, it } from "vitest";
import { mapAssemblyAiTranscript, type AssemblyAiTranscript } from "./assemblyai-mapping";

describe("mapAssemblyAiTranscript", () => {
  it("maps utterances, preserving speaker labels and millisecond timings", () => {
    const transcript: AssemblyAiTranscript = {
      id: "job-1",
      status: "completed",
      utterances: [
        {
          speaker: "A",
          start: 0,
          end: 2500,
          text: "Thanks for having me.",
          words: [
            { text: "Thanks", start: 0, end: 400 },
            { text: "for", start: 400, end: 600 },
            { text: "having", start: 600, end: 900 },
            { text: "me.", start: 900, end: 1200 },
          ],
        },
        {
          speaker: "B",
          start: 2600,
          end: 4000,
          text: "Glad you could join us.",
          words: [{ text: "Glad", start: 2600, end: 2900 }],
        },
      ],
    };

    const result = mapAssemblyAiTranscript(transcript);

    expect(result.utterances).toHaveLength(2);
    expect(result.utterances[0]).toEqual({
      speakerLabel: "A",
      startMs: 0,
      endMs: 2500,
      text: "Thanks for having me.",
      words: [
        { w: "Thanks", s: 0, e: 400 },
        { w: "for", s: 400, e: 600 },
        { w: "having", s: 600, e: 900 },
        { w: "me.", s: 900, e: 1200 },
      ],
    });
    expect(result.utterances[1]?.speakerLabel).toBe("B");
  });

  it("returns an empty utterances array when the transcript has none", () => {
    const result = mapAssemblyAiTranscript({ id: "job-2", status: "completed" });
    expect(result.utterances).toEqual([]);
  });
});

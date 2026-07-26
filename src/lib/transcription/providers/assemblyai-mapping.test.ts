import { describe, expect, it } from "vitest";
import type { Transcript } from "assemblyai";
import { mapAssemblyAiTranscript } from "./assemblyai-mapping";

describe("mapAssemblyAiTranscript", () => {
  it("maps utterances, preserving speaker labels and millisecond timings", () => {
    const transcript: Pick<Transcript, "utterances"> = {
      utterances: [
        {
          speaker: "A",
          confidence: 0.98,
          start: 0,
          end: 2500,
          text: "Thanks for having me.",
          words: [
            { text: "Thanks", start: 0, end: 400, confidence: 0.99, speaker: "A" },
            { text: "for", start: 400, end: 600, confidence: 0.99, speaker: "A" },
            { text: "having", start: 600, end: 900, confidence: 0.99, speaker: "A" },
            { text: "me.", start: 900, end: 1200, confidence: 0.99, speaker: "A" },
          ],
        },
        {
          speaker: "B",
          confidence: 0.95,
          start: 2600,
          end: 4000,
          text: "Glad you could join us.",
          words: [{ text: "Glad", start: 2600, end: 2900, confidence: 0.97, speaker: "B" }],
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
    const result = mapAssemblyAiTranscript({ utterances: null });
    expect(result.utterances).toEqual([]);
  });
});

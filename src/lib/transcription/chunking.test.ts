import { describe, it, expect } from "vitest";
import {
  buildChunks,
  buildEmbeddingInput,
  buildClipEmbeddingInput,
  CHUNK_TARGET_MS,
  CHUNK_OVERLAP_MS,
  type ChunkSourceSegment,
} from "./chunking";

const speakers = [
  { id: "s1", diarizationLabel: "A", displayName: "D.C. Reeves" },
  { id: "s2", diarizationLabel: "B", displayName: null },
];

function segment(
  startMs: number,
  endMs: number,
  text: string,
  speakerId: string | null = "s1",
): ChunkSourceSegment {
  return { startMs, endMs, text, speakerId };
}

describe("buildChunks", () => {
  it("returns nothing for an empty or blank transcript", () => {
    expect(buildChunks([], speakers)).toEqual([]);
    expect(buildChunks([segment(0, 1000, "   ")], speakers)).toEqual([]);
  });

  it("keeps a short transcript as a single window", () => {
    const chunks = buildChunks(
      [segment(0, 4000, "We cannot keep patching it."), segment(4000, 9000, "Not every spring.")],
      speakers,
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startMs: 0, endMs: 9000 });
  });

  it("labels each speaker once, where the speaker changes", () => {
    const [chunk] = buildChunks(
      [
        segment(0, 2000, "First point.", "s1"),
        segment(2000, 4000, "Second point.", "s1"),
        segment(4000, 6000, "A question.", "s2"),
        segment(6000, 8000, "An answer.", "s1"),
      ],
      speakers,
    );

    expect(chunk!.text).toBe(
      "D.C. Reeves: First point.\nSecond point.\nSpeaker B: A question.\nD.C. Reeves: An answer.",
    );
  });

  it("falls back to a placeholder when a segment has no speaker", () => {
    const [chunk] = buildChunks([segment(0, 2000, "Unattributed.", null)], speakers);
    expect(chunk!.text).toBe("Unknown speaker: Unattributed.");
  });

  it("splits past the target length and overlaps the windows", () => {
    // Twelve 8-second segments — comfortably more than one 45s window.
    const segments = Array.from({ length: 12 }, (_, i) =>
      segment(i * 8000, i * 8000 + 8000, `Line ${i}.`),
    );

    const chunks = buildChunks(segments, speakers);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.endMs).toBeGreaterThan(chunk.startMs);
    }
    // Each window after the first starts back inside the previous one.
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i]!.startMs).toBeLessThan(chunks[i - 1]!.endMs);
      expect(chunks[i]!.startMs).toBeGreaterThanOrEqual(chunks[i - 1]!.endMs - CHUNK_OVERLAP_MS);
      // ...and still moves forward, so the walk terminates.
      expect(chunks[i]!.startMs).toBeGreaterThan(chunks[i - 1]!.startMs);
    }
    // The whole transcript is covered.
    expect(chunks[0]!.startMs).toBe(0);
    expect(chunks[chunks.length - 1]!.endMs).toBe(96000);
  });

  it("does not stall on a single segment longer than the target window", () => {
    const chunks = buildChunks(
      [
        segment(0, CHUNK_TARGET_MS * 3, "One very long uninterrupted answer."),
        segment(CHUNK_TARGET_MS * 3, CHUNK_TARGET_MS * 3 + 2000, "Short follow-up."),
      ],
      speakers,
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.endMs).toBe(CHUNK_TARGET_MS * 3);
  });

  it("guarantees end_ms > start_ms even for a zero-length segment", () => {
    const [chunk] = buildChunks([segment(5000, 5000, "Blip.")], speakers);
    expect(chunk!.endMs).toBeGreaterThan(chunk!.startMs);
  });
});

describe("buildEmbeddingInput", () => {
  const project = {
    title: "Escambia County Commission, March meeting",
    interviewDate: "2026-03-14",
    description: "Monthly commission meeting; bridge repair funding was the third agenda item.",
  };

  it("prefixes the window with the project's context", () => {
    const input = buildEmbeddingInput(project, "Reeves: We cannot keep patching it.");

    expect(input).toBe(
      "Escambia County Commission, March meeting — 2026-03-14\n" +
        "Monthly commission meeting; bridge repair funding was the third agenda item.\n\n" +
        "Reeves: We cannot keep patching it.",
    );
  });

  it("omits the parts a project hasn't filled in", () => {
    expect(
      buildEmbeddingInput({ title: "Phoner", interviewDate: null, description: null }, "Text."),
    ).toBe("Phoner\n\nText.");
  });

  it("caps a long background so it can't drown out the passage", () => {
    const input = buildEmbeddingInput({ ...project, description: "x".repeat(900) }, "Text.");
    expect(input.length).toBeLessThan(600);
    expect(input).toContain("…");
    expect(input.endsWith("Text.")).toBe(true);
  });

  it("carries the same context onto a clip", () => {
    const input = buildClipEmbeddingInput(project, {
      title: "Reeves on bridge funding",
      excerpt: "We cannot keep patching it.",
    });

    expect(input).toContain("Escambia County Commission");
    expect(input).toContain("Reeves on bridge funding\nWe cannot keep patching it.");
  });
});

import { describe, expect, it } from "vitest";
import { filterSpeakerRows, speakerRows, speakerSummary } from "./speakers";

const speakers = [
  { id: "a", diarizationLabel: "A", displayName: "Mayor Reeves" },
  { id: "b", diarizationLabel: "B", displayName: null },
  { id: "c", diarizationLabel: "C", displayName: "R. Alvarez" },
  { id: "d", diarizationLabel: "D", displayName: null },
];
const segments = [
  { speakerId: "a", startMs: 0, endMs: 60_000 },
  { speakerId: "c", startMs: 60_000, endMs: 100_000 },
  { speakerId: "b", startMs: 100_000, endMs: 110_000 },
  { speakerId: "a", startMs: 110_000, endMs: 150_000 },
  { speakerId: null, startMs: 150_000, endMs: 160_000 },
];

describe("speakerRows", () => {
  const rows = speakerRows(segments, speakers);

  it("orders by talk time and measures share of attributed speech", () => {
    expect(rows.map((r) => r.speaker.id)).toEqual(["a", "c", "b", "d"]);
    expect(rows[0]).toMatchObject({ talkMs: 100_000, lines: 2, firstStartMs: 0 });
    expect(rows[0]!.share).toBeCloseTo(100 / 150);
  });

  it("keeps a speaker with no lines, last, with nothing to seek to", () => {
    expect(rows[3]).toMatchObject({ talkMs: 0, lines: 0, firstStartMs: null, share: 0 });
  });

  it("labels unnamed speakers by their diarizer letter", () => {
    expect(rows[2]).toMatchObject({ label: "Speaker B", named: false });
  });
});

describe("filterSpeakerRows", () => {
  const rows = speakerRows(segments, speakers);

  it("finds by name or diarizer letter", () => {
    expect(filterSpeakerRows(rows, { query: "alv" }).map((r) => r.speaker.id)).toEqual(["c"]);
    expect(filterSpeakerRows(rows, { query: "b" }).map((r) => r.speaker.id)).toEqual(["b"]);
  });

  it("can show only the unnamed", () => {
    expect(filterSpeakerRows(rows, { unnamedOnly: true }).map((r) => r.speaker.id)).toEqual([
      "b",
      "d",
    ]);
  });
});

describe("speakerSummary", () => {
  it("lists the top names, then the rest as counts", () => {
    expect(speakerSummary(speakerRows(segments, speakers), 1)).toEqual({
      count: 4,
      unnamed: 2,
      text: "Mayor Reeves, +1 more, 2 unnamed",
    });
  });

  it("stays short when everyone is named, and when nobody is", () => {
    const named = speakers.map((s) => ({ ...s, displayName: s.id }));
    expect(speakerSummary(speakerRows(segments, named)).text).toBe("a, c, +2 more");
    const none = speakers.map((s) => ({ ...s, displayName: null }));
    expect(speakerSummary(speakerRows(segments, none)).text).toBe("4 unnamed");
  });
});

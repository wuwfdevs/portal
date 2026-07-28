import { describe, expect, it } from "vitest";
import {
  buildTranscriptText,
  findActiveSegmentIndex,
  findFirstSegmentIndexForSpeaker,
  parseWords,
  partitionWords,
  speakerDisplayLabel,
  splitTiming,
  splitTimingFromWords,
} from "./transcript";

describe("speakerDisplayLabel", () => {
  it("prefers the human display name when set", () => {
    expect(speakerDisplayLabel("A", "Mayor Reeves")).toBe("Mayor Reeves");
  });

  it("falls back to a formatted diarization label", () => {
    expect(speakerDisplayLabel("A", null)).toBe("Speaker A");
    expect(speakerDisplayLabel("B", "   ")).toBe("Speaker B");
  });
});

describe("findActiveSegmentIndex", () => {
  const segments = [{ startMs: 0 }, { startMs: 5000 }, { startMs: 12000 }];

  it("returns -1 before the first segment starts", () => {
    expect(findActiveSegmentIndex(segments, -1)).toBe(-1);
  });

  it("returns the current segment during its span", () => {
    expect(findActiveSegmentIndex(segments, 0)).toBe(0);
    expect(findActiveSegmentIndex(segments, 3000)).toBe(0);
    expect(findActiveSegmentIndex(segments, 5000)).toBe(1);
  });

  it("holds the most recent segment through a gap between utterances", () => {
    expect(findActiveSegmentIndex(segments, 9000)).toBe(1);
  });

  it("returns the last segment once playback passes its start", () => {
    expect(findActiveSegmentIndex(segments, 999_999)).toBe(2);
  });

  it("returns -1 for an empty transcript", () => {
    expect(findActiveSegmentIndex([], 1000)).toBe(-1);
  });

  it("agrees with a linear scan at every boundary of a long transcript", () => {
    // Guards the binary search against off-by-one at segment starts, where
    // the highlight visibly hands over from one line to the next.
    const long = Array.from({ length: 500 }, (_, i) => ({ startMs: i * 1000 }));
    const scan = (ms: number) => {
      let active = -1;
      long.forEach((segment, index) => {
        if (segment.startMs <= ms) active = index;
      });
      return active;
    };

    for (const ms of [-1, 0, 1, 999, 1000, 1001, 249_500, 499_000, 499_001, 1_000_000]) {
      expect(findActiveSegmentIndex(long, ms)).toBe(scan(ms));
    }
  });
});

describe("findFirstSegmentIndexForSpeaker", () => {
  const segments = [{ speakerId: "a" }, { speakerId: "b" }, { speakerId: "a" }];

  it("returns the first segment attributed to a speaker", () => {
    expect(findFirstSegmentIndexForSpeaker(segments, "a")).toBe(0);
    expect(findFirstSegmentIndexForSpeaker(segments, "b")).toBe(1);
  });

  it("returns -1 when the speaker has no segments", () => {
    expect(findFirstSegmentIndexForSpeaker(segments, "c")).toBe(-1);
  });
});

describe("splitTiming", () => {
  it("splits proportionally by character-length ratio", () => {
    // 10s segment, split at the 25% mark of a 40-char text.
    const result = splitTiming(0, 10_000, 10, 40);
    expect(result).toEqual({ firstEndMs: 2500, secondStartMs: 2500 });
  });

  it("clamps the boundary so both halves stay at least the minimum duration", () => {
    // Splitting right at the very start or end would otherwise produce a
    // zero-length half, violating the end_ms > start_ms check constraint.
    const nearStart = splitTiming(0, 1000, 0, 100);
    expect(nearStart).not.toBeNull();
    expect(nearStart!.firstEndMs).toBeGreaterThan(0);

    const nearEnd = splitTiming(0, 1000, 100, 100);
    expect(nearEnd).not.toBeNull();
    expect(nearEnd!.secondStartMs).toBeLessThan(1000);
  });

  it("returns null when the segment is too short to split", () => {
    expect(splitTiming(0, 3, 1, 2)).toBeNull();
  });
});

describe("parseWords", () => {
  it("keeps well-formed words", () => {
    const words = [
      { w: "hello", s: 0, e: 500 },
      { w: "there", s: 500, e: 900 },
    ];
    expect(parseWords(words)).toEqual(words);
  });

  it("returns an empty array for anything that isn't a word array", () => {
    expect(parseWords(null)).toEqual([]);
    expect(parseWords(undefined)).toEqual([]);
    expect(parseWords("hello")).toEqual([]);
    expect(parseWords({ w: "hello", s: 0, e: 1 })).toEqual([]);
  });

  it("drops entries that don't carry the full word shape", () => {
    const result = parseWords([
      { w: "keep", s: 0, e: 100 },
      { w: "no-timing" },
      { s: 100, e: 200 },
      null,
      "nope",
    ]);
    expect(result).toEqual([{ w: "keep", s: 0, e: 100 }]);
  });
});

describe("partitionWords", () => {
  const text = "The stale smell of old beer lingers.";
  const words = [
    { w: "The", s: 0, e: 100 },
    { w: "stale", s: 100, e: 200 },
    { w: "smell", s: 200, e: 300 },
    { w: "of", s: 300, e: 400 },
    { w: "old", s: 400, e: 500 },
    { w: "beer", s: 500, e: 600 },
    { w: "lingers.", s: 600, e: 700 },
  ];

  it("splits at the word boundary matching the character offset", () => {
    // "The stale smell " is 16 characters — three words before the split.
    const { first, second } = partitionWords(words, 16, text);
    expect(first.map((word) => word.w)).toEqual(["The", "stale", "smell"]);
    expect(second.map((word) => word.w)).toEqual(["of", "old", "beer", "lingers."]);
  });

  it("keeps a word that the split lands inside with the first half", () => {
    // Offset 13 falls inside "smell".
    const { first, second } = partitionWords(words, 13, text);
    expect(first.map((word) => word.w)).toEqual(["The", "stale", "smell"]);
    expect(second[0]?.w).toBe("of");
  });

  it("loses no words — the two halves always reconstruct the whole", () => {
    for (let offset = 0; offset <= text.length; offset += 1) {
      const { first, second } = partitionWords(words, offset, text);
      expect([...first, ...second]).toEqual(words);
    }
  });

  it("handles a segment whose timings were already discarded", () => {
    expect(partitionWords([], 10, text)).toEqual({ first: [], second: [] });
  });

  it("clamps to the available words when the text and timings have drifted apart", () => {
    // Corrected text can carry more tokens than the ASR's word array.
    const { first, second } = partitionWords(words.slice(0, 2), text.length, text);
    expect(first).toHaveLength(2);
    expect(second).toEqual([]);
  });
});

describe("splitTimingFromWords", () => {
  it("cuts in the gap between the two halves' words", () => {
    const first = [{ w: "hello", s: 1000, e: 1400 }];
    const second = [{ w: "there", s: 1900, e: 2300 }];
    expect(splitTimingFromWords(first, second, 1000, 2300)).toEqual({
      firstEndMs: 1400,
      secondStartMs: 1900,
    });
  });

  it("returns null when either half has no words to anchor to", () => {
    const word = [{ w: "hello", s: 0, e: 400 }];
    expect(splitTimingFromWords([], word, 0, 1000)).toBeNull();
    expect(splitTimingFromWords(word, [], 0, 1000)).toBeNull();
  });

  it("returns null when the segment is too short to split at all", () => {
    const first = [{ w: "a", s: 0, e: 1 }];
    const second = [{ w: "b", s: 1, e: 3 }];
    expect(splitTimingFromWords(first, second, 0, 3)).toBeNull();
  });

  it("clamps word timings that fall outside the segment's own range", () => {
    // Drifted words must never produce a half violating end_ms > start_ms.
    const first = [{ w: "early", s: -500, e: -100 }];
    const second = [{ w: "late", s: 99_000, e: 99_500 }];
    const result = splitTimingFromWords(first, second, 0, 10_000);
    expect(result).not.toBeNull();
    expect(result!.firstEndMs).toBeGreaterThan(0);
    expect(result!.secondStartMs).toBeLessThan(10_000);
    expect(result!.secondStartMs).toBeGreaterThanOrEqual(result!.firstEndMs);
  });
});

describe("buildTranscriptText", () => {
  const speakers = [
    { id: "s1", diarizationLabel: "A", displayName: "Mayor Reeves" },
    { id: "s2", diarizationLabel: "B", displayName: null },
  ];
  const segments = [
    { startMs: 0, text: "The bridge money was never ours.", speakerId: "s1" },
    { startMs: 6000, text: "We asked twice.", speakerId: "s1" },
    { startMs: 91000, text: "And you got nothing.", speakerId: "s2" },
  ];

  it("groups consecutive lines under one speaker heading, with timestamps", () => {
    expect(
      buildTranscriptText(
        { title: "Reeves interview", interviewDate: "2026-07-22" },
        segments,
        speakers,
      ),
    ).toBe(
      [
        "Reeves interview",
        "2026-07-22",
        "",
        "MAYOR REEVES",
        "[0:00] The bridge money was never ours.",
        "[0:06] We asked twice.",
        "",
        "SPEAKER B",
        "[1:31] And you got nothing.",
        "",
      ].join("\n"),
    );
  });

  it("repeats a heading when the speaker changes back", () => {
    const text = buildTranscriptText(
      { title: "Interview", interviewDate: null },
      [
        { startMs: 0, text: "One.", speakerId: "s1" },
        { startMs: 1000, text: "Two.", speakerId: "s2" },
        { startMs: 2000, text: "Three.", speakerId: "s1" },
      ],
      speakers,
    );

    expect(text.match(/MAYOR REEVES/g)).toHaveLength(2);
  });

  it("omits the date line when the project has no interview date", () => {
    const text = buildTranscriptText(
      { title: "Interview", interviewDate: null },
      segments,
      speakers,
    );
    expect(text.split("\n")[1]).toBe("");
  });

  it("labels lines with no speaker, and skips blank ones", () => {
    const text = buildTranscriptText(
      { title: "Interview", interviewDate: null },
      [
        { startMs: 0, text: "   ", speakerId: null },
        { startMs: 1000, text: "Something said.", speakerId: null },
      ],
      speakers,
    );

    expect(text).toBe("Interview\n\nUNKNOWN SPEAKER\n[0:01] Something said.\n");
  });

  it("returns just the header for a transcript with no speech", () => {
    expect(buildTranscriptText({ title: "Interview", interviewDate: null }, [], speakers)).toBe(
      "Interview\n",
    );
  });
});

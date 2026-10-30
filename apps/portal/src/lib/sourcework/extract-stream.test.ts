import { describe, expect, it } from "vitest";
import { encodeStreamEvent, parseStreamBuffer, progressDetail } from "./extract-stream";

describe("stream lines", () => {
  it("round-trips events and keeps a half-sent line for the next chunk", () => {
    const first = encodeStreamEvent({ type: "progress", done: 1, total: 3 });
    const second = encodeStreamEvent({
      type: "result",
      ok: true,
      added: 4,
      skippedReviewed: 1,
      dropped: 0,
    });
    const half = second.slice(0, 10);
    const parsed = parseStreamBuffer(first + half);
    expect(parsed.events).toEqual([{ type: "progress", done: 1, total: 3 }]);
    expect(parsed.rest).toBe(half);
    const rest = parseStreamBuffer(parsed.rest + second.slice(10));
    expect(rest.events).toEqual([
      { type: "result", ok: true, added: 4, skippedReviewed: 1, dropped: 0 },
    ]);
    expect(rest.rest).toBe("");
  });

  it("skips lines that aren't events", () => {
    const parsed = parseStreamBuffer(
      'nope\n{"type":"mystery"}\n{"type":"result","ok":false,"error":"boom"}\n',
    );
    expect(parsed.events).toEqual([{ type: "result", ok: false, error: "boom" }]);
  });
});

describe("progressDetail", () => {
  it("names the part being read, only for a source read in several", () => {
    expect(progressDetail(0, 1)).toBeNull();
    expect(progressDetail(0, 3)).toBe("Reading part 1 of 3");
    expect(progressDetail(3, 3)).toBe("Reading part 3 of 3");
  });
});

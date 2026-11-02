// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSseBlock, readSseEvents } from "./read-sse";

function responseOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

async function collect<T>(gen: AsyncGenerator<T>) {
  const out: T[] = [];
  for await (const event of gen) out.push(event);
  return out;
}

describe("parseSseBlock", () => {
  it("reads data lines and ignores everything else", () => {
    expect(parseSseBlock('data: {"a":1}')).toEqual({ a: 1 });
    expect(parseSseBlock(": keep-alive")).toBeNull();
    expect(parseSseBlock("data: {oops")).toBeNull();
  });
});

describe("readSseEvents", () => {
  it("joins events split across chunks and skips junk", async () => {
    const events = await collect(
      readSseEvents<{ n: number }>(
        responseOf(['data: {"n":1}\n\ndata: {"n"', ":2}\n\n: ping\n\ndata: not json\n\n"]),
      ),
    );
    expect(events).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("delivers a final event with no trailing blank line", async () => {
    const events = await collect(readSseEvents<{ n: number }>(responseOf(['data: {"n":3}'])));
    expect(events).toEqual([{ n: 3 }]);
  });

  it("stops once the signal has aborted", async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    for await (const event of readSseEvents<{ n: number }>(
      responseOf(['data: {"n":1}\n\n', 'data: {"n":2}\n\n']),
      controller.signal,
    )) {
      seen.push(event.n);
      controller.abort();
    }
    expect(seen).toEqual([1]);
  });
});

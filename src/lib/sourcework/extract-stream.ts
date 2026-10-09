// The wire between the extraction route and the browser (no "server-only": the
// route writes these lines and the Sources tab reads them). Extraction is one
// long request, so it answers as newline-delimited JSON: a progress line as each
// window of the source is read, then one result line. Closing the tab ends the
// request, which is why the design says the run "keeps running while it is open
// in another tab" and no further (docs/sourcework-analysis-design.md §9: every
// step is a click, there is no queue).

export type ExtractStreamEvent =
  | { type: "progress"; done: number; total: number }
  | { type: "result"; ok: true; added: number; skippedReviewed: number; dropped: number }
  | { type: "result"; ok: false; error: string };

export function encodeStreamEvent(event: ExtractStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Splits a chunk buffer into whole events and the unfinished tail. A line that
 * isn't a known event is skipped rather than trusted.
 */
export function parseStreamBuffer(buffer: string): { events: ExtractStreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: ExtractStreamEvent[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const event = parsed as Partial<ExtractStreamEvent> | null;
    if (
      event?.type === "progress" &&
      typeof event.done === "number" &&
      typeof event.total === "number"
    ) {
      events.push({ type: "progress", done: event.done, total: event.total });
    } else if (event?.type === "result" && event.ok === true) {
      const ok = event as Extract<ExtractStreamEvent, { type: "result"; ok: true }>;
      events.push({
        type: "result",
        ok: true,
        added: Number(ok.added) || 0,
        skippedReviewed: Number(ok.skippedReviewed) || 0,
        dropped: Number(ok.dropped) || 0,
      });
    } else if (event?.type === "result" && event.ok === false) {
      const failed = event as Extract<ExtractStreamEvent, { type: "result"; ok: false }>;
      events.push({
        type: "result",
        ok: false,
        error: String(failed.error ?? "Extraction failed."),
      });
    }
  }
  return { events, rest };
}

/** "Reading part 2 of 3" — the running line under a source in the batch panel. */
export function progressDetail(done: number, total: number): string | null {
  if (total <= 1) return null;
  return `Reading part ${Math.min(done + 1, total)} of ${total}`;
}

export type ExtractClientResult =
  | { ok: true; added: number; skippedReviewed: number; dropped: number }
  | { ok: false; error: string; retryable: boolean };

/**
 * Runs one source's extraction from the browser and reports its progress. A
 * dropped connection is retryable (the run, if it died, is recovered by the
 * server as stale); a refusal by the server is not.
 */
export async function requestExtraction(args: {
  projectId: string;
  sourceId: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<ExtractClientResult> {
  let response: Response;
  try {
    response = await fetch("/api/sourcework/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: args.projectId, sourceId: args.sourceId }),
      signal: args.signal,
    });
  } catch {
    return {
      ok: false,
      error: "The connection dropped before extraction finished.",
      retryable: true,
    };
  }
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      error: body?.error ?? "Extraction couldn't start.",
      retryable: response.status >= 500,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: !done });
      const parsed = parseStreamBuffer(done ? `${buffer}\n` : buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.type === "progress") args.onProgress?.(event.done, event.total);
        else if (event.ok) {
          return {
            ok: true,
            added: event.added,
            skippedReviewed: event.skippedReviewed,
            dropped: event.dropped,
          };
        } else return { ok: false, error: event.error, retryable: false };
      }
      if (done) break;
    }
  } catch {
    return {
      ok: false,
      error: "The connection dropped before extraction finished.",
      retryable: true,
    };
  }
  return { ok: false, error: "The connection closed before extraction finished.", retryable: true };
}

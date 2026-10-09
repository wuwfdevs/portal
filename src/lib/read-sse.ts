/** Shown when the request itself failed (offline, the server unreachable). */
export const SSE_UNREACHABLE_MESSAGE = "Couldn't reach the assistant. Try again.";
/** Shown when the stream closed without its terminal `done`/`error` event. */
export const SSE_STOPPED_MESSAGE = "The assistant stopped responding unexpectedly.";

/**
 * Parse one blocks-separated chunk of a server-sent-event stream into its JSON
 * payload, or null for anything that isn't a readable `data:` line (a comment,
 * a keep-alive, a half-written event).
 */
export function parseSseBlock<T>(block: string): T | null {
  const line = block.trim();
  if (!line.startsWith("data:")) return null;
  try {
    return JSON.parse(line.slice("data:".length).trim()) as T;
  } catch {
    return null;
  }
}

/**
 * Yield each JSON `data:` event of an SSE response as it arrives. Stops, and
 * releases the connection, when the consumer stops iterating or `signal`
 * aborts (the read then rejects with an AbortError, so callers check
 * `signal.aborted` in their catch). Events are separated by a blank line; a
 * final event the server left unterminated is still delivered.
 */
export async function* readSseEvents<T>(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseSseBlock<T>(block);
        if (signal?.aborted) return;
        if (event !== null) yield event;
      }
    }
    buffer += decoder.decode();
    const last = parseSseBlock<T>(buffer);
    if (last !== null) yield last;
  } finally {
    reader.cancel().catch(() => {});
  }
}

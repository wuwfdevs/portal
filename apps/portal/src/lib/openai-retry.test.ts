import { describe, expect, it } from "vitest";
import { parseRetryAfterMs } from "./openai-retry";

describe("parseRetryAfterMs", () => {
  it("reads seconds, milliseconds, and minutes", () => {
    expect(parseRetryAfterMs("Rate limit reached. Please try again in 1.52s. Visit…")).toBe(1520);
    expect(parseRetryAfterMs("Please try again in 820ms.")).toBe(820);
    expect(parseRetryAfterMs("Please try again in 1m3.5s.")).toBe(63_500);
  });

  it("is null without a hint", () => {
    expect(parseRetryAfterMs("Rate limit reached for gpt in organization org-x.")).toBeNull();
  });
});

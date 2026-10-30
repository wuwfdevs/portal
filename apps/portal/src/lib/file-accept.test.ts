import { describe, expect, it } from "vitest";
import { matchesAccept } from "./file-accept";

describe("matchesAccept", () => {
  const accept = "audio/*,video/*,application/pdf";

  it("matches wildcard and exact types", () => {
    expect(matchesAccept({ name: "a.wav", type: "audio/wav" }, accept)).toBe(true);
    expect(matchesAccept({ name: "a.pdf", type: "application/pdf" }, accept)).toBe(true);
    expect(matchesAccept({ name: "a.png", type: "image/png" }, accept)).toBe(false);
  });

  it("matches by extension", () => {
    expect(matchesAccept({ name: "Report.PDF", type: "" }, ".pdf")).toBe(true);
    expect(matchesAccept({ name: "a.txt", type: "text/plain" }, ".pdf")).toBe(false);
  });

  it("allows everything without a rule", () => {
    expect(matchesAccept({ name: "a", type: "" })).toBe(true);
    expect(matchesAccept({ name: "a", type: "" }, "")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { draftDiffersFromLive, initialPromptText } from "./trial-sample";

describe("initialPromptText", () => {
  it("prefers the draft, then live, then the built-in", () => {
    expect(initialPromptText({ draft: "d", live: "l", builtIn: "b" })).toBe("d");
    expect(initialPromptText({ draft: null, live: "l", builtIn: "b" })).toBe("l");
    expect(initialPromptText({ draft: null, live: null, builtIn: "b" })).toBe("b");
    expect(initialPromptText({ draft: "", live: "l", builtIn: "b" })).toBe("");
  });
});

describe("draftDiffersFromLive", () => {
  it("ignores line endings and outer blanks", () => {
    expect(draftDiffersFromLive("a\r\nb \n", "a\nb")).toBe(false);
    expect(draftDiffersFromLive("a\nc", "a\nb")).toBe(true);
    expect(draftDiffersFromLive(null, "a")).toBe(false);
  });
});

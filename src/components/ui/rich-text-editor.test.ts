import { describe, expect, it } from "vitest";
import { EDITOR_CONTENT_BASE_CLASS } from "./rich-text-editor";

describe("EDITOR_CONTENT_BASE_CLASS", () => {
  it("keeps the ProseMirror surface at a mobile-safe (>=16px) font size", () => {
    // Regression guard — this contenteditable div is the fifth control to
    // reintroduce the mobile input-zoom bug (CLAUDE.md, "Rules for making
    // changes"): it's not a native form element, so it never went through
    // controlClasses' fix, and shipped with a bare text-sm (14px).
    expect(EDITOR_CONTENT_BASE_CLASS).toContain("text-base");
    expect(EDITOR_CONTENT_BASE_CLASS).toMatch(/(?:^|\s)sm:text-sm(?:\s|$)/);
    // Guards against a *bare* text-sm being retyped back in later.
    expect(EDITOR_CONTENT_BASE_CLASS).not.toMatch(/(?:^|\s)text-sm(?:\s|$)/);
  });
});

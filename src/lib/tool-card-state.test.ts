import { describe, expect, it } from "vitest";
import { getToolCardState } from "./tool-card-state";

describe("getToolCardState", () => {
  it("is openable when a tool is available, enabled, and the user has access", () => {
    const state = getToolCardState("available", true, true);
    expect(state.mode).toBe("open");
    expect(state.actionLabel).toBe("Open Tool");
  });

  it("is restricted when a tool is available and enabled but the user lacks access", () => {
    const state = getToolCardState("available", true, false);
    expect(state.mode).toBe("restricted");
    expect(state.statusLabel).toBe("Restricted");
    expect(state.actionLabel).toBeNull();
  });

  it("is unavailable while in development, regardless of access", () => {
    expect(getToolCardState("in_development", true, true).mode).toBe("unavailable");
    expect(getToolCardState("in_development", true, false).mode).toBe("unavailable");
  });

  it("labels planned tools distinctly from in-development ones", () => {
    const planned = getToolCardState("planned", true, false);
    const inDevelopment = getToolCardState("in_development", true, false);
    expect(planned.actionLabel).toBe("Coming later");
    expect(inDevelopment.actionLabel).toBe("Learn more");
    expect(planned.statusLabel).not.toBe(inDevelopment.statusLabel);
  });

  it("hides a proposed tool rather than passing it off as in development", () => {
    for (const hasAccess of [true, false]) {
      const state = getToolCardState("proposed", true, hasAccess);
      expect(state.mode).toBe("hidden");
      expect(state.statusLabel).toBe("Proposed");
      expect(state.actionLabel).toBeNull();
    }
  });

  it("is never openable when an administrator has disabled the tool, even with access", () => {
    for (const status of ["available", "in_development", "planned"] as const) {
      const state = getToolCardState(status, false, true);
      expect(state.mode).toBe("unavailable");
      expect(state.statusLabel).toBe("Unavailable");
      expect(state.actionLabel).toBeNull();
    }
  });

  it("disabled takes priority over an otherwise-open available tool", () => {
    // The exact bug report this guards: a tool a user was once granted, then
    // an administrator switched off, must never render as "Open Tool" again.
    const state = getToolCardState("available", false, true);
    expect(state.mode).not.toBe("open");
    expect(state.actionLabel).not.toBe("Open Tool");
  });
});

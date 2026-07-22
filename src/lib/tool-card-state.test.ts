import { describe, expect, it } from "vitest";
import { getToolCardState } from "./tool-card-state";

describe("getToolCardState", () => {
  it("is openable when a tool is available and the user has access", () => {
    const state = getToolCardState("available", true);
    expect(state.mode).toBe("open");
    expect(state.actionLabel).toBe("Open Tool");
  });

  it("is restricted when a tool is available but the user lacks access", () => {
    const state = getToolCardState("available", false);
    expect(state.mode).toBe("restricted");
    expect(state.statusLabel).toBe("Restricted");
    expect(state.actionLabel).toBeNull();
  });

  it("is unavailable while in development, regardless of access", () => {
    expect(getToolCardState("in_development", true).mode).toBe("unavailable");
    expect(getToolCardState("in_development", false).mode).toBe("unavailable");
  });

  it("labels planned tools distinctly from in-development ones", () => {
    const planned = getToolCardState("planned", false);
    const inDevelopment = getToolCardState("in_development", false);
    expect(planned.actionLabel).toBe("Coming later");
    expect(inDevelopment.actionLabel).toBe("Learn more");
    expect(planned.statusLabel).not.toBe(inDevelopment.statusLabel);
  });
});

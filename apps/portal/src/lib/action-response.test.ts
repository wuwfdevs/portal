import { describe, expect, it } from "vitest";
import { actionError, actionOk, type ActionResult } from "./action-response";

describe("action results", () => {
  it("builds ok results with and without data", () => {
    expect(actionOk()).toEqual({ ok: true });
    expect(actionOk({ id: "1" })).toEqual({ ok: true, id: "1" });
  });

  it("builds error results the client can branch on", () => {
    const result: ActionResult<{ id: string }> = actionError("nope");
    expect(result).toEqual({ ok: false, error: "nope" });
    if (!result.ok) expect(result.error).toBe("nope");
  });
});

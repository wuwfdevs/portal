import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { bestEffort } from "./best-effort";

describe("bestEffort", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns true and stays quiet when the write succeeded", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await bestEffort(Promise.resolve({ error: null }), "Could not do it")).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs the error and returns false when the write failed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = { message: "boom" } as PostgrestError;
    expect(await bestEffort(Promise.resolve({ error }), "Could not do it")).toBe(false);
    expect(log).toHaveBeenCalledWith("Could not do it:", error);
  });
});

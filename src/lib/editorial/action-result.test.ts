import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import type { PostgrestError } from "@supabase/supabase-js";
import { deleteOrFail, failWith } from "./action-result";

const result = (data: unknown[] | null, error: PostgrestError | null = null) =>
  Promise.resolve({ data, error });

describe("failWith", () => {
  it("appends the error to a path with or without a query", () => {
    expect(() => failWith("/a", "no")).toThrow("redirect:/a?error=no");
    expect(() => failWith("/a?new=1", "no")).toThrow("redirect:/a?new=1&error=no");
  });
});

describe("deleteOrFail", () => {
  it("passes when a row was removed", async () => {
    await expect(
      deleteOrFail(result([{ id: "1" }]), "/a", "Could not delete"),
    ).resolves.toBeUndefined();
  });

  it("fails when nothing matched (RLS refusal or already gone)", async () => {
    await expect(deleteOrFail(result([]), "/a", "Could not delete")).rejects.toThrow(
      "redirect:/a?error=",
    );
    await expect(deleteOrFail(result(null), "/a", "Could not delete", "Gone.")).rejects.toThrow(
      "redirect:/a?error=Gone.",
    );
  });

  it("fails with the database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = { message: "denied" } as PostgrestError;
    await expect(deleteOrFail(result(null, error), "/a", "Could not delete")).rejects.toThrow(
      "redirect:/a?error=Could%20not%20delete%3A%20denied",
    );
  });
});

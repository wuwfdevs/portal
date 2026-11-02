import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { readPage } from "./pagination-read";

const error = (code: string): PostgrestError =>
  ({ code, message: "boom", details: "", hint: "", name: "PostgrestError" }) as PostgrestError;

describe("readPage", () => {
  it("returns the rows and the count of a normal page", async () => {
    const countAll = vi.fn();
    const page = await readPage({ data: [{ id: 1 }], count: 41, error: null }, "things", countAll);
    expect(page).toEqual({ rows: [{ id: 1 }], total: 41 });
    expect(countAll).not.toHaveBeenCalled();
  });

  it("treats a page past the end as no rows and re-counts", async () => {
    const countAll = vi.fn().mockResolvedValue(12);
    const page = await readPage(
      { data: null, count: null, error: error("PGRST103") },
      "things",
      countAll,
    );
    expect(page).toEqual({ rows: [], total: 12 });
  });

  it("still throws every other error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      readPage({ data: null, count: null, error: error("42501") }, "things", async () => 0),
    ).rejects.toThrow(/Could not load things/);
  });

  it("reports a missing count as zero", async () => {
    expect(await readPage({ data: [], count: null, error: null }, "things", async () => 0)).toEqual(
      {
        rows: [],
        total: 0,
      },
    );
  });
});

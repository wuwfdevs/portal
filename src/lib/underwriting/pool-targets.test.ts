import { describe, expect, it } from "vitest";
import { collectTargetRows, parseTarget } from "./pool-targets";

function form(entries: [string, string][]): FormData {
  const formData = new FormData();
  for (const [name, value] of entries) formData.append(name, value);
  return formData;
}

describe("parseTarget", () => {
  it("treats a row with nothing filled in as blank", () => {
    expect(
      parseTarget(
        form([
          ["program_id", ""],
          ["notes", "  "],
        ]),
        "",
      ),
    ).toEqual({ kind: "blank" });
  });

  it("reads a full row under a prefix", () => {
    const result = parseTarget(
      form([
        ["target_a_program_id", "prog-1"],
        ["target_a_window_start", "06:00"],
        ["target_a_window_end", "09:00"],
        ["target_a_days_of_week", "5"],
        ["target_a_days_of_week", "1"],
        ["target_a_notes", "AM only"],
      ]),
      "target_a_",
    );
    expect(result).toEqual({
      kind: "target",
      target: {
        program_id: "prog-1",
        window_start: "06:00",
        window_end: "09:00",
        days_of_week: [1, 5],
        notes: "AM only",
      },
    });
  });

  it("keeps a program-only row, with any window and any day", () => {
    expect(parseTarget(form([["program_id", "prog-1"]]), "")).toEqual({
      kind: "target",
      target: {
        program_id: "prog-1",
        window_start: null,
        window_end: null,
        days_of_week: null,
        notes: null,
      },
    });
  });

  it("is not blank when only days are checked", () => {
    const result = parseTarget(form([["days_of_week", "6"]]), "");
    expect(result.kind).toBe("target");
  });

  it("rejects half a window", () => {
    expect(parseTarget(form([["window_start", "06:00"]]), "")).toEqual({
      kind: "error",
      message: "Give both ends of the window, or neither.",
    });
  });

  it("rejects a window that ends before it starts", () => {
    expect(
      parseTarget(
        form([
          ["window_start", "09:00"],
          ["window_end", "06:00"],
        ]),
        "",
      ),
    ).toEqual({ kind: "error", message: "The window must end after it starts." });
  });

  it("ignores out-of-range day values", () => {
    const result = parseTarget(
      form([
        ["days_of_week", "9"],
        ["days_of_week", "x"],
      ]),
      "",
    );
    expect(result).toEqual({ kind: "blank" });
  });
});

describe("collectTargetRows", () => {
  it("returns the filled rows in key order and drops blank ones", () => {
    const result = collectTargetRows(
      form([
        ["target_keys", "k1"],
        ["target_keys", "k2"],
        ["target_keys", "k3"],
        ["target_k1_program_id", "prog-1"],
        ["target_k3_notes", "second hour only"],
      ]),
    );
    expect(result).toEqual({
      ok: true,
      targets: [
        {
          program_id: "prog-1",
          window_start: null,
          window_end: null,
          days_of_week: null,
          notes: null,
        },
        {
          program_id: null,
          window_start: null,
          window_end: null,
          days_of_week: null,
          notes: "second hour only",
        },
      ],
    });
  });

  it("names the failing row by its position", () => {
    const result = collectTargetRows(
      form([
        ["target_keys", "a"],
        ["target_keys", "b"],
        ["target_b_window_start", "07:00"],
      ]),
    );
    expect(result).toEqual({
      ok: false,
      message: "Target 2: Give both ends of the window, or neither.",
    });
  });

  it("allows zero targets", () => {
    expect(collectTargetRows(form([]))).toEqual({ ok: true, targets: [] });
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { dateField, numberField, optionalNumberField, uuidField } from "./action-fields";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const fails = (fn: () => unknown, message: string) =>
  expect(fn).toThrow(`redirect:/p?error=${encodeURIComponent(message)}`);

describe("numberField", () => {
  it("reads typed currency", () => {
    expect(numberField(form({ n: "$1,200" }), "n", "/p", "Rate")).toBe(1200);
  });
  it("fails when blank or not a number", () => {
    fails(() => numberField(form({}), "n", "/p", "Rate"), "Rate is required.");
    fails(() => numberField(form({ n: "x" }), "n", "/p", "Rate"), "Rate must be a number.");
  });
});

describe("optionalNumberField", () => {
  it("is null when blank and still rejects junk", () => {
    expect(optionalNumberField(form({}), "n", "/p", "Rate")).toBeNull();
    fails(() => optionalNumberField(form({ n: "x" }), "n", "/p", "Rate"), "Rate must be a number.");
  });
});

describe("uuidField and dateField", () => {
  it("accept good values", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(uuidField(form({ u: id }), "u", "/p", "a partner")).toBe(id);
    expect(dateField(form({ d: "2026-10-09" }), "d", "/p", "The date")).toBe("2026-10-09");
  });
  it("fail on bad ones, including impossible dates", () => {
    fails(() => uuidField(form({ u: "nope" }), "u", "/p", "a partner"), "Choose a partner.");
    fails(
      () => dateField(form({ d: "2026-02-30" }), "d", "/p", "The date"),
      "The date must be a date.",
    );
  });
});

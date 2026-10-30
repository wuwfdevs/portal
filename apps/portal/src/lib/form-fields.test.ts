import { describe, expect, it } from "vitest";
import {
  checkboxField,
  csvField,
  field,
  isUuid,
  optionalField,
  optionalInt,
  parseNumberInput,
} from "./form-fields";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("field readers", () => {
  it("trims, and treats missing as empty", () => {
    expect(field(form({ a: "  hi " }), "a")).toBe("hi");
    expect(field(form({}), "a")).toBe("");
  });

  it("returns null for blank optional fields", () => {
    expect(optionalField(form({ a: "   " }), "a")).toBeNull();
    expect(optionalField(form({ a: " x " }), "a")).toBe("x");
  });

  it("reads whole numbers and rejects junk", () => {
    expect(optionalInt(form({ a: "42" }), "a")).toBe(42);
    expect(optionalInt(form({ a: "4.9" }), "a")).toBe(4);
    expect(optionalInt(form({ a: "x" }), "a")).toBeNull();
    expect(optionalInt(form({}), "a")).toBeNull();
  });

  it("reads checkboxes", () => {
    expect(checkboxField(form({ a: "on" }), "a")).toBe(true);
    expect(checkboxField(form({ a: "true" }), "a")).toBe(true);
    expect(checkboxField(form({ a: "false" }), "a")).toBe(false);
    expect(checkboxField(form({}), "a")).toBe(false);
  });

  it("splits comma lists", () => {
    expect(csvField(form({ a: " x, y ,,z " }), "a")).toEqual(["x", "y", "z"]);
    expect(csvField(form({}), "a")).toEqual([]);
  });
});

describe("isUuid", () => {
  it("accepts uuids in either case and nothing else", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("parseNumberInput", () => {
  it("ignores currency, percent, commas and spaces", () => {
    expect(parseNumberInput("$1,250.50")).toBe(1250.5);
    expect(parseNumberInput(" 12 % ")).toBe(12);
  });

  it("separates blank from invalid", () => {
    expect(parseNumberInput("  ")).toBeNull();
    expect(Number.isNaN(parseNumberInput("abc"))).toBe(true);
  });
});

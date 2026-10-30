import { describe, expect, it } from "vitest";
import { z } from "zod";
import { splitConfirmed, toolInputSchema } from "./tool-schema";

describe("toolInputSchema", () => {
  it("returns the capability's own schema unchanged when confirmation is not required", () => {
    const input = z.object({ pitchId: z.string() });
    const schema = toolInputSchema({ input, confirmation: "none" });
    expect(schema).toBe(input);
    expect(schema.safeParse({ pitchId: "abc" }).success).toBe(true);
  });

  it("adds an optional confirmed field when confirmation is required", () => {
    const input = z.object({ pitchId: z.string() });
    const schema = toolInputSchema({ input, confirmation: "required" }) as z.ZodObject<
      Record<string, z.ZodTypeAny>
    >;

    expect(schema.safeParse({ pitchId: "abc" }).success).toBe(true);
    expect(schema.safeParse({ pitchId: "abc", confirmed: true }).success).toBe(true);
    const parsed = schema.parse({ pitchId: "abc", confirmed: true });
    expect(parsed).toEqual({ pitchId: "abc", confirmed: true });
  });

  it("adds an optional confirmed field to every branch of a discriminated-union schema", () => {
    const input = z.discriminatedUnion("outcome", [
      z.object({ outcome: z.literal("aired"), itemId: z.string() }),
      z.object({ outcome: z.literal("missed"), itemId: z.string(), reason: z.string() }),
    ]);
    const schema = toolInputSchema({ input, confirmation: "required" });

    expect(schema.safeParse({ outcome: "aired", itemId: "abc" }).success).toBe(true);
    expect(
      schema.safeParse({ outcome: "aired", itemId: "abc", confirmed: true }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ outcome: "missed", itemId: "abc", reason: "host_error", confirmed: true })
        .success,
    ).toBe(true);
    // The discriminant is still enforced — an unknown outcome still fails.
    expect(schema.safeParse({ outcome: "other", itemId: "abc" }).success).toBe(false);
  });

  it("throws for a required-confirmation capability whose input isn't an object or discriminated-union schema", () => {
    expect(() => toolInputSchema({ input: z.string(), confirmation: "required" })).toThrow(
      /object or discriminated-union input schema/,
    );
  });
});

describe("splitConfirmed", () => {
  it("pulls the confirmed flag out of the raw args and leaves the rest as input", () => {
    expect(splitConfirmed({ pitchId: "abc", confirmed: true })).toEqual({
      input: { pitchId: "abc" },
      confirmed: true,
    });
  });

  it("treats a missing or non-true confirmed as false", () => {
    expect(splitConfirmed({ pitchId: "abc" })).toEqual({
      input: { pitchId: "abc" },
      confirmed: false,
    });
    expect(splitConfirmed({ pitchId: "abc", confirmed: "yes" })).toEqual({
      input: { pitchId: "abc" },
      confirmed: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import { cn } from "./cn";
import { fontSize } from "./design-tokens";

describe("cn", () => {
  it("keeps a named type size next to a text colour", () => {
    expect(cn("text-label font-bold", "text-ink-500")).toBe("text-label font-bold text-ink-500");
    expect(cn("px-2.5 text-badge", "bg-brand-surface text-brand-link")).toBe(
      "px-2.5 text-badge bg-brand-surface text-brand-link",
    );
  });

  it("lets a later size override an earlier one, named or built in", () => {
    expect(cn("text-ui text-ink-700", "text-sm")).toBe("text-ink-700 text-sm");
    expect(cn("text-sm", "text-body")).toBe("text-body");
    expect(cn("text-[11px]", "text-label")).toBe("text-label");
  });

  it("covers every size in the token file", () => {
    for (const name of Object.keys(fontSize)) {
      expect(cn(`text-${name}`, "text-ink-900")).toBe(`text-${name} text-ink-900`);
    }
  });

  it("still resolves ordinary conflicts last-wins", () => {
    expect(cn("w-full", "w-40")).toBe("w-40");
    expect(cn("p-2", false, null, undefined, "p-4")).toBe("p-4");
  });
});

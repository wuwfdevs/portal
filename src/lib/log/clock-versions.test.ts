import { describe, expect, it } from "vitest";
import { resolveCurrentClockVersion, type ClockVersionLike } from "./clock-versions";

function version(
  id: string,
  variant: ClockVersionLike["variant"],
  effectiveFrom: string,
  effectiveTo: string | null = null,
): ClockVersionLike {
  return { id, variant, effective_from: effectiveFrom, effective_to: effectiveTo };
}

describe("resolveCurrentClockVersion", () => {
  it("picks the most recent version at or before the given date", () => {
    const versions = [
      version("v1", "weekday", "2026-01-01"),
      version("v2", "weekday", "2026-06-01"),
      version("v3", "weekday", "2026-09-01"),
    ];
    expect(resolveCurrentClockVersion(versions, "weekday", "2026-07-15")?.id).toBe("v2");
  });

  it("ignores versions that haven't taken effect yet", () => {
    const versions = [version("v1", "weekday", "2026-06-01")];
    expect(resolveCurrentClockVersion(versions, "weekday", "2026-01-01")).toBeNull();
  });

  it("respects effective_to — a superseded version is not current past its end date", () => {
    const versions = [
      version("v1", "weekday", "2026-01-01", "2026-05-31"),
      version("v2", "weekday", "2026-06-01"),
    ];
    expect(resolveCurrentClockVersion(versions, "weekday", "2026-03-01")?.id).toBe("v1");
    expect(resolveCurrentClockVersion(versions, "weekday", "2026-08-01")?.id).toBe("v2");
    expect(resolveCurrentClockVersion(versions, "weekday", "2027-01-01")?.id).toBe("v2");
  });

  it("only matches the requested variant", () => {
    const versions = [version("v1", "weekend", "2026-01-01")];
    expect(resolveCurrentClockVersion(versions, "weekday", "2026-06-01")).toBeNull();
  });

  it("returns null when nothing of that variant exists", () => {
    expect(resolveCurrentClockVersion([], "weekday", "2026-06-01")).toBeNull();
  });
});

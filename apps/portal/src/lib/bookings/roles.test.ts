import { describe, expect, it } from "vitest";
import { ROLE_OPTIONS, parseBookingsRoles } from "./roles";

describe("parseBookingsRoles", () => {
  it("keeps known roles in a stable order and drops the rest", () => {
    expect(parseBookingsRoles(["executive", "Production ", "manager", "finance"])).toEqual([
      "production",
      "finance",
      "executive",
    ]);
  });

  it("reads an empty or missing list as no role", () => {
    expect(parseBookingsRoles(null)).toEqual([]);
    expect(parseBookingsRoles([])).toEqual([]);
  });

  it("offers every role on the admin screen exactly once", () => {
    expect(ROLE_OPTIONS.map((option) => option.value).sort()).toEqual([
      "director",
      "executive",
      "finance",
      "production",
    ]);
  });
});

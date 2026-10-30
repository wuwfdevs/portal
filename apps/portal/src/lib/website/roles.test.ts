import { describe, expect, it } from "vitest";
import { SITE_ROLES } from "@wuwf/portal-contracts";
import { ROLE_OPTIONS, parseWebsiteRoles } from "./roles";

describe("parseWebsiteRoles", () => {
  it("keeps known roles in a stable order and drops the rest", () => {
    expect(parseWebsiteRoles(["administrator", " Editor ", "root", "publisher"])).toEqual([
      "editor",
      "publisher",
      "administrator",
    ]);
  });
  it("reads an empty or missing list as no role", () => {
    expect(parseWebsiteRoles(null)).toEqual([]);
    expect(parseWebsiteRoles([])).toEqual([]);
  });
});

describe("ROLE_OPTIONS", () => {
  it("offers exactly the roles the site understands, once each, so the two can never drift", () => {
    expect(ROLE_OPTIONS.map((o) => o.value).sort()).toEqual([...SITE_ROLES].sort());
  });
});

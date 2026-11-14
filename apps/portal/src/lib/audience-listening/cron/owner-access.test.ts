import { describe, expect, it } from "vitest";
import { ownerMayRun } from "./owner-access";

const base = { toolEnabled: true, toolDefaultAccess: "invite_only", profileActive: true, hasGrant: true };

describe("ownerMayRun", () => {
  it("needs the tool on, an active person and a grant", () => {
    expect(ownerMayRun(base)).toBe(true);
    expect(ownerMayRun({ ...base, hasGrant: false })).toBe(false);
    expect(ownerMayRun({ ...base, toolEnabled: false })).toBe(false);
    expect(ownerMayRun({ ...base, profileActive: false })).toBe(false);
  });
  it("lets any active person run a tool that is open to all staff, but never one that is off", () => {
    expect(ownerMayRun({ ...base, toolDefaultAccess: "approved_staff", hasGrant: false })).toBe(true);
    expect(ownerMayRun({ ...base, toolDefaultAccess: "approved_staff", toolEnabled: false })).toBe(false);
  });
});

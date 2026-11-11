import { describe, expect, it } from "vitest";
import { ROLE_SPEC, parseAudienceListeningRoles } from "./roles";

describe("Audience Listening roles", () => {
  it("reads the coordinator role from a grant, ignoring case and anything it does not know", () => {
    expect(parseAudienceListeningRoles(["Coordinator"])).toEqual(["coordinator"]);
    expect(parseAudienceListeningRoles(["editor", "curator"])).toEqual([]);
    expect(parseAudienceListeningRoles(null)).toEqual([]);
  });

  it("describes a stacking tool whose only grantable role is the coordinator", () => {
    expect(ROLE_SPEC.toolKey).toBe("audience-listening");
    expect(ROLE_SPEC.kind).toBe("stacking");
    expect(ROLE_SPEC.roles.map((r) => r.value)).toEqual(["coordinator"]);
  });
});

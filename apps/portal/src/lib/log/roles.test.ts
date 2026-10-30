import { describe, expect, it } from "vitest";
import { parseLogRoles, ROLE_OPTIONS } from "./roles";

describe("parseLogRoles", () => {
  it("reads each role, however it was capitalized or padded", () => {
    expect(parseLogRoles([" Program_Director "])).toEqual(["program_director"]);
    expect(parseLogRoles(["TRAFFIC"])).toEqual(["traffic"]);
    expect(parseLogRoles(["traffic", "program_director"])).toEqual(["program_director", "traffic"]);
  });

  it("reads the old producer role as both jobs", () => {
    expect(parseLogRoles(["producer"])).toEqual(["program_director", "traffic"]);
  });

  it("treats no grant, an empty list, and unrecognized roles as on-air staff", () => {
    expect(parseLogRoles(null)).toEqual([]);
    expect(parseLogRoles([])).toEqual([]);
    expect(parseLogRoles(["host", ""])).toEqual([]);
  });
});

describe("ROLE_OPTIONS", () => {
  it("offers exactly the roles this tool interprets", () => {
    expect(ROLE_OPTIONS.map((option) => option.value)).toEqual(["program_director", "traffic"]);
  });
});

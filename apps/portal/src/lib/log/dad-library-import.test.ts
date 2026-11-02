import { describe, expect, it } from "vitest";
import { parseDadGroups, parseDadLibrary } from "./dad-library-import";

// Fixtures cut directly from a real DAD "Standard Library"/Groups export
// (2026-08-26), CRLF line endings preserved — including the two real rows
// whose OUTCUE column is populated ("Sustainer", a stray "l"), which is
// exactly the case fixed-width column slicing has to survive.
const LIBRARY_FIXTURE = [
  "",
  "                                       DAD CUTS DATABASE                           Page: 1",
  "Sorted by:                                                                         Date: 08/26/26",
  "",
  "",
  " CUT   TITLE                    LENGTH      KILL     AGENCY                   OUTCUE                   GROUP",
  " -------------------------------------------------------------------------------------------------------------",
  " 00001 UF-Parks-Museums-1 Cryst 00:01:29.6                                                             UNEARTH ",
  " 00002 Bass and Guitar Vamp     00:00:15.1                                                             TEST    ",
  " 00221 Sagal - Federal funding  00:00:30.1                                    Sustainer                SPRING  ",
  " 20330 Sagal - Let's talk about 00:00:30.0                                    l                        SPRING  ",
  "",
  "                                       DAD CUTS DATABASE                           Page: 2",
  "Sorted by:                                                                         Date: 08/26/26",
  "",
  "",
  " CUT   TITLE                    LENGTH      KILL     AGENCY                   OUTCUE                   GROUP",
  " -------------------------------------------------------------------------------------------------------------",
  " 00295 BirdNote Aug 24 Mon      00:01:45.0                                                             ECO     ",
].join("\r\n");

const GROUPS_FIXTURE = [
  "",
  "           DAD GROUPS DATABASE              Page: 1",
  "                                            Date: 08/26/26",
  "",
  "",
  "   GROUP NAME      GROUP DESCRITION",
  "----------------------------------------------------------",
  "   ACOUSTIC        ACOUSTIC INTERLUDE          ",
  "   ALL             ALL LIBRARY CUTS            ",
  "   UNEARTH         UNEARTHING FL               ",
].join("\r\n");

describe("parseDadLibrary", () => {
  it("extracts cut rows across page breaks, ignoring banners/headers/rules", () => {
    const { cuts, warnings } = parseDadLibrary(LIBRARY_FIXTURE);
    expect(cuts).toEqual([
      { cutNumber: "00001", title: "UF-Parks-Museums-1 Cryst", lengthSeconds: 89, group: "UNEARTH" },
      { cutNumber: "00002", title: "Bass and Guitar Vamp", lengthSeconds: 15, group: "TEST" },
      { cutNumber: "00221", title: "Sagal - Federal funding", lengthSeconds: 30, group: "SPRING" },
      { cutNumber: "20330", title: "Sagal - Let's talk about", lengthSeconds: 30, group: "SPRING" },
      { cutNumber: "00295", title: "BirdNote Aug 24 Mon", lengthSeconds: 105, group: "ECO" },
    ]);
    expect(warnings).toEqual([]);
  });

  it("survives real OUTCUE text without misreading it as the group", () => {
    const { cuts } = parseDadLibrary(LIBRARY_FIXTURE);
    const sagal = cuts.find((cut) => cut.cutNumber === "00221");
    expect(sagal?.group).toBe("SPRING");
  });

  it("warns and finds nothing on an empty report", () => {
    const { cuts, warnings } = parseDadLibrary("no cut rows here");
    expect(cuts).toEqual([]);
    expect(warnings).toContain("No cut rows were found in this report.");
  });
});

describe("parseDadGroups", () => {
  it("extracts group name/description pairs, skipping banner/header/rule lines", () => {
    expect(parseDadGroups(GROUPS_FIXTURE)).toEqual([
      { name: "ACOUSTIC", description: "ACOUSTIC INTERLUDE" },
      { name: "ALL", description: "ALL LIBRARY CUTS" },
      { name: "UNEARTH", description: "UNEARTHING FL" },
    ]);
  });
});

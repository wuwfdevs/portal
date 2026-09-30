import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVERY_CONTRACT,
  KEEP_PORTAL,
  NEW_COPY,
  NEW_UNDERWRITER,
  NO_CONTRACT,
  SKIP,
  USE_INCOMING,
  WHOLE_CONTRACT,
  classifyScriptDifference,
  compareLabels,
  copyExecution,
  copyProduct,
  creationOrder,
  isDigitalOnlyContract,
  isNotUnderwritingCopy,
  isPlaceholderScript,
  namesFlight,
  parseLegacyCopyAnswers,
  parseLegacyCopyCsv,
  parseSourceDate,
  parseSourceLength,
  planLegacyCopyImport,
  resolveUnderwriter,
  scriptKey,
  underwriterKey,
  type LegacyCopyRow,
  type LegacyCopySnapshot,
  type SnapshotContract,
  type SnapshotCopy,
} from "./legacy-copy";

// The real export (RadioTraffic, 9/29/2026) after Excel's "Save as CSV".
const EXPORT = readFileSync(
  path.resolve(__dirname, "fixtures/radiotraffic-active-copy.csv"),
  "utf8",
);
const ALL_ROWS = parseLegacyCopyCsv(EXPORT).rows;

function rowsFor(underwriter: string, label?: string): LegacyCopyRow[] {
  return ALL_ROWS.filter(
    (row) => row.underwriter === underwriter && (label === undefined || row.label === label),
  );
}

const UW = {
  autumn: "uw-autumn",
  baileys: "uw-baileys",
  budAlleys: "uw-bud",
  doh: "uw-doh",
  ectc: "uw-ectc",
  fpl: "uw-fpl",
  popComics: "uw-pop",
  tlc: "uw-tlc",
  dauphin: "uw-disl",
  boyles: "uw-boyles",
  innisfree: "uw-innisfree",
  beachDotCom: "uw-beach",
  choral: "uw-choral",
};

const UNDERWRITERS = [
  { id: UW.autumn, name: "Autumn Beck Blackledge" },
  { id: UW.baileys, name: "Bailey’s Produce & Nursery" },
  { id: UW.budAlleys, name: "Bud & Alley's" },
  { id: UW.doh, name: "Escambia County DOH" },
  { id: UW.ectc, name: "Emerald Coast Theatre Company" },
  { id: UW.fpl, name: "Florida Power & Light" },
  { id: UW.popComics, name: "P'cola Pop Comics" },
  { id: UW.tlc, name: "TLC Caregiver" },
  { id: UW.dauphin, name: "Dauphin Island Sea Lab" },
  { id: UW.boyles, name: "Boyles and Boyles" },
  { id: UW.innisfree, name: "Innisfree Jet Center" },
  { id: UW.beachDotCom, name: "Pensacola Beach dot com" },
  { id: UW.choral, name: "Choral Society" },
];

function contract(
  overrides: Partial<SnapshotContract> & { id: string; underwriter_id: string },
): SnapshotContract {
  return {
    contract_identifier: null,
    sponsorship_category: null,
    status: "draft",
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    ...overrides,
  };
}

function copyOnFile(
  overrides: Partial<SnapshotCopy> & { id: string; underwriter_id: string | null },
): SnapshotCopy {
  return {
    label: "Copy 1",
    cart_identifier: null,
    script: "",
    execution_kind: "recorded",
    duration_seconds: 15,
    effective_from: "2026-09-01",
    effective_to: null,
    approval_status: "approved",
    created_at: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

function snapshot(overrides: Partial<LegacyCopySnapshot> = {}): LegacyCopySnapshot {
  return {
    underwriters: UNDERWRITERS,
    copy: [],
    contracts: [],
    flights: [],
    links: [],
    ...overrides,
  };
}

// ---- Parsing -------------------------------------------------------------------

describe("parseLegacyCopyCsv", () => {
  it("reads the real export: skips its title lines and keeps every row", () => {
    const parsed = parseLegacyCopyCsv(EXPORT);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(85);
    expect(parsed.rows[0]).toMatchObject({
      row: 5,
      underwriter: "309 Punk Project",
      label: "copy 1",
      cart: "101",
      lengthSeconds: 30,
      startDate: "2026-10-01",
      endDate: "2026-10-30",
    });
  });

  it("keeps a script verbatim, line breaks and quotes included", () => {
    const [autumn] = rowsFor("Autumn Beck Blackledge", "Copy 1");
    expect(autumn!.script).toBe(
      "Support for WUWF comes from Autumn Beck Blackledge, Attorneys of Divorce and Family Law, who offer a number of approaches to resolving complex family issues. More details, videos, articles and client reviews are on line at autumn o beck dot com\n\nWeb address is autumn o beck dot com",
    );
    expect(rowsFor("309 Punk Project")[0]!.script).toContain('"309 Punk Project"');
  });

  it("finds columns by name, in any order, and reports rows it can't read", () => {
    const parsed = parseLegacyCopyCsv(
      [
        "Script,Label,Advertiser,Start,End,Duration,Cart #",
        '"Support for WUWF comes from A.",Copy 1,Alpha,2026-10-01,2026-10-31,0:30,7',
        '"Support for WUWF comes from B.",,Beta,10/1/2026,10/31/2026,30,8',
        '"Support for WUWF comes from C.",Copy 1,Gamma,13/40/2026,,30,9',
        '"Support for WUWF comes from D.",Copy 1,Delta,10/31/2026,10/1/2026,30,9',
      ].join("\n"),
    );
    expect(parsed.rows).toEqual([
      expect.objectContaining({
        underwriter: "Alpha",
        label: "Copy 1",
        lengthSeconds: 30,
        cart: "7",
      }),
    ]);
    expect(parsed.errors.map((error) => error.row)).toEqual([3, 4, 5]);
  });

  it("refuses a file with no header it recognises", () => {
    expect(parseLegacyCopyCsv("a,b\n1,2").errors[0]!.message).toMatch(/header/);
  });

  it("reads dates and lengths the ways a spreadsheet writes them", () => {
    expect(parseSourceDate("10/1/2026")).toBe("2026-10-01");
    expect(parseSourceDate("3/8/27")).toBe("2027-03-08");
    expect(parseSourceDate("2026-10-01 00:00:00")).toBe("2026-10-01");
    expect(parseSourceDate("")).toBeNull();
    expect(parseSourceDate("2/30/2026")).toBeUndefined();
    expect(parseSourceLength("30")).toBe(30);
    expect(parseSourceLength("01:00")).toBe(60);
    expect(parseSourceLength("thirty")).toBeUndefined();
  });
});

// ---- What a row is --------------------------------------------------------------

describe("row classification", () => {
  it("recognises RadioTraffic's placeholders", () => {
    const placeholders = ALL_ROWS.filter((row) => isPlaceholderScript(row.script));
    expect(placeholders).toHaveLength(11);
    expect(isPlaceholderScript(".... copy holder ....")).toBe(true);
    expect(isPlaceholderScript("Support for WUWF comes from a copy holder shop.")).toBe(false);
  });

  it("recognises the EAS test as not underwriting copy, but not an ordinary WUWF event credit", () => {
    const [eas] = rowsFor("WUWF Event");
    expect(isNotUnderwritingCopy(eas!)).toBe(true);
    expect(
      isNotUnderwritingCopy({
        label: "Jazz Fest",
        script: "Support for WUWF comes from Jazz Fest.",
      }),
    ).toBe(false);
  });

  it("decides live read or recorded from the script, never from the cart", () => {
    const [autumn] = rowsFor("Autumn Beck Blackledge", "Copy 1");
    expect(autumn!.cart).toBe("18");
    expect(copyExecution(autumn!)).toEqual({ executionKind: "live_read", durationSeconds: 18 });

    const [learningMinute] = rowsFor("Bailey's Produce & Nursery", "Learning Minute");
    expect(copyExecution(learningMinute!)).toEqual({
      executionKind: "recorded",
      durationSeconds: 60,
    });
    const [tlc] = rowsFor("TLC Caregiver");
    expect(copyExecution(tlc!).executionKind).toBe("recorded");
    // "Please read credit first, then play the segment" is read aloud.
    const [wildBirds] = rowsFor("Wild Birds Unlimited");
    expect(copyExecution(wildBirds!).executionKind).toBe("live_read");
  });

  it("names a product only where copy names one, not in passing", () => {
    expect(copyProduct(rowsFor("Bailey's Produce & Nursery", "Learning Minute")[0]!)).toBe(
      "learning_minute",
    );
    expect(copyProduct(rowsFor("Dauphin Island Sea Lab")[0]!)).toBe("learning_minute");
    expect(copyProduct(rowsFor("Boyles and Boyles")[0]!)).toBe("book_club");
    // "The shop also hosts a monthly book club."
    expect(copyProduct(rowsFor("P'cola Pop Comics")[0]!)).toBeNull();
  });

  it("treats an app agreement as digital only", () => {
    expect(isDigitalOnlyContract("2 ads on WUWF app")).toBe(true);
    expect(isDigitalOnlyContract("Drive Time")).toBe(false);
    expect(isDigitalOnlyContract(null)).toBe(false);
  });
});

// ---- Names and scripts --------------------------------------------------------------

describe("underwriter names", () => {
  it("ignores apostrophes, punctuation, & versus and, and plurals", () => {
    expect(underwriterKey("Bailey's Produce & Nursery")).toBe(
      underwriterKey("Bailey’s Produce and Nursery"),
    );
    expect(underwriterKey("TLC Caregivers")).toBe(underwriterKey("TLC Caregiver"));
    expect(underwriterKey("Phil Hall, PA")).toBe(underwriterKey("Phil Hall PA"));
  });

  it("matches the export's names to the ones on file, through the alias table where spelling differs", () => {
    const on = (name: string) => resolveUnderwriter(name, UNDERWRITERS);
    expect(on("Bailey's Produce & Nursery")).toMatchObject({
      kind: "matched",
      id: UW.baileys,
      viaAlias: false,
    });
    expect(on("FPM - FL Power & Light")).toMatchObject({
      kind: "matched",
      id: UW.fpl,
      viaAlias: true,
    });
    expect(on("Pensacola Pop Comics")).toMatchObject({
      kind: "matched",
      id: UW.popComics,
      viaAlias: true,
    });
    expect(on("TLC Caregivers")).toMatchObject({ kind: "matched", id: UW.tlc });
    expect(on("309 Punk Project")).toEqual({ kind: "unknown" });
    expect(on("WUWF Day Sponsor")).toEqual({ kind: "create", name: "WUWF Day Sponsor" });
  });

  it("never guesses between two underwriters that normalise alike", () => {
    const twins = [
      { id: "a", name: "Chesser Barr" },
      { id: "b", name: "Chesser-Barr" },
    ];
    expect(resolveUnderwriter("Chesser Barr", twins)).toMatchObject({ kind: "ambiguous" });
  });
});

describe("scripts", () => {
  it("compares words, not typography", () => {
    expect(scriptKey("Bud & Alley’s — pizza…")).toBe(scriptKey("Bud & Alley's -- pizza..."));
  });

  it("tells a glued-word correction, a filled-in blank and a new message apart", () => {
    const taco = rowsFor("Bud & Alley's", "taco")[0]!.script;
    expect(classifyScriptDifference(taco.replace("and offering", "andoffering"), taco)).toBe(
      "correction",
    );
    expect(
      classifyScriptDifference(
        "Please play the # 2 spot for Dauphin Island Sea Lab",
        "Please play the #________ spot for Dauphin Island Sea Lab",
      ),
    ).toBe("filled_in");
    const [september] = rowsFor("Escambia County DOH", "Copy 2");
    const october = rowsFor("Escambia County DOH", "Copy 2")[1]!;
    expect(classifyScriptDifference(september!.script, october.script)).toBe("different");
  });

  it("orders labels as a person would", () => {
    expect(["Copy 10", "Copy 2", "copy 1"].sort(compareLabels)).toEqual([
      "copy 1",
      "Copy 2",
      "Copy 10",
    ]);
  });

  it("matches a copy name to a flight by whole words, not fragments", () => {
    expect(namesFlight("Frozen", "Frozen: The Musical")).toBe(true);
    expect(namesFlight("39 Steps", "39 Steps")).toBe(true);
    expect(namesFlight("9 to 5", "9 to 5 The Musical")).toBe(true);
    expect(namesFlight("Million $$ Xmas", "Million Dollar Quartet Christmas")).toBe(false);
    expect(namesFlight("copy 1", "Come From Away")).toBe(false);
  });
});

// ---- The plan -----------------------------------------------------------------------

describe("planLegacyCopyImport", () => {
  it("creates new copy as approved, dated from RadioTraffic, attributed to its underwriter", () => {
    const plan = planLegacyCopyImport(rowsFor("Choral Society"), snapshot());
    const created = plan.copies.filter((copy) => copy.status === "ready");
    expect(created.map((copy) => copy.label)).toEqual(["Voices of Sea & Sky", "El Mesias"]);
    expect(created[0]).toMatchObject({
      underwriter: { kind: "matched", id: UW.choral },
      copy: { action: "create" },
      startDate: "2026-10-05",
      endDate: "2026-10-16",
      executionKind: "live_read",
      links: [],
      unlinkedReason: "No contract on file",
    });
    // The two "copy holder" rows stay out.
    expect(plan.counts).toMatchObject({ ready: 2, placeholders: 2 });
  });

  it("reuses copy already in the portal by its script, correcting only its dates", () => {
    const [row] = rowsFor("Bud & Alley's", "pizza");
    const onFile = copyOnFile({
      id: "copy-pizza",
      underwriter_id: UW.budAlleys,
      label: "pizza",
      cart_identifier: "11",
      script: row!.script.replace("Alley's", "Alley’s"),
      effective_from: "2026-09-15",
    });
    const plan = planLegacyCopyImport([row!], snapshot({ copy: [onFile] }));
    expect(plan.copies[0]!.copy).toEqual({
      action: "reuse",
      id: "copy-pizza",
      label: "pizza",
      cart: "11",
      updates: { effective_from: "2026-02-16", effective_to: "2026-11-29" },
      changes: ["Dates set to Feb 16 – Nov 29, 2026"],
    });
    expect(plan.questions).toEqual([]);
  });

  it("finds copy attributed only through a contract link, and adds a missing cart", () => {
    const [row] = rowsFor("Move Period", "Copy 1");
    const underwriters = [...UNDERWRITERS, { id: "uw-move", name: "Move Period" }];
    const plan = planLegacyCopyImport(
      [row!],
      snapshot({
        underwriters,
        contracts: [
          contract({
            id: "c-move",
            underwriter_id: "uw-move",
            effective_from: "2026-08-31",
            effective_to: "2026-11-29",
          }),
        ],
        copy: [
          copyOnFile({
            id: "copy-move",
            underwriter_id: null,
            script: row!.script,
            effective_from: "2026-08-31",
            effective_to: "2026-11-29",
          }),
        ],
        links: [{ contract_id: "c-move", copy_id: "copy-move", flight_id: null }],
      }),
    );
    expect(plan.copies[0]).toMatchObject({
      status: "ready",
      copy: { action: "reuse", id: "copy-move", updates: { cart_identifier: "110" } },
      links: [{ contractId: "c-move", exists: true }],
    });
  });

  it("collapses a message RadioTraffic lists twice into one copy spanning both periods", () => {
    const [row] = rowsFor("Baptist Healthcare", "Copy 1");
    const later = { ...row!, row: 999, startDate: "2026-11-01", endDate: "2027-01-31" };
    const plan = planLegacyCopyImport(
      [row!, later],
      snapshot({ underwriters: [...UNDERWRITERS, { id: "uw-bap", name: "Baptist Healthcare" }] }),
    );
    expect(plan.copies).toHaveLength(1);
    expect(plan.copies[0]).toMatchObject({
      rows: [row!.row, 999],
      startDate: "2026-02-22",
      endDate: "2027-01-31",
    });
    expect(plan.counts).toMatchObject({ ready: 2, create: 1 });
  });

  it("never overwrites a script silently: same name and cart with other words is a question", () => {
    const [taco] = rowsFor("Bud & Alley's", "taco");
    const damaged = copyOnFile({
      id: "copy-taco",
      underwriter_id: UW.budAlleys,
      label: "taco",
      cart_identifier: "12",
      script: taco!.script.replace("and offering", "andoffering").replace("and more", "andmore"),
      execution_kind: "live_read",
    });
    const before = planLegacyCopyImport([taco!], snapshot({ copy: [damaged] }));
    expect(before.copies[0]!.status).toBe("waiting");
    const question = before.questions[0]!;
    expect(question).toMatchObject({ kind: "script", recommended: USE_INCOMING });
    expect(question.comparisons![0]!.portal).toContain("andoffering");

    const replaced = planLegacyCopyImport([taco!], snapshot({ copy: [damaged] }), {
      [question.key]: USE_INCOMING,
    });
    expect(replaced.copies[0]!.copy).toMatchObject({
      action: "reuse",
      id: "copy-taco",
      updates: { script: taco!.script, duration_seconds: expect.any(Number) },
    });
    const kept = planLegacyCopyImport([taco!], snapshot({ copy: [damaged] }), {
      [question.key]: KEEP_PORTAL,
    });
    expect(kept.copies[0]!.copy).toMatchObject({ action: "reuse", id: "copy-taco" });
    expect((kept.copies[0]!.copy as { updates: object }).updates).not.toHaveProperty("script");
    const skipped = planLegacyCopyImport([taco!], snapshot({ copy: [damaged] }), {
      [question.key]: SKIP,
    });
    expect(skipped.copies[0]).toMatchObject({ status: "excluded", excludedReason: "skipped" });
  });

  it("recommends keeping the portal's copy where it filled in RadioTraffic's blank", () => {
    const [tlc] = rowsFor("TLC Caregiver");
    const filled = copyOnFile({
      id: "copy-tlc",
      underwriter_id: UW.tlc,
      label: "copy 1",
      cart_identifier: "203",
      script: tlc!.script.replace("TLC spot ___", "TLC spot 33"),
    });
    const plan = planLegacyCopyImport([tlc!], snapshot({ copy: [filled] }));
    expect(plan.questions[0]).toMatchObject({ kind: "script", recommended: KEEP_PORTAL });
  });

  it("adds next month's message under a reused name as its own copy, asking only when the name is free", () => {
    const [september, october] = rowsFor("Escambia County DOH", "Copy 2");
    const onFile = copyOnFile({
      id: "copy-doh-2",
      underwriter_id: UW.doh,
      label: "Copy 2",
      cart_identifier: "254",
      script: september!.script,
    });
    // September's words are on file, so October's is simply another message.
    const plan = planLegacyCopyImport([september!, october!], snapshot({ copy: [onFile] }));
    expect(plan.questions).toEqual([]);
    expect(plan.copies.map((copy) => copy.copy.action)).toEqual(["reuse", "create"]);

    // Only October's is exported: the portal's copy by that name is a different message — ask.
    const alone = planLegacyCopyImport([october!], snapshot({ copy: [onFile] }));
    expect(alone.questions[0]).toMatchObject({ kind: "script", recommended: NEW_COPY });
    const answered = planLegacyCopyImport([october!], snapshot({ copy: [onFile] }), {
      [alone.questions[0]!.key]: NEW_COPY,
    });
    expect(answered.copies[0]).toMatchObject({ status: "ready", copy: { action: "create" } });
  });

  it("creates the Day Sponsor underwriter and leaves its copy without a contract", () => {
    const plan = planLegacyCopyImport(rowsFor("WUWF Day Sponsor"), snapshot());
    expect(plan.questions).toEqual([]);
    expect(plan.newUnderwriters).toEqual(["WUWF Day Sponsor"]);
    expect(plan.copies[0]).toMatchObject({
      status: "ready",
      underwriter: { kind: "create", name: "WUWF Day Sponsor" },
      links: [],
      unlinkedReason: "Station copy has no contract",
    });
  });

  it("asks about an unknown underwriter and leaves its rows out until answered", () => {
    const rows = rowsFor("309 Punk Project");
    const plan = planLegacyCopyImport(rows, snapshot());
    expect(plan.copies[0]!.status).toBe("waiting");
    expect(plan.newUnderwriters).toEqual([]);
    const key = plan.questions[0]!.key;
    expect(plan.questions[0]).toMatchObject({
      kind: "underwriter",
      choosesUnderwriter: true,
      recommended: null,
    });

    const added = planLegacyCopyImport(rows, snapshot(), { [key]: NEW_UNDERWRITER });
    expect(added.newUnderwriters).toEqual(["309 Punk Project"]);
    expect(added.copies[0]!.status).toBe("ready");
    const matched = planLegacyCopyImport(rows, snapshot(), { [key]: `id:${UW.choral}` });
    expect(matched.copies[0]!.underwriter).toMatchObject({ kind: "matched", id: UW.choral });
    const left = planLegacyCopyImport(rows, snapshot(), { [key]: SKIP });
    expect(left.copies[0]).toMatchObject({ status: "excluded", excludedReason: "skipped" });
    // A made-up id never matches.
    expect(planLegacyCopyImport(rows, snapshot(), { [key]: "id:nope" }).copies[0]!.status).toBe(
      "waiting",
    );
  });

  it("links to the one agreement that fits, and to none when none covers the dates", () => {
    const [fpl] = rowsFor("FPM - FL Power & Light");
    const fits = contract({
      id: "c-fpl",
      underwriter_id: UW.fpl,
      contract_identifier: "1367",
      effective_from: "2026-01-26",
      effective_to: "2026-12-27",
    });
    expect(planLegacyCopyImport([fpl!], snapshot({ contracts: [fits] })).copies[0]!.links).toEqual([
      expect.objectContaining({ contractId: "c-fpl", flightId: null, exists: false }),
    ]);
    const lapsed = { ...fits, effective_from: "2024-01-01", effective_to: "2024-12-31" };
    expect(planLegacyCopyImport([fpl!], snapshot({ contracts: [lapsed] })).copies[0]).toMatchObject(
      {
        links: [],
        unlinkedReason: "No agreement covers these dates",
      },
    );
    const terminated = { ...fits, status: "terminated" as const };
    expect(
      planLegacyCopyImport([fpl!], snapshot({ contracts: [terminated] })).copies[0]!.links,
    ).toEqual([]);
  });

  it("asks once, for every message of an underwriter, when two agreements overlap", () => {
    const rows = rowsFor("Autumn Beck Blackledge");
    const contracts = [
      contract({
        id: "c-regular",
        underwriter_id: UW.autumn,
        contract_identifier: "323996",
        effective_from: "2026-08-24",
        effective_to: "2027-02-21",
      }),
      contract({
        id: "c-radiolive",
        underwriter_id: UW.autumn,
        contract_identifier: "303996",
        sponsorship_category: "RADIO LIVE",
        effective_from: "2026-03-16",
        effective_to: "2027-03-14",
      }),
    ];
    const plan = planLegacyCopyImport(rows, snapshot({ contracts }));
    expect(plan.questions).toHaveLength(1);
    const question = plan.questions[0]!;
    expect(question).toMatchObject({ kind: "contract", rowCount: 2, recommended: null });
    expect(question.options.map((option) => option.value)).toEqual([
      "c-regular",
      "c-radiolive",
      EVERY_CONTRACT,
      NO_CONTRACT,
    ]);
    expect(plan.copies.every((copy) => copy.status === "waiting")).toBe(true);

    const answered = planLegacyCopyImport(rows, snapshot({ contracts }), {
      [question.key]: "c-regular",
    });
    expect(answered.copies.map((copy) => copy.links.map((link) => link.contractId))).toEqual([
      ["c-regular"],
      ["c-regular"],
    ]);
    const both = planLegacyCopyImport(rows, snapshot({ contracts }), {
      [question.key]: EVERY_CONTRACT,
    });
    expect(both.copies[0]!.links).toHaveLength(2);
    // An answer naming a contract that isn't an option is ignored.
    expect(
      planLegacyCopyImport(rows, snapshot({ contracts }), { [question.key]: "c-other" }).copies[0]!
        .status,
    ).toBe("waiting");
  });

  it("links cash-and-trade event copy to the agreement whose flight it names", () => {
    const [steps] = rowsFor("Emerald Coast Theatre Company", "39 Steps");
    const cash = contract({
      id: "c-cash",
      underwriter_id: UW.ectc,
      effective_from: "2026-09-08",
      effective_to: "2027-05-23",
    });
    const trade = contract({
      id: "c-trade",
      underwriter_id: UW.ectc,
      effective_from: "2026-09-01",
      effective_to: "2027-05-23",
    });
    const flights = [
      {
        id: "f-away",
        contract_id: "c-cash",
        name: "Come From Away",
        start_date: "2026-09-10",
        end_date: "2026-09-27",
        status: "active" as const,
      },
      {
        id: "f-steps",
        contract_id: "c-cash",
        name: "39 Steps",
        start_date: "2026-10-15",
        end_date: "2026-10-25",
        status: "active" as const,
      },
    ];
    const plan = planLegacyCopyImport([steps!], snapshot({ contracts: [cash, trade], flights }));
    expect(plan.questions).toEqual([]);
    expect(plan.copies[0]!.links).toEqual([
      expect.objectContaining({
        contractId: "c-cash",
        flightId: "f-steps",
        flightName: "39 Steps",
      }),
    ]);
  });

  it("asks which flight when a name fits more than one, and keeps evergreen copy contract-wide", () => {
    const cash = contract({
      id: "c-cash",
      underwriter_id: UW.ectc,
      effective_from: "2026-09-08",
      effective_to: "2027-05-23",
    });
    const flights = [
      {
        id: "f-1",
        contract_id: "c-cash",
        name: "Frozen Jr.",
        start_date: "2027-05-06",
        end_date: "2027-05-10",
        status: "active" as const,
      },
      {
        id: "f-2",
        contract_id: "c-cash",
        name: "Frozen: The Musical",
        start_date: "2027-05-11",
        end_date: "2027-05-23",
        status: "active" as const,
      },
    ];
    const frozen: LegacyCopyRow = {
      row: 1,
      underwriter: "Emerald Coast Theatre Company",
      label: "Frozen",
      cart: "140",
      lengthSeconds: 30,
      startDate: "2027-05-06",
      endDate: "2027-05-21",
      script: "Support for WUWF comes from ECTC presenting Frozen.",
    };
    const plan = planLegacyCopyImport([frozen], snapshot({ contracts: [cash], flights }));
    expect(plan.questions[0]).toMatchObject({ kind: "flight" });
    expect(plan.questions[0]!.options.map((option) => option.value)).toEqual([
      "f-1",
      "f-2",
      WHOLE_CONTRACT,
    ]);
    const whole = planLegacyCopyImport([frozen], snapshot({ contracts: [cash], flights }), {
      [plan.questions[0]!.key]: WHOLE_CONTRACT,
    });
    expect(whole.copies[0]!.links[0]).toMatchObject({ contractId: "c-cash", flightId: null });

    const evergreen: LegacyCopyRow = {
      ...frozen,
      label: "Gen copy",
      startDate: "2026-09-08",
      endDate: "2027-05-23",
    };
    const general = planLegacyCopyImport([evergreen], snapshot({ contracts: [cash], flights }));
    expect(general.questions).toEqual([]);
    expect(general.copies[0]!.links[0]).toMatchObject({ flightId: null });
  });

  it("never links broadcast copy to a digital-only agreement", () => {
    const [carPool] = rowsFor("Bailey's Produce & Nursery", "copy 1 - car pool");
    const app = contract({
      id: "c-app",
      underwriter_id: UW.baileys,
      sponsorship_category: "2 ads on WUWF app",
      effective_from: "2026-09-24",
      effective_to: "2026-12-24",
    });
    const regular = contract({
      id: "c-regular",
      underwriter_id: UW.baileys,
      contract_identifier: "112964",
      effective_from: "2026-04-06",
      effective_to: "2027-04-04",
    });
    const both = planLegacyCopyImport([carPool!], snapshot({ contracts: [app, regular] }));
    expect(both.copies[0]!.links.map((link) => link.contractId)).toEqual(["c-regular"]);
    const appOnly = planLegacyCopyImport([carPool!], snapshot({ contracts: [app] }));
    expect(appOnly.copies[0]).toMatchObject({
      links: [],
      unlinkedReason: "Its only agreement is digital",
    });
  });

  it("asks before putting product copy on an agreement for something else, and links it to a matching one", () => {
    const [learningMinute] = rowsFor("Bailey's Produce & Nursery", "Learning Minute");
    const regular = contract({
      id: "c-regular",
      underwriter_id: UW.baileys,
      effective_from: "2026-04-06",
      effective_to: "2027-04-04",
    });
    const plan = planLegacyCopyImport([learningMinute!], snapshot({ contracts: [regular] }));
    expect(plan.questions[0]).toMatchObject({ kind: "contract", recommended: NO_CONTRACT });

    const [tlc] = rowsFor("TLC Caregiver");
    const learning = contract({
      id: "c-lm",
      underwriter_id: UW.tlc,
      sponsorship_category: "Learning Minute",
      effective_from: "2026-01-12",
      effective_to: "2027-01-10",
    });
    expect(
      planLegacyCopyImport([tlc!], snapshot({ contracts: [learning] })).copies[0]!.links[0]!
        .contractId,
    ).toBe("c-lm");
  });

  it("notes a script also on file under another underwriter without acting on it", () => {
    const [innisfree] = rowsFor("Innisfree Jet Center");
    const plan = planLegacyCopyImport(
      [innisfree!],
      snapshot({
        copy: [
          copyOnFile({
            id: "copy-beach",
            underwriter_id: UW.beachDotCom,
            script: innisfree!.script,
          }),
        ],
      }),
    );
    expect(plan.copies[0]!.copy.action).toBe("create");
    expect(plan.copies[0]!.notes).toContain(
      "The same script is also on file under Pensacola Beach dot com.",
    );
  });

  it("is idempotent: the export run against what it wrote leaves nothing to do", () => {
    const rows = rowsFor("Choral Society").concat(rowsFor("FPM - FL Power & Light"));
    const fpl = contract({
      id: "c-fpl",
      underwriter_id: UW.fpl,
      effective_from: "2026-01-26",
      effective_to: "2026-12-27",
    });
    const first = planLegacyCopyImport(rows, snapshot({ contracts: [fpl] }));
    // Apply the plan the way the import does.
    const copy: SnapshotCopy[] = [];
    const links: { contract_id: string; copy_id: string; flight_id: string | null }[] = [];
    for (const planned of first.copies.filter((entry) => entry.status === "ready")) {
      const id = `new-${planned.key}`;
      copy.push(
        copyOnFile({
          id,
          underwriter_id: planned.underwriter.kind === "matched" ? planned.underwriter.id : null,
          label: planned.label,
          cart_identifier: planned.cart,
          script: planned.script,
          effective_from: planned.startDate!,
          effective_to: planned.endDate,
        }),
      );
      for (const link of planned.links)
        links.push({ contract_id: link.contractId, copy_id: id, flight_id: link.flightId });
    }
    const second = planLegacyCopyImport(rows, snapshot({ contracts: [fpl], copy, links }));
    expect(second.counts.ready).toBe(0);
    expect(second.counts.done).toBe(3);
    expect(second.questions).toEqual([]);
  });

  it("writes new copy in label order, so the rotation cycles Copy 1, Copy 2, Copy 3", () => {
    const plan = planLegacyCopyImport(
      rowsFor("Phil Hall, PA"),
      snapshot({ underwriters: [...UNDERWRITERS, { id: "uw-hall", name: "Phil Hall, PA" }] }),
    );
    expect(creationOrder(plan.copies).map((copy) => copy.label)).toEqual([
      "Copy 1",
      "Copy 2",
      "Copy 3",
      "Copy 4",
    ]);
  });

  it("accounts for every row of the real export", () => {
    const plan = planLegacyCopyImport(ALL_ROWS, snapshot());
    const { counts } = plan;
    expect(counts.ready + counts.done + counts.waiting + counts.excluded).toBe(85);
    expect(counts).toMatchObject({ placeholders: 11, notCopy: 1 });
  });
});

describe("parseLegacyCopyAnswers", () => {
  it("keeps string answers and drops anything else", () => {
    expect(parseLegacyCopyAnswers('{"a":"new","b":3,"c":null}')).toEqual({ a: "new" });
    expect(parseLegacyCopyAnswers("not json")).toEqual({});
    expect(parseLegacyCopyAnswers("[1]")).toEqual({});
  });
});

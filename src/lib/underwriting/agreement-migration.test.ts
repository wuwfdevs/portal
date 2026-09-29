import { describe, expect, it } from "vitest";
import type { AgreementModelLine, AgreementModelOutput } from "./agreement-import";
import {
  canRunMigrationItem,
  canUpdateMigrationItemFacts,
  documentBasename,
  manifestDiscrepancies,
  manifestSourceKey,
  matchDocumentFile,
  migrationNotes,
  parseCsv,
  parseManifestDate,
  parseManifestMoney,
  parseMigrationManifest,
  resolveManifestUnderwriter,
  typedFieldsFromManifest,
} from "./agreement-migration";

describe("parseCsv", () => {
  it("reads quoted fields with commas, doubled quotes and newlines", () => {
    const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""","two\nlines"\n\n1,2,3\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "two\nlines"],
      ["1", "2", "3"],
    ]);
  });

  it("ignores a byte-order mark and keeps empty trailing cells", () => {
    expect(parseCsv("\uFEFFa,b,\n1,,")).toEqual([
      ["a", "b", ""],
      ["1", "", ""],
    ]);
  });
});

describe("manifest values", () => {
  it("parses ISO and US dates, refusing impossible ones", () => {
    expect(parseManifestDate("2026-10-01")).toBe("2026-10-01");
    expect(parseManifestDate("10/1/2026")).toBe("2026-10-01");
    expect(parseManifestDate("2/30/26")).toBeNull();
    expect(parseManifestDate("Oct 1")).toBeNull();
  });

  it("parses money with symbols and separators", () => {
    expect(parseManifestMoney("$1,234.50")).toBe(1234.5);
    expect(parseManifestMoney("  ")).toBeNull();
    expect(parseManifestMoney("trade")).toBeNaN();
  });

  it("keys by source_key, then Drive id, then filename", () => {
    expect(manifestSourceKey({ sourceKey: " IO-7 ", driveFileId: "d", sourceFile: "a.pdf" })).toBe(
      "IO-7",
    );
    expect(manifestSourceKey({ sourceKey: null, driveFileId: "abc", sourceFile: "a.pdf" })).toBe(
      "drive:abc",
    );
    expect(
      manifestSourceKey({ sourceKey: null, driveFileId: null, sourceFile: "Biz/2026/Acme IO.PDF" }),
    ).toBe("file:acme io.pdf");
    expect(documentBasename("C:\\Drive\\x.pdf")).toBe("x.pdf");
  });
});

describe("parseMigrationManifest", () => {
  const header =
    "Underwriter,Contract #,Start Date,End Date,Total,Contract Type,Source File,Drive File ID,Documentation Status,Notes";

  it("normalises a spreadsheet export", () => {
    const { rows, errors } = parseMigrationManifest(
      `${header}\nAutumn Beck Blackledge,IO-1001,4/1/2026,9/29/2026,"$2,600.00",Local/direct,Blackledge IO.pdf,drv1,incomplete signature,"renewal, 2nd year"\n`,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        row: 1,
        sourceKey: "drive:drv1",
        underwriterName: "Autumn Beck Blackledge",
        contractIdentifier: "IO-1001",
        effectiveFrom: "2026-04-01",
        effectiveTo: "2026-09-29",
        sponsorshipTotal: 2600,
        contractType: "Local/direct",
        sourceFile: "Blackledge IO.pdf",
        driveFileId: "drv1",
        documentationStatus: "incomplete signature",
        notes: "renewal, 2nd year",
      },
    ]);
  });

  it("requires the underwriter and source-file columns", () => {
    const { rows, errors } = parseMigrationManifest("sponsor,total\nAcme,10");
    expect(rows).toEqual([]);
    expect(errors[0]!.message).toMatch(/no source_file column/);
  });

  it("reports bad rows by number and keeps the good ones", () => {
    const { rows, errors } = parseMigrationManifest(
      [
        "underwriter,source_file,start,end,total",
        "Acme,acme.pdf,2026-01-01,2026-12-31,100",
        ",missing.pdf,,,",
        "Beta,beta.pdf,2026-05-01,2026-04-01,",
        "Gamma,gamma.pdf,,,trade",
      ].join("\n"),
    );
    expect(rows.map((row) => row.underwriterName)).toEqual(["Acme"]);
    expect(errors.map((error) => error.row)).toEqual([2, 3, 4]);
    expect(errors[1]!.message).toMatch(/before effective_from/);
    expect(errors[2]!.message).toMatch(/isn't an amount/);
  });

  it("refuses every row sharing a key", () => {
    const { rows, errors } = parseMigrationManifest(
      "underwriter,source_file\nAcme,a.pdf\nAcme again,Folder/A.pdf\nBeta,b.pdf",
    );
    expect(rows.map((row) => row.row)).toEqual([3]);
    expect(errors.map((error) => error.row)).toEqual([1, 2]);
    expect(errors[0]!.message).toMatch(/row 2/);
  });
});

describe("an entry against what's on file", () => {
  const underwriters = [
    { id: "u1", name: "Autumn Beck Blackledge" },
    { id: "u2", name: "Acme  Hardware" },
  ];

  it("matches underwriters by exact name, case and spacing aside", () => {
    expect(resolveManifestUnderwriter(" autumn beck BLACKLEDGE ", underwriters)?.id).toBe("u1");
    expect(resolveManifestUnderwriter("Acme Hardware", underwriters)?.id).toBe("u2");
    expect(resolveManifestUnderwriter("Autumn Beck Blackledge, P.A.", underwriters)).toBeNull();
  });

  const entry = {
    sourceKey: "IO-1",
    sourceFile: "io.pdf",
    contractType: "FPM/FPBS",
    documentationStatus: "incomplete signature",
    notes: null,
    contractIdentifier: "IO-1",
    effectiveFrom: "2026-01-05",
    effectiveTo: null,
    sponsorshipTotal: 1200,
  };

  it("carries the manifest's classification into the contract's notes", () => {
    expect(migrationNotes(entry, "Sept batch")).toBe(
      'Migrated from legacy records (batch "Sept batch", key IO-1).\nSource document: io.pdf.\nContract type: FPM/FPBS.\nDocumentation: incomplete signature.',
    );
  });

  it("becomes the order step's typed fields, blanks where the manifest is silent", () => {
    const typed = typedFieldsFromManifest(entry, "u1", "B");
    expect(typed).toMatchObject({
      underwriter_id: "u1",
      contract_identifier: "IO-1",
      effective_from: "2026-01-05",
      effective_to: "",
      sponsorship_total: "1200",
      sponsorship_category: "",
    });
  });

  it("matches a chosen file by basename", () => {
    const files = [{ name: "Other.pdf" }, { name: "IO.PDF" }];
    expect(matchDocumentFile("Business/2026/io.pdf", files)?.name).toBe("IO.PDF");
    expect(matchDocumentFile("missing.pdf", files)).toBeNull();
  });
});

describe("whether an entry may run", () => {
  const now = new Date("2026-09-29T12:00:00Z");

  it("runs pending and failed entries, never an imported one with its contract", () => {
    expect(
      canRunMigrationItem({ status: "pending", contract_id: null, started_at: null }, now),
    ).toBe(true);
    expect(
      canRunMigrationItem({ status: "failed", contract_id: null, started_at: null }, now),
    ).toBe(true);
    expect(
      canRunMigrationItem({ status: "imported", contract_id: "c", started_at: null }, now),
    ).toBe(false);
    expect(
      canRunMigrationItem({ status: "imported", contract_id: null, started_at: null }, now),
    ).toBe(true);
  });

  it("reclaims a processing entry only once it's stale", () => {
    const fresh = {
      status: "processing" as const,
      contract_id: null,
      started_at: "2026-09-29T11:55:00Z",
    };
    const stale = { ...fresh, started_at: "2026-09-29T11:40:00Z" };
    expect(canRunMigrationItem(fresh, now)).toBe(false);
    expect(canRunMigrationItem(stale, now)).toBe(true);
    expect(canUpdateMigrationItemFacts(fresh, now)).toBe(false);
    expect(
      canUpdateMigrationItemFacts({ status: "imported", contract_id: "c", started_at: null }, now),
    ).toBe(false);
  });
});

describe("manifestDiscrepancies", () => {
  const line = (overrides: Partial<AgreementModelLine>): AgreementModelLine => ({
    label: "Mon carpool",
    source_text: "Mon 7:49 am",
    entry_kind: "fixed_days",
    count_per_day: 1,
    quantity: null,
    interval_weeks: null,
    explicit_dates: [],
    week_grid: [],
    days_of_week: [1],
    pool: null,
    program: null,
    time_mode: "preferred",
    window_start: null,
    window_end: null,
    preferred_time: "07:49",
    max_per_day: null,
    service_level: "guaranteed",
    duration_seconds: 30,
    start_date: "2026-04-01",
    end_date: "2026-09-29",
    flight: null,
    stated_total: 26,
    notes: null,
    ...overrides,
  });
  const output = (lines: AgreementModelLine[]): AgreementModelOutput => ({
    order: {
      underwriter: "Autumn Beck Blackledge",
      new_underwriter_name: null,
      contract_identifier: "io-1001",
      effective_from: "2026-04-01",
      effective_to: "2026-09-30",
      sponsorship_category: null,
      stated_total_spots: 26,
      sponsorship_total: 2600,
      affidavit_required: false,
      makegood_requires_agency_approval: false,
      separation_source_text: null,
      preemption_policy: null,
    },
    flights: [],
    lines,
    unresolved: [],
    notes: [],
  });
  const entry = {
    underwriterName: "autumn beck blackledge",
    contractIdentifier: "IO-1001",
    effectiveFrom: "2026-04-01",
    effectiveTo: "2026-09-29",
    sponsorshipTotal: 2600,
  };

  it("is quiet when the document agrees", () => {
    expect(
      manifestDiscrepancies({ ...entry, effectiveTo: "2026-09-30" }, output([line({})])),
    ).toEqual([]);
  });

  it("names each disagreement and lines running past the manifest's dates", () => {
    const warnings = manifestDiscrepancies(
      { ...entry, sponsorshipTotal: 2500 },
      output([line({ start_date: "2026-03-30", end_date: "2026-10-05", label: "" })]),
    );
    expect(warnings).toEqual([
      "The document ends 2026-09-30; the manifest's 2026-09-29 was used.",
      "The document's total is 2600.00; the manifest's 2500.00 was used.",
      '"Line 1" starts 2026-03-30, before the manifest\'s 2026-04-01.',
      '"Line 1" ends 2026-10-05, after the manifest\'s 2026-09-29.',
    ]);
  });
});

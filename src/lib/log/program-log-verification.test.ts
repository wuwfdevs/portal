import { describe, expect, it } from "vitest";
import {
  clockToSeconds,
  containsLiteral,
  extractVerifiedSpan,
  findLiteralIndex,
  verifyAndResolveEvents,
  type RawEvent,
} from "./program-log-verification";

describe("clockToSeconds", () => {
  it("reads mm:ss lengths and hh:mm:ss times", () => {
    expect(clockToSeconds("01:30")).toBe(90);
    expect(clockToSeconds("00:30")).toBe(30);
    expect(clockToSeconds("06:06:00")).toBe(21960);
  });

  it("strips a parenthesized avail window", () => {
    expect(clockToSeconds("(01:55)")).toBe(115);
  });
});

describe("containsLiteral / findLiteralIndex", () => {
  it("finds an exact value in the source text", () => {
    expect(containsLiteral("06:06:00 Morning Edition", "06:06:00")).toBe(true);
  });

  it("matches across curly vs. straight quotes", () => {
    expect(containsLiteral("Juan’s Flying Burrito", "Juan's Flying Burrito")).toBe(true);
  });

  it("returns false/-1 for a value that isn't present", () => {
    expect(containsLiteral("06:06:00 Morning Edition", "47")).toBe(false);
    expect(findLiteralIndex("abc", "47", 0)).toBe(-1);
  });

  it("respects fromIndex", () => {
    const text = "47 ... 47 ... 47";
    expect(findLiteralIndex(text, "47", 3)).toBe(7);
  });
});

describe("extractVerifiedSpan", () => {
  const SCRIPT =
    "Support for WUWF comes from Juan’s Flying Burrito on Alcaniz Street, serving a Creole-Mexican " +
    "fusion menu. Details at juans flying burrito dot com.";

  it("extracts the exact verbatim span between a verified opening and closing phrase", () => {
    const span = extractVerifiedSpan(SCRIPT, "Support for WUWF comes from Juan", "flying burrito dot com.");
    expect(span?.text).toBe(SCRIPT);
  });

  it("matches quote variants between the model's phrasing and the source", () => {
    const span = extractVerifiedSpan(SCRIPT, "Support for WUWF comes from Juan's", "burrito dot com.");
    expect(span).not.toBeNull();
  });

  it("returns null when the opening or closing phrase isn't in the source", () => {
    expect(extractVerifiedSpan(SCRIPT, "Nothing like this exists", "burrito dot com.")).toBeNull();
    expect(extractVerifiedSpan(SCRIPT, "Support for WUWF comes from", "not in the text at all")).toBeNull();
  });

  it("returns null when the closing phrase occurs only before the opening phrase", () => {
    const text = "The end. Then later: Support for WUWF comes from Someone.";
    expect(extractVerifiedSpan(text, "Support for WUWF comes from Someone", "The end.")).toBeNull();
  });
});

describe("verifyAndResolveEvents", () => {
  const SOURCE =
    "06:06:00 | 1 | Baptist Healthcare / Copy 1 | 00:30\n" +
    "Support for WUWF comes from Baptist Health Care. For 75 years, Baptist has remained locally led.\n" +
    "08:49:35 | UW Credit (01:55)\n" +
    "Support for WUWF comes from Juan's Flying Burrito on Alcaniz Street. Support for WUWF comes from " +
    "Autumn Beck Blackledge, Attorneys of Divorce and Family Law.";

  const KNOWN = ["Baptist Health Care", "Autumn Beck Blackledge"];

  it("resolves a cart-bearing credit against a known underwriter, with its own printed duration", () => {
    const raw: RawEvent[] = [
      {
        printedTime: "06:06:00",
        kind: "credit",
        description: "Baptist Healthcare / Copy 1",
        printedLength: "00:30",
        credits: [
          {
            cart: "1",
            label: "Copy 1",
            underwriter: "Baptist Health Care",
            newUnderwriterName: null,
            openingWords: "Support for WUWF comes from Baptist",
            closingWords: "Baptist has remained locally led.",
          },
        ],
      },
    ];
    const { events, warnings } = verifyAndResolveEvents(raw, SOURCE, KNOWN);
    expect(warnings).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]!.timeSeconds).toBe(21960);
    expect(events[0]!.lengthSeconds).toBe(30);
    expect(events[0]!.credits).toEqual([
      {
        cart: "1",
        label: "Copy 1",
        underwriterName: "Baptist Health Care",
        script: "Support for WUWF comes from Baptist Health Care. For 75 years, Baptist has remained locally led.",
        durationSeconds: 30,
      },
    ]);
  });

  it("resolves multiple bundled cart-less credits under one avail, in order, one new underwriter and one known", () => {
    const raw: RawEvent[] = [
      {
        printedTime: "08:49:35",
        kind: "avail",
        description: "UW Credit (01:55)",
        printedLength: "(01:55)",
        credits: [
          {
            cart: null,
            label: "Live read",
            underwriter: "NEW",
            newUnderwriterName: "Juan's Flying Burrito",
            openingWords: "Support for WUWF comes from Juan's Flying Burrito",
            closingWords: "on Alcaniz Street.",
          },
          {
            cart: null,
            label: "Live read",
            underwriter: "Autumn Beck Blackledge",
            newUnderwriterName: null,
            openingWords: "Support for WUWF comes from Autumn Beck Blackledge",
            closingWords: "Divorce and Family Law.",
          },
        ],
      },
    ];
    const { events, warnings } = verifyAndResolveEvents(raw, SOURCE, KNOWN);
    expect(warnings).toEqual([]);
    expect(events[0]!.availDurationSeconds).toBe(115);
    expect(events[0]!.credits).toHaveLength(2);
    expect(events[0]!.credits[0]!.underwriterName).toBe("Juan's Flying Burrito");
    expect(events[0]!.credits[0]!.durationSeconds).toBeNull(); // avail credits never inherit the window as their own duration
    expect(events[0]!.credits[1]!.underwriterName).toBe("Autumn Beck Blackledge");
    expect(events[0]!.credits[0]!.script).toContain("Juan's Flying Burrito");
    expect(events[0]!.credits[1]!.script).toContain("Autumn Beck Blackledge");
    // Never overlapping substrings of the source.
    expect(events[0]!.credits[0]!.script).not.toContain("Autumn Beck Blackledge");
  });

  it("drops a whole row whose claimed time can't be found in the source", () => {
    const raw: RawEvent[] = [
      { printedTime: "23:59:00", kind: "note", description: "Nonexistent", printedLength: null, credits: [] },
    ];
    const { events, warnings } = verifyAndResolveEvents(raw, SOURCE, KNOWN);
    expect(events).toEqual([]);
    expect(warnings[0]).toMatch(/could not be matched/);
  });

  it("drops a row whose printed time isn't even shaped like a time", () => {
    const raw: RawEvent[] = [
      { printedTime: "not a time", kind: "note", description: "Nonexistent", printedLength: null, credits: [] },
    ];
    const { events, warnings } = verifyAndResolveEvents(raw, SOURCE, KNOWN);
    expect(events).toEqual([]);
    expect(warnings[0]).toMatch(/unrecognized time format/);
  });

  it("drops one credit whose boundary phrases don't verify, but keeps the row", () => {
    const raw: RawEvent[] = [
      {
        printedTime: "08:49:35",
        kind: "avail",
        description: "UW Credit (01:55)",
        printedLength: "(01:55)",
        credits: [
          {
            cart: null,
            label: "Live read",
            underwriter: "NEW",
            newUnderwriterName: "Somebody",
            openingWords: "This phrase is not in the document",
            closingWords: "and neither is this",
          },
        ],
      },
    ];
    const { events, warnings } = verifyAndResolveEvents(raw, SOURCE, KNOWN);
    expect(events).toHaveLength(1);
    expect(events[0]!.credits).toEqual([]);
    expect(warnings[0]).toMatch(/could not be verified/);
  });

  it("drops a credit naming an underwriter that's neither known nor marked NEW", () => {
    const raw: RawEvent[] = [
      {
        printedTime: "06:06:00",
        kind: "credit",
        description: "Baptist Healthcare / Copy 1",
        printedLength: "00:30",
        credits: [
          {
            cart: "1",
            label: "Copy 1",
            underwriter: "Some Unlisted Name",
            newUnderwriterName: null,
            openingWords: "Support for WUWF comes from Baptist",
            closingWords: "Baptist has remained locally led.",
          },
        ],
      },
    ];
    const { events, warnings } = verifyAndResolveEvents(raw, SOURCE, KNOWN);
    expect(events[0]!.credits).toEqual([]);
    expect(warnings[0]).toMatch(/isn't recognized/);
  });

  it("drops just the cart number when it doesn't verify near the row, keeping the rest of the credit", () => {
    const raw: RawEvent[] = [
      {
        printedTime: "06:06:00",
        kind: "credit",
        description: "Baptist Healthcare / Copy 1",
        printedLength: "00:30",
        credits: [
          {
            cart: "999",
            label: "Copy 1",
            underwriter: "Baptist Health Care",
            newUnderwriterName: null,
            openingWords: "Support for WUWF comes from Baptist",
            closingWords: "Baptist has remained locally led.",
          },
        ],
      },
    ];
    const { events, warnings } = verifyAndResolveEvents(raw, SOURCE, KNOWN);
    expect(events[0]!.credits[0]!.cart).toBeNull();
    expect(events[0]!.credits[0]!.underwriterName).toBe("Baptist Health Care");
    expect(warnings[0]).toMatch(/cart number.*could not be verified/);
  });

  it("falls back to the 'Imported copy' label when the model returns a blank one", () => {
    const raw: RawEvent[] = [
      {
        printedTime: "06:06:00",
        kind: "credit",
        description: "Baptist Healthcare / Copy 1",
        printedLength: "00:30",
        credits: [
          {
            cart: "1",
            label: "  ",
            underwriter: "Baptist Health Care",
            newUnderwriterName: null,
            openingWords: "Support for WUWF comes from Baptist",
            closingWords: "Baptist has remained locally led.",
          },
        ],
      },
    ];
    const { events } = verifyAndResolveEvents(raw, SOURCE, KNOWN);
    expect(events[0]!.credits[0]!.label).toBe("Imported copy");
  });

  // Regression coverage for a real bug found against a live import: an
  // avail marker and the credit that fills it print the identical
  // timestamp on adjacent lines. The old implementation used one search
  // cursor shared across the whole array, so it only worked when the model
  // happened to list rows in exact document order — reporting the credit
  // before its own avail (a very natural way to describe "this credit airs
  // in this break") made the cursor skip past both occurrences of the
  // shared timestamp while confirming the credit, leaving nothing for the
  // avail to find. Each row must now resolve independently of array order.
  describe("same-timestamp rows (an avail and the credit that fills it)", () => {
    const DUP_TIME_SOURCE =
      "06:06:00 | UW Credit (01:30)\n" +
      "06:06:00 | 1 | Baptist Healthcare / Copy 1 | 00:30\n" +
      "Support for WUWF comes from Baptist Health Care. For 75 years, Baptist has remained locally led.\n" +
      "07:00:00 | UW Credit (00:30)\n";

    const availEvent: RawEvent = {
      printedTime: "06:06:00",
      kind: "avail",
      description: "UW Credit (01:30)",
      printedLength: "(01:30)",
      credits: [],
    };
    const creditEvent: RawEvent = {
      printedTime: "06:06:00",
      kind: "credit",
      description: "Baptist Healthcare / Copy 1",
      printedLength: "00:30",
      credits: [
        {
          cart: "1",
          label: "Copy 1",
          underwriter: "Baptist Health Care",
          newUnderwriterName: null,
          openingWords: "Support for WUWF comes from Baptist",
          closingWords: "Baptist has remained locally led.",
        },
      ],
    };
    const laterAvail: RawEvent = {
      printedTime: "07:00:00",
      kind: "avail",
      description: "UW Credit (00:30)",
      printedLength: "(00:30)",
      credits: [],
    };

    it("resolves both rows when they're listed in document order (avail, then credit)", () => {
      const { events, warnings } = verifyAndResolveEvents([availEvent, creditEvent], DUP_TIME_SOURCE, KNOWN);
      expect(warnings).toEqual([]);
      expect(events.find((event) => event.kind === "avail")?.availDurationSeconds).toBe(90);
      expect(events.find((event) => event.kind === "credit")?.credits).toHaveLength(1);
    });

    it("resolves both rows when the model lists the credit before its own avail (out of document order)", () => {
      const { events, warnings } = verifyAndResolveEvents([creditEvent, availEvent], DUP_TIME_SOURCE, KNOWN);
      expect(warnings).toEqual([]);
      expect(events.find((event) => event.kind === "avail")?.availDurationSeconds).toBe(90);
      expect(events.find((event) => event.kind === "credit")?.credits).toHaveLength(1);
    });

    it("returns events sorted by time regardless of the input array's order", () => {
      const { events } = verifyAndResolveEvents([laterAvail, creditEvent, availEvent], DUP_TIME_SOURCE, KNOWN);
      expect(events.map((event) => event.time)).toEqual(["06:06:00", "06:06:00", "07:00:00"]);
    });
  });

  // Regression coverage for a real bug found against a live import: every
  // underwriting credit in an imported shift came through doubled. Root
  // cause — the model reported the same real credit twice for one window:
  // once bundled inline on the avail row, and again as its own separate
  // "credit" row (the DAD export's own script-in-two-places quirk this
  // importer's history already names) — both readings verify
  // independently, since the text they each point at really is there
  // twice. A byte-identical script at the same instant is the signal that
  // it's one credit described twice, not two different credits.
  describe("duplicate credits reported for the same moment", () => {
    const BUNDLED_AND_SEPARATE_SOURCE =
      "11:49:35 | UW Credit (02:00)\n" +
      "Support for WUWF comes from Expo Co. Details at expo dot com.\n" +
      "11:49:35 | 103 | Expo Co / Copy 1 | 00:30\n" +
      "Support for WUWF comes from Expo Co. Details at expo dot com.\n";
    const NAMES = ["Expo Co"];

    it("drops a dedicated credit row that repeats a credit already bundled on the avail, verbatim, at the same time", () => {
      const raw: RawEvent[] = [
        {
          printedTime: "11:49:35",
          kind: "avail",
          description: "UW Credit (02:00)",
          printedLength: "(02:00)",
          credits: [
            {
              cart: null,
              label: "Live read",
              underwriter: "Expo Co",
              newUnderwriterName: null,
              openingWords: "Support for WUWF comes from Expo Co.",
              closingWords: "Details at expo dot com.",
            },
          ],
        },
        {
          printedTime: "11:49:35",
          kind: "credit",
          description: "Expo Co / Copy 1",
          printedLength: "00:30",
          credits: [
            {
              cart: "103",
              label: "Copy 1",
              underwriter: "Expo Co",
              newUnderwriterName: null,
              openingWords: "Support for WUWF comes from Expo Co.",
              closingWords: "Details at expo dot com.",
            },
          ],
        },
      ];
      const { events, warnings } = verifyAndResolveEvents(raw, BUNDLED_AND_SEPARATE_SOURCE, NAMES);
      expect(events).toHaveLength(1);
      expect(events[0]!.kind).toBe("avail");
      expect(events[0]!.credits).toHaveLength(1);
      expect(warnings.some((w) => w.includes("repeated one already captured"))).toBe(true);
    });

    it("keeps a later re-airing of the same script at a different time", () => {
      const twiceDailySource =
        "11:49:35 | UW Credit (02:00)\n" +
        "Support for WUWF comes from Expo Co. Details at expo dot com.\n" +
        "13:06:00 | UW Credit (02:00)\n" +
        "Support for WUWF comes from Expo Co. Details at expo dot com.\n";
      const availAt = (printedTime: string): RawEvent => ({
        printedTime,
        kind: "avail",
        description: "UW Credit (02:00)",
        printedLength: "(02:00)",
        credits: [
          {
            cart: null,
            label: "Live read",
            underwriter: "Expo Co",
            newUnderwriterName: null,
            openingWords: "Support for WUWF comes from Expo Co.",
            closingWords: "Details at expo dot com.",
          },
        ],
      });
      const { events, warnings } = verifyAndResolveEvents(
        [availAt("11:49:35"), availAt("13:06:00")],
        twiceDailySource,
        NAMES,
      );
      expect(events).toHaveLength(2);
      expect(events[0]!.credits).toHaveLength(1);
      expect(events[1]!.credits).toHaveLength(1);
      expect(warnings).toEqual([]);
    });
  });
});

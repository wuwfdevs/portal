import { describe, expect, it } from "vitest";
import { extractDocxPlainText } from "./program-log-docx-text";
import { PROGRAM_LOG_FIXTURE_XML } from "./program-log-docx-text.fixture";

describe("extractDocxPlainText", () => {
  const text = extractDocxPlainText(PROGRAM_LOG_FIXTURE_XML);

  it("includes the title row", () => {
    expect(text).toContain("Friday 8/21/2026 WUWF-FM Program Log");
  });

  it("includes ordinary content rows with their time and length", () => {
    expect(text).toContain("00:00:00 | 88 | BBC World Service | 00:30");
  });

  it("includes avail markers with their printed window", () => {
    expect(text).toContain("06:49:35 | UW Credit (01:55)");
  });

  it("includes a cart-bearing credit row and its script on the following line, verbatim", () => {
    expect(text).toContain("06:06:00 | 1 | Baptist Healthcare / Copy 1 | 00:30");
    expect(text).toContain(
      "Local support for WUWF is provided by Baptist Health Care. For 75 years, Baptist has remained locally led and governed by representatives of the community through a board of directors who live and work here in Northwest Florida.",
    );
  });

  it("keeps document order across a page-table boundary (the Chesser Barr script lands on page 2)", () => {
    const creditIndex = text.indexOf("Chesser Barr Law Firm / Copy 3");
    const scriptIndex = text.indexOf("Support for WUWF comes from Chesser & Barr");
    expect(creditIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeGreaterThan(creditIndex);
  });

  it("drops entirely empty rows rather than emitting blank lines", () => {
    expect(text).not.toMatch(/\n\s*\n/);
  });

  it("decodes entities and joins wrapped runs without gluing words together", () => {
    expect(text).toContain("Clark,Partington,Hart,Larry,Bond & Stackhouse / CPH Law");
  });
});

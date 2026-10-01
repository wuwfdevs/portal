import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LegacyCopySnapshot } from "@/lib/underwriting/legacy-copy";

// The review screen, driven the way a person uses it: choose the file, see
// the questions, answer one, import. The server action is a stand-in that
// records what the screen sends.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const importLegacyCopy = vi.fn();
vi.mock("./actions", () => ({ importLegacyCopy: (input: unknown) => importLegacyCopy(input) }));

const { CopyImportClient } = await import("./copy-import-client");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CSV = [
  "WUWF — Approved/Active Underwriting Copy (Scripts),,,,,,",
  ",,,,,,",
  "Underwriter,Cart,Copy Name,Length (sec),Start Date,End Date,Script",
  '309 Punk Project,101,copy 1,30,10/1/2026,10/30/2026,"Support for WUWF comes from 309 Punk Project."',
  'Choral Society,200,El Mesias,30,11/23/2026,12/4/2026,"Support for WUWF comes from Choral Society presenting El Mesías."',
  "Choral Society,200,Mass in Blue,30,5/3/2027,5/14/2027,... copy holder ....",
].join("\r\n");

const SNAPSHOT: LegacyCopySnapshot = {
  underwriters: [{ id: "uw-choral", name: "Choral Society" }],
  copy: [],
  contracts: [],
  flights: [],
  links: [],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  importLegacyCopy.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function chooseFile(content: string, name = "export.csv") {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  // jsdom's File has no text(); the screen only reads name, size and text().
  const file = { name, size: content.length, text: async () => content };
  Object.defineProperty(input, "files", { value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const text = () => container.textContent ?? "";

describe("CopyImportClient", () => {
  it("leads with the one question, imports the rest, and sends the answers it showed", async () => {
    act(() => root.render(createElement(CopyImportClient, { snapshot: SNAPSHOT })));
    expect(text()).toContain("Choose the RadioTraffic copy export");

    await chooseFile(CSV);
    expect(text()).toContain("One thing needs you first.");
    expect(text()).toContain("Who is “309 Punk Project”?");
    expect(text()).toContain("1 placeholder with no script yet");
    expect(text()).toContain("1 row waiting on a question, left out until answered.");
    const importButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.startsWith("Import"),
    )!;
    expect(importButton.textContent).toBe("Import 1 row");

    const add = [...container.querySelectorAll("label")].find((label) =>
      label.textContent?.includes("as a new underwriter"),
    )!;
    act(() => add.querySelector("input")!.click());
    expect(text()).toContain("Everything is answered. Ready to import.");
    expect(importButton.textContent).toBe("Import 2 rows");

    importLegacyCopy.mockResolvedValue({
      ok: true,
      data: {
        created: 2,
        updated: 0,
        linked: 0,
        underwriterOnly: 2,
        underwritersAdded: ["309 Punk Project"],
        failed: 0,
        rows: [],
        rebalanced: { contracts: 0, changed: 0 },
      },
    });
    await act(async () => {
      importButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(importLegacyCopy).toHaveBeenCalledWith({
      csv: CSV,
      answers: JSON.stringify({ "underwriter:309 punk project": "new" }),
      fileName: "export.csv",
    });
    expect(text()).toContain("Imported export.csv");
    expect(text()).toContain("Left out (1)");
  });

  it("turns away the Excel workbook itself with how to save it as CSV", async () => {
    act(() => root.render(createElement(CopyImportClient, { snapshot: SNAPSHOT })));
    await chooseFile("PK", "WUWF_Active_Copy_by_Underwriter.xlsx");
    expect(text()).toContain("Save it as CSV first");
  });
});

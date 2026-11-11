import { describe, expect, it } from "vitest";
import { encodeQr, qrPath } from "./qr";

describe("QR codes", () => {
  it("encodes an address into a square of modules with the three finder patterns", () => {
    const code = encodeQr("https://site.example/listens/table/AbC_-123");
    expect(code.dark).toHaveLength(code.size);
    expect(code.dark.every((row) => row.length === code.size)).toBe(true);
    // The finder pattern's outer ring is dark in three corners and not in the fourth.
    expect(code.dark[0]![0]).toBe(true);
    expect(code.dark[0]![code.size - 1]).toBe(true);
    expect(code.dark[code.size - 1]![0]).toBe(true);
  });

  it("is deterministic, so a reprint of the same link scans the same", () => {
    expect(encodeQr("https://a.example/x").dark).toEqual(encodeQr("https://a.example/x").dark);
  });

  it("draws a path inside a viewBox with a quiet zone around it", () => {
    const code = encodeQr("https://a.example/x");
    const { path, viewBox } = qrPath(code);
    expect(viewBox).toBe(`0 0 ${code.size + 8} ${code.size + 8}`);
    expect(path.startsWith("M4 4h")).toBe(true);
  });
});

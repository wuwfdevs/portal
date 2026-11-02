import { describe, expect, it } from "vitest";
import { createZipStream, crc32, uniqueEntryName, type ZipEntry } from "./zip";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

async function* fromArray(entries: ZipEntry[]): AsyncGenerator<ZipEntry> {
  for (const entry of entries) yield entry;
}

async function collect(source: ZipEntry[] | AsyncIterable<ZipEntry>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = createZipStream(Array.isArray(source) ? fromArray(source) : source).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.length;
  }
  return output;
}

/**
 * Reads the archive back the way an unzip tool does — from the
 * end-of-central-directory record, following each entry's recorded offset —
 * so these tests fail on a wrong offset or length rather than only on
 * obviously malformed bytes.
 */
function readArchive(archive: Uint8Array): { name: string; content: string; crc: number }[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const eocd = archive.length - 22; // no archive comment, so it's the last 22 bytes
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries: { name: string; content: string; crc: number }[] = [];

  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength));

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataAt = localOffset + 30 + localNameLength + localExtraLength;

    entries.push({ name, crc, content: decoder.decode(archive.subarray(dataAt, dataAt + size)) });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }

  return entries;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });

  it("is 0 for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("createZipStream", () => {
  it("writes entries that read back by name and content", async () => {
    const archive = await collect([
      { name: "first.wav", data: bytes("the first clip") },
      { name: "second.wav", data: bytes("the second clip") },
    ]);

    expect(readArchive(archive)).toEqual([
      { name: "first.wav", content: "the first clip", crc: crc32(bytes("the first clip")) },
      { name: "second.wav", content: "the second clip", crc: crc32(bytes("the second clip")) },
    ]);
  });

  it("stores entries uncompressed, so the archive carries every byte verbatim", async () => {
    const data = bytes("PCM audio does not compress");
    const archive = await collect([{ name: "clip.wav", data }]);
    const view = new DataView(archive.buffer);

    expect(view.getUint16(8, true)).toBe(0); // method: store
    expect(view.getUint32(18, true)).toBe(data.length); // compressed size
    expect(view.getUint32(22, true)).toBe(data.length); // uncompressed size
  });

  it("handles non-ASCII names and empty entries", async () => {
    const archive = await collect([
      { name: "reeves–interview.wav", data: bytes("") },
      { name: "señora.wav", data: bytes("x") },
    ]);

    expect(readArchive(archive).map((entry) => entry.name)).toEqual([
      "reeves–interview.wav",
      "señora.wav",
    ]);
  });

  it("produces a valid empty archive when there is nothing to add", async () => {
    const archive = await collect([]);
    expect(archive).toHaveLength(22);
    expect(readArchive(archive)).toEqual([]);
  });

  it("surfaces a failure from the entry source instead of closing the archive cleanly", async () => {
    async function* failing(): AsyncGenerator<ZipEntry> {
      yield { name: "first.wav", data: bytes("fine") };
      throw new Error("render failed");
    }

    await expect(collect(failing())).rejects.toThrow("render failed");
  });
});

describe("uniqueEntryName", () => {
  it("keeps a name that hasn't been used", () => {
    const taken = new Set<string>();
    expect(uniqueEntryName("clip.wav", taken)).toBe("clip.wav");
    expect(taken.has("clip.wav")).toBe(true);
  });

  it("numbers repeats before the extension", () => {
    const taken = new Set<string>();
    uniqueEntryName("clip.wav", taken);
    expect(uniqueEntryName("clip.wav", taken)).toBe("clip-2.wav");
    expect(uniqueEntryName("clip.wav", taken)).toBe("clip-3.wav");
  });

  it("appends to the end when there is no extension", () => {
    const taken = new Set(["clip"]);
    expect(uniqueEntryName("clip", taken)).toBe("clip-2");
  });
});

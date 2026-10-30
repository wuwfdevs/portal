// A minimal streaming zip writer, used by "export all clips" to hand back
// every rendered WAV as one download.
//
// Hand-rolled rather than pulling in an archiver library: the whole of the
// format we need is the three records below (local header, central
// directory, end-of-central-directory) with no compression, and this project
// deliberately runs on a small dependency set. Entries are *stored*, not
// deflated — PCM WAV barely compresses, and storing keeps this both
// allocation-free per entry and fast enough to stay in the request.
//
// Deliberate limits, both far outside what a clip archive can reach (see
// MAX_CLIPS_ZIP_DURATION_MS): no zip64, so the archive and each entry must
// stay under 4 GB; and no data descriptors, so an entry's bytes must be in
// hand before its header is written.
//
// Pure and dependency-free — no "server-only", no Node builtins — so it runs
// under Vitest without mocks, per CLAUDE.md's testing expectations.

export interface ZipEntry {
  /** Path inside the archive. Written as UTF-8 (general-purpose bit 11). */
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

/** 2.0 — the version that introduced everything used here. */
const VERSION = 20;
/** Bit 11: filenames and comments are UTF-8. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;

/**
 * Streams a zip archive built from `entries`, which are consumed lazily —
 * the caller can render each clip only when its turn comes, so peak memory
 * is one entry rather than the whole archive.
 *
 * An error thrown while producing entries is forwarded to the stream
 * (the response body fails mid-flight); the alternative, buffering
 * everything so failures stay clean, is exactly the memory cost this is
 * written to avoid.
 */
export function createZipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const iterator = entries[Symbol.asyncIterator]();
  const directory: CentralRecord[] = [];
  const modified = dosDateTime(new Date());
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let next: IteratorResult<ZipEntry>;
      try {
        next = await iterator.next();
      } catch (error) {
        controller.error(error);
        return;
      }

      if (next.done) {
        controller.enqueue(buildCentralDirectory(directory, offset));
        controller.close();
        return;
      }

      const entry = next.value;
      const nameBytes = encodeUtf8(entry.name);
      const record: CentralRecord = {
        nameBytes,
        crc: crc32(entry.data),
        size: entry.data.length,
        offset,
        modified,
      };

      const header = buildLocalHeader(record);
      controller.enqueue(header);
      controller.enqueue(entry.data);
      offset += header.length + entry.data.length;
      directory.push(record);
    },

    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}

/**
 * A name that hasn't been used in this archive yet, adding "-2", "-3", … before
 * the extension. Two clips in a project can carry the same title, and a zip
 * with duplicate entry names unpacks to whichever one lands last. Mutates
 * `taken` with the name it returns.
 */
export function uniqueEntryName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }

  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";

  let suffix = 2;
  let candidate = `${stem}-${suffix}${extension}`;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${stem}-${suffix}${extension}`;
  }

  taken.add(candidate);
  return candidate;
}

interface CentralRecord {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  modified: { time: number; date: number };
}

function buildLocalHeader(record: CentralRecord): Uint8Array {
  const header = new Uint8Array(30 + record.nameBytes.length);
  const view = new DataView(header.buffer);

  view.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, FLAG_UTF8, true);
  view.setUint16(8, METHOD_STORE, true);
  view.setUint16(10, record.modified.time, true);
  view.setUint16(12, record.modified.date, true);
  view.setUint32(14, record.crc, true);
  view.setUint32(18, record.size, true); // compressed == uncompressed when stored
  view.setUint32(22, record.size, true);
  view.setUint16(26, record.nameBytes.length, true);
  view.setUint16(28, 0, true); // no extra field
  header.set(record.nameBytes, 30);

  return header;
}

function buildCentralDirectory(records: CentralRecord[], startOffset: number): Uint8Array {
  const size = records.reduce((total, record) => total + 46 + record.nameBytes.length, 0);
  const buffer = new Uint8Array(size + 22);
  const view = new DataView(buffer.buffer);
  let at = 0;

  for (const record of records) {
    view.setUint32(at, CENTRAL_HEADER_SIGNATURE, true);
    view.setUint16(at + 4, VERSION, true); // version made by
    view.setUint16(at + 6, VERSION, true); // version needed
    view.setUint16(at + 8, FLAG_UTF8, true);
    view.setUint16(at + 10, METHOD_STORE, true);
    view.setUint16(at + 12, record.modified.time, true);
    view.setUint16(at + 14, record.modified.date, true);
    view.setUint32(at + 16, record.crc, true);
    view.setUint32(at + 20, record.size, true);
    view.setUint32(at + 24, record.size, true);
    view.setUint16(at + 28, record.nameBytes.length, true);
    view.setUint16(at + 30, 0, true); // extra field length
    view.setUint16(at + 32, 0, true); // comment length
    view.setUint16(at + 34, 0, true); // disk number start
    view.setUint16(at + 36, 0, true); // internal attributes
    view.setUint32(at + 38, 0, true); // external attributes
    view.setUint32(at + 42, record.offset, true);
    buffer.set(record.nameBytes, at + 46);
    at += 46 + record.nameBytes.length;
  }

  view.setUint32(at, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(at + 4, 0, true); // this disk
  view.setUint16(at + 6, 0, true); // disk with the central directory
  view.setUint16(at + 8, records.length, true);
  view.setUint16(at + 10, records.length, true);
  view.setUint32(at + 12, size, true);
  view.setUint32(at + 16, startOffset, true);
  view.setUint16(at + 20, 0, true); // archive comment length

  return buffer;
}

/** MS-DOS date/time, the only timestamp the base format carries. Seconds have 2-second resolution, and the epoch is 1980. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }

  crcTable = table;
  return table;
}

/** CRC-32 (IEEE 802.3), which the zip format requires for every entry. */
export function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

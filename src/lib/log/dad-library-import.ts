// Pure parser for two DAD reports (Library -> Generate Reports -> "Standard
// Library", and its companion Groups report): fixed-width text, CRLF line
// endings, page headers/footers/dashed rules repeated every page. Both
// reports' column boundaries were measured directly against a real export
// rather than guessed — a title, agency, or outcue value can itself contain
// runs of spaces, so splitting on whitespace is unreliable; slicing by fixed
// character offset is not. Deliberately dependency-free and knows nothing
// about Supabase, matching program-log-import.ts's split: this module only
// classifies rows, lib/log/dad-library-plan.ts decides what they become.

export interface DadLibraryCut {
  /** "00001" — as printed, digits only, never parsed as a number (leading zeros matter). */
  cutNumber: string;
  title: string;
  lengthSeconds: number;
  group: string;
}

export interface ParsedDadLibrary {
  cuts: DadLibraryCut[];
  warnings: string[];
}

export interface DadGroup {
  name: string;
  description: string;
}

// 0-based [start, end) column offsets, measured against the header row
// (" CUT   TITLE                    LENGTH      KILL     AGENCY ... GROUP")
// of a real "Standard Library" export.
const CUT_COL = [1, 7] as const;
const TITLE_COL = [7, 32] as const;
const LENGTH_COL = [32, 44] as const;
const GROUP_COL_START = 103;

const CUT_ROW_RE = /^ (\d{5}) /;
const LENGTH_RE = /^(\d{2}):(\d{2}):(\d{2})\.\d$/;

function clockToSeconds(value: string): number | null {
  const match = LENGTH_RE.exec(value.trim());
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return Number.parseInt(hours!, 10) * 3600 + Number.parseInt(minutes!, 10) * 60 + Number.parseInt(seconds!, 10);
}

/**
 * Parses the "Standard Library" report's cut rows. Non-cut lines (the
 * "DAD CUTS DATABASE" banner, "Sorted by:"/"Date:" lines, the dashed rule,
 * the column header repeated on every page, blank lines) are silently
 * skipped — a cut row is identified structurally (a 5-digit number right
 * after the line's leading space), not by excluding every known noise
 * pattern, so a page layout this parser hasn't seen doesn't need its own
 * exclusion rule.
 */
export function parseDadLibrary(text: string): ParsedDadLibrary {
  const cuts: DadLibraryCut[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  for (const line of lines) {
    if (!CUT_ROW_RE.test(line)) continue;

    const cutNumber = line.slice(CUT_COL[0], CUT_COL[1]).trim();
    const title = line.slice(TITLE_COL[0], TITLE_COL[1]).trim();
    const lengthRaw = line.slice(LENGTH_COL[0], LENGTH_COL[1]).trim();
    const group = line.slice(GROUP_COL_START).trim();

    const lengthSeconds = clockToSeconds(lengthRaw);
    if (lengthSeconds === null) {
      warnings.push(`Cut ${cutNumber} has an unreadable length ("${lengthRaw}") and was skipped.`);
      continue;
    }
    if (group === "") {
      warnings.push(`Cut ${cutNumber} ("${title}") has no group and was skipped.`);
      continue;
    }

    cuts.push({ cutNumber, title, lengthSeconds, group });
  }

  if (cuts.length === 0) warnings.push("No cut rows were found in this report.");
  return { cuts, warnings };
}

// 0-based [start, end) offsets, measured against the Groups report's header
// ("   GROUP NAME      GROUP DESCRITION" — the typo is DAD's own).
const GROUP_NAME_COL = [3, 19] as const;
const GROUP_DESCRIPTION_COL_START = 19;

/**
 * Parses the companion Groups report into name/description pairs. A group
 * row is identified the same structural way as a cut row: non-blank text at
 * the name column that isn't the report's own banner/header/rule lines.
 */
export function parseDadGroups(text: string): DadGroup[] {
  const groups: DadGroup[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  for (const line of lines) {
    const name = line.slice(GROUP_NAME_COL[0], GROUP_NAME_COL[1]).trim();
    if (name === "" || name === "GROUP NAME" || /^-+$/.test(name)) continue;
    if (/^DAD GROUPS DATABASE|^Date:|^Page:/.test(line.trim())) continue;
    const description = line.slice(GROUP_DESCRIPTION_COL_START).trim();
    groups.push({ name, description });
  }

  return groups;
}

// Pure, format-agnostic air-date extraction. Kept deterministic rather than
// handed to the model along with everything else: the title row's pattern
// ("Friday 8/21/2026 WUWF-FM Program Log") is simple, consistent, and low
// risk to get right with a plain regex, unlike the free-text credit
// judgment this import's AI step exists for — no reason to trade a reliable
// pattern match for a model's read of the same fixed phrase. Runs on
// whatever plain text a format's extractor produced (docx or PDF alike),
// since the title row's wording survives either extraction path.

const TITLE_RE = /(\w+)[\s ]+(\d{1,2})\/(\d{1,2})\/(\d{4})[\s ]+WUWF-FM[\s ]+Program[\s ]+Log/;

const WEEKDAY_BY_UTC_DAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface AirDateResult {
  airDate: string | null;
  weekday: string | null;
  warnings: string[];
}

/**
 * Finds the export's own title row in extracted plain text. Absent
 * `airDate` (no title row found at all) is reported as a warning by the
 * caller, same as the old parser did — this function only warns about a
 * date/weekday mismatch, since that's the one thing worth flagging here
 * rather than downstream.
 */
export function deriveAirDate(text: string): AirDateResult {
  const match = TITLE_RE.exec(text);
  if (!match) return { airDate: null, weekday: null, warnings: [] };

  const weekday = match[1]!;
  const [month, day, year] = [match[2]!, match[3]!, match[4]!];
  const airDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const printedDay = WEEKDAY_BY_UTC_DAY[new Date(`${airDate}T00:00:00Z`).getUTCDay()];
  const warnings =
    printedDay !== weekday
      ? [`The log's printed weekday ("${weekday}") doesn't match its date (${airDate} is a ${printedDay}).`]
      : [];

  return { airDate, weekday, warnings };
}

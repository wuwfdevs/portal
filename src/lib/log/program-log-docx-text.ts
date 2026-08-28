// Pure, dependency-free plain-text extraction from a DAD/traffic-system
// Word export's `word/document.xml` — the docx half of the program-log
// import's text-extraction step (see program-log-pdf-text.ts for the PDF
// half). Deliberately does none of the row classification the old
// program-log-import.ts parser used to do (avail/credit/note/row, script
// gluing across page breaks) — that judgment now belongs to the model in
// program-log-ai-parse.ts, working from this plain text plus the PDF
// extractor's plain text, through the same schema either way. This module's
// only job is getting the characters out of the container format
// faithfully, which stays a deterministic, low-risk operation regardless of
// who reads the result afterward.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity] ?? entity);
}

/**
 * One table cell's visible text. Paragraphs and explicit line breaks join
 * with a space — a script cell wraps across many runs and breaks, and
 * joining with "" glues the last word of one line to the first of the next.
 *
 * A `<w:br/>`/`<w:tab/>` is replaced with a synthetic `<w:t> </w:t>`, not a
 * bare space — the run-extraction regex just below only ever collects text
 * sitting inside a `<w:t>` element, so a bare space landing outside one
 * (still wrapped in its own now-empty `<w:r>...</w:r>`) is invisible to it
 * and silently dropped. That exact bug shipped once already (glued words
 * like "remainedlocally", "since1995" across a mid-script line break) and
 * went uncaught because nothing had asserted on a script's literal text
 * before this module's own tests did.
 */
function cellText(cellXml: string): string {
  const withBreaks = cellXml
    .replace(/<w:(?:br|cr)\s*\/>/g, "<w:t> </w:t>")
    .replace(/<w:tab\s*\/>/g, "<w:t> </w:t>");
  const paragraphs = withBreaks.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>|<w:p\b[^>]*\/>/g) ?? [withBreaks];
  const texts = paragraphs.map((paragraph) => {
    const runs = paragraph.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) ?? [];
    return runs.map((run) => decodeEntities(run.replace(/^<w:t(?:\s[^>]*)?>|<\/w:t>$/g, ""))).join("");
  });
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Every table's rows, each rendered as one line of pipe-joined cell text, in
 * document order — a plain-text stand-in for the print-layout table DAD
 * exports (Time | Cart # | Description | Length), preserved well enough for
 * a model to read the same columns a human reviewing the printout would.
 * Row order across page-table boundaries is document order, same as the old
 * parser relied on for stitching a script that lands on the next printed
 * page.
 */
export function extractDocxPlainText(documentXml: string): string {
  const lines: string[] = [];
  for (const table of documentXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []) {
    for (const row of table.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) ?? []) {
      const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(cellText).filter((cell) => cell !== "");
      if (cells.length > 0) lines.push(cells.join(" | "));
    }
  }
  return lines.join("\n");
}

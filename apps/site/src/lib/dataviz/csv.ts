// A small RFC 4180 reader: quoted fields, doubled quotes, commas or tabs or semicolons, CRLF or LF, a leading byte-order mark.
// Pure. It returns raw strings; `parse.ts` decides what each column is.

export type CsvResult = { ok: true; records: string[][] } | { ok: false; reason: string }

const DELIMITERS = [',', '\t', ';'] as const

/** The delimiter that splits the header line into the most fields (outside quotes). Comma wins a tie. */
export function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? ''
  let best = ','
  let bestCount = 0
  for (const d of DELIMITERS) {
    let count = 0
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === d && !quoted) count++
    }
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

export function parseCsv(input: string): CsvResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const delimiter = sniffDelimiter(text)
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false
  let fieldWasQuoted = false

  const endField = () => {
    record.push(field)
    field = ''
    fieldWasQuoted = false
  }
  const endRecord = () => {
    endField()
    // A line with nothing on it is not a record.
    if (!(record.length === 1 && record[0] === '' && !fieldWasQuoted)) records.push(record)
    record = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') {
      quoted = true
      fieldWasQuoted = true
    } else if (ch === delimiter) endField()
    else if (ch === '\n') endRecord()
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++
      endRecord()
    } else field += ch
  }
  if (quoted) return { ok: false, reason: 'A quoted value is never closed. Check for a stray quotation mark.' }
  if (field !== '' || record.length > 0) endRecord()
  return { ok: true, records }
}

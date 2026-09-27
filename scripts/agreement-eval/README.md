# Agreement reader eval

Runs signed WUWF underwriting agreements and insertion orders through the
live model call behind "Read the schedule from the agreement"
(`lib/underwriting/agreement-ai-import.ts`) and compares each proposal, line
for line, to the hand-read transcription of the same order in
`src/lib/underwriting/fixtures/insertion-orders.ts` — the acceptance corpus
the traffic redesign was checked against (`docs/underwriting-traffic-
redesign.md` §2, §9.5). This is how the reader's quality is measured: the
schedule step's own parser and reconciliation check a reading's arithmetic,
but only a person's transcription says whether the model read the document
right, and that transcription already exists.

```
npm run eval:agreement
```

Needs `OPENAI_API_KEY` in the environment or `.env.local`. No database: the
pools and programs the schema offers as closed sets are the names on file
in production, listed in `fixtures/index.ts`. Without the key the suite
skips. It is not part of `npm test`: it takes minutes and costs API calls.

- `fixtures/` — the documents, added by hand. `fixtures/index.ts` says which
  file is which corpus order and names the Drive document it should be
  (WUWF's sponsorship-agreements folder). A file that isn't there is
  skipped; the suite says so when none are.
- `actual/` — every run writes each document's raw model answer and its
  digest here (gitignored), for review.

The digest per line is the rule (`entry_spec`), eligible days, pool,
program, time mode and times, per-day cap, service level, dates, and the
order's own printed count; labels and the verbatim `source_text` are free
text and left out. Only the fixture's active lines are expected — a
cancelled line (the Symphony's replaced gala) can't be read from the
document as cancelled, so if the model lists it the diff shows it and the
reviewer decides. Order facts compared: total spots, affidavits, agency
makegood approval, and the separation text verbatim.

A diff is not automatically a model failure: the corpus transcriptions
carry judgment calls (a pool name for a daypart the order prints
differently, a preferred vs. exact time). Read the document before deciding
which side is right; if the corpus is wrong, fix the fixture.

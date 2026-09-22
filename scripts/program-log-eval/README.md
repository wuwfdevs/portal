# Program-log importer eval

Runs real traffic-system exports through the importer's live model call and
compares the resulting plan to a reviewed one. This is how the importer's
quality is measured: it has no verification layer of its own (see
`docs/log-design.md` §8, 2026-09-22 revision), so a model version change, a
prompt edit, or a new station's export shows up here as a diff.

```
npm run eval:program-log
```

Needs, in the environment or `.env.local`: `OPENAI_API_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SECRET_KEY` (the lookups — schedule,
underwriters, copy, content library — are read from that database, read-only;
point it at preview or production, since the plan's program and copy matching
depends on what is on file). Without them the suite skips. It is not part of
`npm test`: it takes minutes and costs API calls.

- `fixtures/` — real exports as PDF, named by air date. Add a new one here.
- `actual/` — every run writes each fixture's plan digest here (gitignored),
  for review.
- `expected/` — reviewed digests. A fixture with no expected file passes and
  says so; once you have read its `actual/` digest and it is right, record it
  with `PROGRAM_LOG_EVAL_WRITE=1 npm run eval:program-log` and commit it.
  After a deliberate prompt or model change that improves a plan, re-record
  the same way.

The digest leaves out database ids (they differ per project) and
whitespace-normalizes scripts; everything else — which programs, which
breaks, what sits in each, and the copy the day would create or reuse — is
compared exactly.

# Remote Interview — Phase 3 prototype (throwaway)

**This is not product code.** It exists to answer two questions from
`docs/remote-interview-technical-assessment.md` before any real implementation
starts, and it is safe to delete or rewrite wholesale once those questions are
answered. It has its own `package.json` and is not wired into the portal app —
`npm install` at the repo root does not touch it, and vice versa.

## What this validates

1. **Chunked WAV assembly**: can audio recorded in ~5s slices via
   `extendable-media-recorder` be concatenated server-side into a single WAV
   file that ffmpeg/ffprobe consider valid, with correct duration, sample
   rate, and actual (non-silent) audio content?
2. **OPFS durability**: does a chunk written to the Origin Private File
   System survive a page reload before it's been acknowledged by the server,
   and does the resume-on-load logic drain it without losing or duplicating
   audio?

## What this does **not** validate

No Daily.co integration, no live two-person call, no real network flakiness
(the reload scenario is a deterministic stand-in for a crash, not a flaky-network
simulation), no cross-machine clock alignment, no Supabase Storage (chunks and
the assembled master land on local disk under `data/`). All deferred to a later
pass — see `docs/remote-interview-design.md` and
`docs/remote-interview-technical-assessment.md` for why.

Also out of scope for automation: actually opening the assembled file in Adobe
Audition. That's a step only a human with that software can do — the test
driver prints the absolute path to the file so you can pull it out and check.

## Running it

```bash
cd prototype/remote-interview-poc
npm install
npm run test:e2e
```

This launches headless Chromium (via Playwright, using this container's
pre-installed browser) with a synthetic fake audio device — no real microphone
needed — drives both scenarios above end to end, and prints PASS/FAIL with the
numeric checks each scenario made, plus the path to the final assembled
`master.wav` file for each.

`npm run typecheck` runs `tsc` over the client/server/shared code and, in a
second pass, over the OPFS worker (which needs the `webworker` lib instead of
`dom`, hence the separate `tsconfig.worker.json` — TypeScript's `dom` and
`webworker` lib files declare conflicting globals and can't be combined in one
project).

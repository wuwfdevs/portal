# CLAUDE.md

Workspace rules for the WUWF repository. Each app has its own `CLAUDE.md` with its own rules;
read the one for the app you are changing before editing it.

## Layout

```
apps/portal                 WUWF Tools Portal (tools.wuwf.org) — internal staff tools. See apps/portal/CLAUDE.md
apps/site                   WUWF.org — the public site and its CMS (Payload on Next.js). See apps/site/CLAUDE.md
packages/design-tokens      WUWF Design System tokens, CSS-variable generation, contrast helpers
packages/listening-core     audience-listening rules shared by both apps (ported from the Portal)
packages/portal-contracts   the signed contracts between the two apps (identity token, request signing, messages)
.github/                    repo-wide: the PR template and the PR title/description check
scripts/                    repo-wide: check-pr-text.mjs and its test
```

This is a pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

Starting work on the site? Read `apps/site/ROADMAP.md` first: it holds the current state, the order of work,
and the mistakes already made. `apps/site/README.md`, `ARCHITECTURE.md` and `ANALYTICS.md` sit beside it.

**Every project has its own `pnpm-lock.yaml`** (`sharedWorkspaceLockfile: false`). Do not switch to one
shared lockfile. With one, pnpm resolved the Portal's optional peers from the site's packages (esbuild,
sass, tsx, `@playwright/test`), which changed how the Portal's own tests were transpiled and broke six
of them, with no resolved version changing. Separate lockfiles are what keep "the apps share no
dependencies" true. Never run `pnpm install` with a different lockfile setting, and check the Portal's
`pnpm test` after any change to `pnpm-workspace.yaml`.

## Rules

- **Apps are separate.** Each app has its own Supabase project, migrations, dependencies, rules and
  Vercel project. They never share a database or a deployment, and never read each other's tables.
- **Packages are pure TypeScript.** No framework imports, no Supabase client, no React. If something
  needs React or Next it belongs in an app. Each package carries its own tests.
- **Apps do not import from each other.** Shared code goes in a package; the only thing that crosses
  between apps at runtime is a documented, versioned, signed contract.
- **The Portal is CMS-agnostic.** It knows nothing of Payload or any other CMS, and the site is one
  consumer among possible others. The only things between them are the versioned, signed contracts
  in `packages/portal-contracts`. A change that makes the Portal import, query or name the site's
  CMS is wrong.
- **Do not change one app's dependencies to suit another.** Versions are per app; do not hoist.
- **Build rules are per app.** The Portal's lint/test rules (design tokens, UI primitives, migration
  ledger, Resources release notes) apply to `apps/portal` only.
- **Every pull request gets a written title and description** — see "Rules for making changes" in
  `apps/portal/CLAUDE.md`; `.github/workflows/pr-text.yml` enforces the shape for the whole repo.

## Commands

Run from the repository root, or from inside an app directory (`pnpm test`, `pnpm lint`, …).

```
pnpm install                                  install every workspace package (frozen in CI)
pnpm --filter wuwf-tools-portal <script>      run a Portal script from the root
pnpm dev:portal | build:portal | lint:portal | typecheck:portal | test:portal | db:check:portal
pnpm test:pr-text                             the PR-text check's own tests
```

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`: the Portal's `lint`,
`typecheck`, `test` and `db:check`, and each package's `typecheck` and `test`. It installs one project at
a time from that project's own lockfile (never a workspace-wide install; see the lockfile note above).
It does not cover `apps/site`. A red CI is a
real failure to fix, not noise to skip: the Portal's lint had one stale error that the workflow's first
run would otherwise have hit, and was fixed with a stated reason rather than left to fail.

`.github/workflows/fresh-install.yml` is separate: it builds an empty database from the migrations, as a new
station would, clears WUWF's data with `apps/portal/supabase/install/clear-seed-data-for-new-station.sql` and
checks the result. It runs when the migrations or install files change, or by hand, in a disposable local
database with no credentials for any hosted project. That script is never run against WUWF's databases and
refuses to run against any database that has an account or a named station.

## Things that live outside the repository

- **Vercel:** each app is its own Vercel project. The Portal's project must have its **Root Directory
  set to `apps/portal`** (a dashboard setting; nothing in the repository can change it).
- **Project-scoped MCP servers** are read from `.mcp.json`. The Portal's (AssemblyAI docs) is at
  `apps/portal/.mcp.json`, so it applies when Claude Code is started from `apps/portal`.

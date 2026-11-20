#!/usr/bin/env bash
# The Vercel build for this app. Production runs only committed migrations (src/migrations), so the schema has to be
# brought up to date before the site is built (the build reads the database). Migrating on every build is right for
# PREVIEW deployments, which share the staging database; it is switched on there only, by MIGRATE_ON_BUILD=1.
# A production deployment never migrates by itself: apply its migrations deliberately, then deploy.
#
# DATABASE_MIGRATION_URL (a session-mode connection) is used for the migration when set; the running site uses the
# pooled DATABASE_URL.
set -euo pipefail

if [ "${MIGRATE_ON_BUILD:-}" = "1" ]; then
  echo "Applying committed migrations (MIGRATE_ON_BUILD=1)"
  DATABASE_URL="${DATABASE_MIGRATION_URL:-$DATABASE_URL}" pnpm payload migrate
else
  echo "Not migrating (MIGRATE_ON_BUILD is not 1)"
fi

# ONE-OFF (2026-11-20, at the owner's request): demonstration content on STAGING for the top units, the story zones, the site banner and the home page of blocks
# (`scripts/staging-demo/seed-sponsor-zones-core.ts`). It runs only in a preview build (MIGRATE_ON_BUILD=1), only while the marker file exists, with the site's own staging
# database and storage settings; the script refuses any database that is not staging, is safe to run twice, and a failure does not fail the build. REMOVE this step and the
# marker file once a preview build has run it (git history keeps them).
if [ "${MIGRATE_ON_BUILD:-}" = "1" ] && [ -f scripts/staging-demo/.seed-sponsor-zones-once ]; then
  echo "Seeding the sponsor-zone demonstration on staging (one-off)"
  pnpm exec tsx --tsconfig tsconfig.json scripts/staging-demo/seed-sponsor-zones.ts --go || echo "The demonstration seed failed; the build goes on."
fi

pnpm build

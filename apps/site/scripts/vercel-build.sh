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

# One-off seeding of the shared staging database, for as long as `scripts/placements/SEED_ON_BUILD` exists, on previews only (the same switch as the
# migration above). It fills an empty home page and an empty sponsor rail and never overwrites an editor's entries. A failure is reported and does
# not stop the build: the site works without it, and the next build tries again.
if [ "${MIGRATE_ON_BUILD:-}" = "1" ] && [ -f scripts/placements/SEED_ON_BUILD ]; then
  echo "Seeding staging (scripts/placements/SEED_ON_BUILD)"
  NODE_ENV=production pnpm exec tsx scripts/placements/seed-staging.ts || echo "Seeding failed; continuing without it"
fi

pnpm build

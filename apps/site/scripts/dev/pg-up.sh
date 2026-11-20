#!/usr/bin/env bash
# Brings the local Postgres up in the cloud sandbox, from whatever state it is in. Safe to run any number of times.
#
#   bash scripts/dev/pg-up.sh
#
# Why this exists: the sandbox has no Docker, so `pnpm db:up` (docker-compose.yml, the normal way) does not work there, and the Postgres this makes stops
# whenever the sandbox idles or its worker restarts. The data directory survives; the process does not. So: run this first, and again after any restart.
# A missing database shows up as `ECONNREFUSED` from `pnpm build` and as every integration test failing in setup, not as a failure of the thing you changed.
#
# It: installs pgvector if it is missing (the migrations run CREATE EXTENSION vector); makes the data directory once; removes a stale postmaster.pid
# left by a killed server; starts Postgres on 127.0.0.1:5433 (trust auth, role `wuwf`); and makes three databases, each with the vector extension:
#   wuwf_site      the dev server's database. Payload pushes schema changes to it (the docs: "treat your local dev database as a sandbox").
#   wuwf_site_test the integration tests' database (vitest.setup.ts), built from the config.
#   wuwf_migrate   for running the committed migrations: `DATABASE_URL=postgresql://wuwf@127.0.0.1:5433/wuwf_migrate pnpm payload migrate`
# Never run `payload migrate` against wuwf_site once the dev server has used it: push and migrations are not meant to be mixed, and Payload stops and asks.
# (`pnpm verify:migrations` makes its own scratch database and needs none of this.)
set -euo pipefail

D=${WUWF_PG_DIR:-/var/tmp/wuwf-site-pg}
PGBIN=/usr/lib/postgresql/16/bin
PORT=5433

if [ "$(id -u)" != 0 ]; then echo "Run as root (the sandbox's default): postgres will not start as root, so this uses su postgres." >&2; exit 2; fi
[ -x "$PGBIN/pg_ctl" ] || { echo "Postgres 16 is not installed at $PGBIN." >&2; exit 2; }

if [ ! -f /usr/share/postgresql/16/extension/vector.control ]; then
  echo "Installing pgvector..."
  apt-get update -qq >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16-pgvector >/dev/null
fi

if [ ! -f "$D/PG_VERSION" ]; then
  echo "Creating the data directory $D..."
  mkdir -p "$D" && chown postgres:postgres "$D"
  su postgres -c "$PGBIN/initdb -D $D -U wuwf --auth=trust -E UTF8 >/dev/null"
  printf "port = %s\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '/var/tmp'\n" "$PORT" > "$D/postgresql.auto.conf"
  chown postgres:postgres "$D/postgresql.auto.conf"
fi

if ! "$PGBIN/pg_isready" -q -h 127.0.0.1 -p "$PORT"; then
  # A killed server leaves its pid file and its socket and lock file (in /var/tmp) behind, and the next start refuses on either. Nothing is listening, so they are stale.
  rm -f "$D/postmaster.pid" "/var/tmp/.s.PGSQL.$PORT" "/var/tmp/.s.PGSQL.$PORT.lock"
  su postgres -c "$PGBIN/pg_ctl -D $D -l $D/log.txt -w start >/dev/null"
fi

psql_q() { PGOPTIONS="-c client_min_messages=warning" "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U wuwf -qtA "$@"; }
for db in wuwf_site wuwf_site_test wuwf_migrate; do
  [ "$(psql_q -d postgres -c "select 1 from pg_database where datname='$db'")" = 1 ] || psql_q -d postgres -c "create database $db" >/dev/null
  psql_q -d "$db" -c "create extension if not exists vector" >/dev/null
done
echo "Postgres is up on 127.0.0.1:$PORT (data in $D): wuwf_site, wuwf_site_test, wuwf_migrate."

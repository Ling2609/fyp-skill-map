#!/bin/bash
# Runs once, the first time the database container starts with an empty data volume (docker-entrypoint-initdb.d).
# Restores docker/db/skillmap.dump (made with pg_dump -Fc, README "Run with Docker") so the demo has its jobs,
# programmes, modules and test accounts. Without the file the database is left empty and the API makes the tables.
set -e
if [ -f /dump/skillmap.dump ]; then
  echo "Restoring /dump/skillmap.dump into $POSTGRES_DB ..."
  pg_restore --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" /dump/skillmap.dump
  echo "Restore finished."
else
  echo "No docker/db/skillmap.dump found: starting with an empty database (see README, Run with Docker)."
fi

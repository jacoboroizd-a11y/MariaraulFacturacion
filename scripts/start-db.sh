#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if docker container inspect mariaraul-postgres >/dev/null 2>&1; then
  docker start mariaraul-postgres >/dev/null
else
  docker compose up -d db
fi
for attempt in {1..30}; do
  if docker exec mariaraul-postgres pg_isready -U mariaraul -d mariaraul >/dev/null; then
    # Cloud snapshots retain files, but a Docker database/process may need restoration.
    if [ -s /workspace/.cloud/mariaraul.dump ] && [ "$(docker exec mariaraul-postgres psql -U mariaraul -d mariaraul -Atc "SELECT to_regclass('public.\"Company\"')")" = "" ]; then
      docker cp /workspace/.cloud/mariaraul.dump mariaraul-postgres:/tmp/mariaraul-restore.dump
      docker exec mariaraul-postgres pg_restore -U mariaraul -d mariaraul --no-owner --no-privileges /tmp/mariaraul-restore.dump
      docker exec mariaraul-postgres rm /tmp/mariaraul-restore.dump
    fi
    exit 0
  fi
  sleep 1
done
echo 'PostgreSQL no está listo. Revisa docker logs mariaraul-postgres.' >&2
exit 1

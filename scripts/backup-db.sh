#!/usr/bin/env bash
set -euo pipefail
mkdir -p /workspace/.cloud
umask 077
dump_file="$(docker exec mariaraul-postgres mktemp /tmp/mariaraul-backup.XXXXXX)"
trap 'docker exec mariaraul-postgres rm -f "$dump_file" >/dev/null' EXIT
docker exec mariaraul-postgres pg_dump -U mariaraul -d mariaraul --format=custom -f "$dump_file"
docker exec mariaraul-postgres pg_restore --list "$dump_file" >/dev/null
docker cp "mariaraul-postgres:$dump_file" /workspace/.cloud/mariaraul.dump.new
chmod 600 /workspace/.cloud/mariaraul.dump.new
mv /workspace/.cloud/mariaraul.dump.new /workspace/.cloud/mariaraul.dump

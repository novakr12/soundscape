#!/usr/bin/env bash
set -euo pipefail

archive="$(realpath "${1:?Usage: scripts/restore.sh <backup.tar.gz>}")"
cd "$(dirname "$0")/.."

compose() { docker compose -f docker-compose.yml "$@"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"; compose start postgres app > /dev/null 2>&1 || true' EXIT
tar -xzf "$archive" -C "$work"
if [ ! -f "$work/postgres/soundscape.dump" ]; then
  echo "$(basename "$archive") was made before Soundscape moved to PostgreSQL. Restore it with scripts/restore.sh from that version."
  exit 1
fi

read -r -p "This replaces all Soundscape data with $(basename "$archive"). Type 'restore' to continue: " answer
[ "$answer" = restore ] || { echo "Cancelled."; exit 1; }

echo "Stopping the app"
compose stop app

echo "PostgreSQL: loading the dump"
compose exec -T postgres psql -q -U soundscape -d postgres -c "DROP DATABASE IF EXISTS soundscape WITH (FORCE)" -c "CREATE DATABASE soundscape"
compose exec -T postgres pg_restore -U soundscape -d soundscape --no-owner --exit-on-error < "$work/postgres/soundscape.dump"

echo "Restore finished."

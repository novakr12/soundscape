#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/soundscape-backups}"
KEEP="${KEEP:-14}"

compose() { docker compose -f docker-compose.yml "$@"; }

stamp="$(date +%Y-%m-%d_%H%M%S)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$BACKUP_DIR" "$work/postgres"

echo "PostgreSQL: dumping the database"
compose exec -T postgres pg_dump -U soundscape -d soundscape --format=custom > "$work/postgres/soundscape.dump"

archive="$BACKUP_DIR/soundscape-$stamp.tar.gz"
tar -czf "$archive" -C "$work" postgres
ls -1t "$BACKUP_DIR"/soundscape-*.tar.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --
last="$(date -u +%Y-%m-%dT%H:%M:%SZ)|$(basename "$archive")|$(du -h "$archive" | cut -f1)"
compose exec -T postgres psql -q -U soundscape -d soundscape -c \
  "INSERT INTO kv (key, value) VALUES ('backup:last', to_jsonb('$last'::text)) ON CONFLICT (key) DO UPDATE SET value = excluded.value" \
  > /dev/null || true
echo "Backup written to $archive ($(du -h "$archive" | cut -f1))"

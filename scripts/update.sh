#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
compose() { docker compose -f docker-compose.yml -f compose.prod.yml "$@"; }

echo "Getting the latest code"
git pull --ff-only

echo "Building and restarting"
compose up -d --build --remove-orphans

echo "Waiting for Soundscape to answer"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3000/health; then
    docker image prune -f > /dev/null
    echo "Soundscape is up to date and running ($(git log -1 --format='%h %s'))"
    exit 0
  fi
  sleep 3
done

echo "Soundscape did not come up in 3 minutes. Recent log lines:"
compose logs --tail 40 app
exit 1

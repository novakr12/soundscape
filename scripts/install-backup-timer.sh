#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
units="$HOME/.config/systemd/user"
mkdir -p "$units"

cat > "$units/soundscape-backup.service" <<UNIT
[Unit]
Description=Back up the Soundscape databases

[Service]
Type=oneshot
Environment="BACKUP_DIR=${BACKUP_DIR:-$HOME/soundscape-backups}"
ExecStart="$repo/scripts/backup.sh"
UNIT

cat > "$units/soundscape-backup.timer" <<UNIT
[Unit]
Description=Back up Soundscape every night

[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now soundscape-backup.timer
loginctl enable-linger "$USER"
systemctl --user list-timers soundscape-backup.timer

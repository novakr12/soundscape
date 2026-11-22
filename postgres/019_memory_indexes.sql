CREATE INDEX IF NOT EXISTS cover_cache_expires ON cover_cache (expires_at);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS player_devices_seen ON player_devices (seen_at);
CREATE INDEX IF NOT EXISTS player_commands_created ON player_commands (created_at);
CREATE INDEX IF NOT EXISTS parties_ended ON parties (ended_at) WHERE ended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS invites_expires ON invites (expires_at) WHERE used_by IS NULL;

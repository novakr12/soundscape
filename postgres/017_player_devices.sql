CREATE TABLE player_devices (
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  device_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  state jsonb NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE player_commands (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  device_id text NOT NULL,
  command jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX player_commands_device ON player_commands (user_id, device_id, id);

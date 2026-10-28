CREATE TABLE listening (
  user_id text PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE kv (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  expires_at timestamptz
);

CREATE INDEX kv_expires ON kv (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE cover_cache (
  track_id text PRIMARY KEY,
  type text NOT NULL,
  data bytea NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE relay_queue (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  body jsonb NOT NULL
);

CREATE INDEX relay_queue_user ON relay_queue (user_id);

CREATE TABLE lastfm_scrobbling (
  user_id text PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  lastfm_user text NOT NULL,
  session_key text NOT NULL,
  needs_reconnect boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lastfm_queue (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  artist text NOT NULL,
  title text NOT NULL,
  album text,
  played_at timestamptz NOT NULL,
  duration_s integer
);

CREATE INDEX lastfm_queue_user ON lastfm_queue (user_id, id);

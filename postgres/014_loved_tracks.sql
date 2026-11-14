CREATE TABLE loved_tracks (
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES tracks ON DELETE CASCADE,
  loved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX loved_tracks_recent ON loved_tracks (user_id, loved_at DESC);

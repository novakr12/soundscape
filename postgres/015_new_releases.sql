ALTER TABLE artists ADD COLUMN releases_checked_at timestamptz;

CREATE TABLE new_releases (
  mbid text PRIMARY KEY,
  artist_id text NOT NULL REFERENCES artists ON UPDATE CASCADE ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL,
  released date NOT NULL,
  found_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX new_releases_artist ON new_releases (artist_id, released DESC);

ALTER TABLE notifications ADD COLUMN detail text;

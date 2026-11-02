CREATE TABLE track_aliases (
  alias text PRIMARY KEY,
  track_id text NOT NULL REFERENCES tracks ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX track_aliases_track ON track_aliases (track_id);

CREATE TABLE artist_aliases (
  alias text PRIMARY KEY,
  artist_id text NOT NULL REFERENCES artists ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX artist_aliases_artist ON artist_aliases (artist_id);

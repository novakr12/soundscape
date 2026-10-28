CREATE TABLE users (
  username text PRIMARY KEY,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  password_changed_at timestamptz,
  is_private boolean NOT NULL DEFAULT false
);

CREATE TABLE artists (
  id text PRIMARY KEY,
  name text NOT NULL,
  mbid text,
  genres_checked_at timestamptz
);

CREATE TABLE artist_genres (
  artist_id text NOT NULL REFERENCES artists ON UPDATE CASCADE ON DELETE CASCADE,
  genre text NOT NULL,
  PRIMARY KEY (artist_id, genre)
);

CREATE INDEX artist_genres_genre ON artist_genres (genre);

CREATE TABLE albums (
  id text PRIMARY KEY,
  title text NOT NULL,
  artist_id text NOT NULL REFERENCES artists ON UPDATE CASCADE ON DELETE CASCADE,
  deezer_album_id bigint,
  tracklist jsonb,
  tracklist_checked_at timestamptz
);

CREATE INDEX albums_artist ON albums (artist_id);

CREATE TABLE tracks (
  id text PRIMARY KEY,
  title text NOT NULL,
  artist_id text NOT NULL REFERENCES artists ON UPDATE CASCADE ON DELETE CASCADE,
  album_id text REFERENCES albums ON UPDATE CASCADE ON DELETE SET NULL,
  album_source text CHECK (album_source IN ('listen', 'deezer')),
  track_number integer,
  duration_ms integer,
  mbid text,
  cover text,
  deezer_id bigint,
  deezer_missing boolean NOT NULL DEFAULT false,
  deezer_album_missing boolean NOT NULL DEFAULT false,
  navidrome_cover text,
  navidrome_user text,
  navidrome_checked_at timestamptz,
  cover_art_checked_at timestamptz
);

CREATE INDEX tracks_artist ON tracks (artist_id);
CREATE INDEX tracks_album ON tracks (album_id);

CREATE TABLE plays (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES tracks ON UPDATE CASCADE,
  played_at timestamptz NOT NULL
);

CREATE INDEX plays_user_time ON plays (user_id, played_at DESC);
CREATE INDEX plays_track_time ON plays (track_id, played_at);
CREATE INDEX plays_time ON plays (played_at);

CREATE TABLE user_track_plays (
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES tracks ON UPDATE CASCADE ON DELETE CASCADE,
  plays integer NOT NULL CHECK (plays > 0),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX user_track_plays_track ON user_track_plays (track_id);

CREATE FUNCTION count_play(play_user text, play_track text, delta integer) RETURNS void AS $$
BEGIN
  IF delta > 0 THEN
    INSERT INTO user_track_plays (user_id, track_id, plays)
    VALUES (play_user, play_track, delta)
    ON CONFLICT (user_id, track_id) DO UPDATE SET plays = user_track_plays.plays + delta;
  ELSE
    DELETE FROM user_track_plays
    WHERE user_id = play_user AND track_id = play_track AND plays + delta <= 0;
    UPDATE user_track_plays SET plays = plays + delta
    WHERE user_id = play_user AND track_id = play_track;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION plays_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM count_play(OLD.user_id, OLD.track_id, -1);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM count_play(NEW.user_id, NEW.track_id, 1);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plays_counted
  AFTER INSERT OR DELETE OR UPDATE OF user_id, track_id ON plays
  FOR EACH ROW EXECUTE FUNCTION plays_changed();

CREATE TABLE follows (
  follower text NOT NULL REFERENCES users ON DELETE CASCADE,
  followee text NOT NULL REFERENCES users ON DELETE CASCADE,
  since timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower, followee),
  CHECK (follower <> followee)
);

CREATE INDEX follows_followee ON follows (followee);

CREATE TABLE api_tokens (
  token text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invites (
  code text PRIMARY KEY,
  created_by text NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_by text
);

CREATE TABLE import_state (
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  source text NOT NULL,
  external_user text NOT NULL,
  listened_up_to timestamptz NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source)
);

CREATE TABLE wanted (
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  track_id text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE TABLE relay_settings (
  user_id text PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  listenbrainz_token text NOT NULL,
  listenbrainz_user text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE navidrome_settings (
  user_id text PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  server_url text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jellyfin_settings (
  user_id text PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  server_url text NOT NULL,
  api_key text NOT NULL,
  jellyfin_user text,
  jellyfin_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

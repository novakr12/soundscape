ALTER TABLE artists
  ADD COLUMN photo text,
  ADD COLUMN deezer_artist_id bigint,
  ADD COLUMN photo_checked_at timestamptz;

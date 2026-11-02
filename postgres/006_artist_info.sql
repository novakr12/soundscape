ALTER TABLE artists
  ADD COLUMN artist_type text,
  ADD COLUMN area text,
  ADD COLUMN began text,
  ADD COLUMN ended text,
  ADD COLUMN has_ended boolean NOT NULL DEFAULT false,
  ADD COLUMN bio text,
  ADD COLUMN bio_url text,
  ADD COLUMN links jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN info_checked_at timestamptz;

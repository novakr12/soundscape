CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE FUNCTION search_vector(text) RETURNS tsvector AS $$
  SELECT to_tsvector('simple', public.unaccent('public.unaccent'::regdictionary, coalesce($1, '')))
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE FUNCTION search_query(text) RETURNS tsquery AS $$
  SELECT to_tsquery('simple', public.unaccent('public.unaccent'::regdictionary, $1))
$$ LANGUAGE sql STABLE PARALLEL SAFE;

CREATE INDEX artists_search ON artists USING gin (search_vector(name));
CREATE INDEX tracks_search ON tracks USING gin (search_vector(title));
CREATE INDEX albums_search ON albums USING gin (search_vector(title));

ALTER TABLE tracks ADD COLUMN cover_art_release_group text;
CREATE INDEX tracks_navidrome_user ON tracks (navidrome_user) WHERE navidrome_user IS NOT NULL;

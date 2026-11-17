CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE FUNCTION fuzzy_text(text) RETURNS text AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce($1, '')))
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE INDEX artists_fuzzy ON artists USING gin (fuzzy_text(name) gin_trgm_ops);
CREATE INDEX tracks_fuzzy ON tracks USING gin (fuzzy_text(title) gin_trgm_ops);
CREATE INDEX albums_fuzzy ON albums USING gin (fuzzy_text(title) gin_trgm_ops);

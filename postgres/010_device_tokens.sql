ALTER TABLE api_tokens DROP CONSTRAINT api_tokens_user_id_key;
ALTER TABLE api_tokens ADD COLUMN id bigserial;
ALTER TABLE api_tokens ADD COLUMN name text NOT NULL DEFAULT 'Main token';
ALTER TABLE api_tokens ADD COLUMN hint text NOT NULL DEFAULT '';
ALTER TABLE api_tokens ADD COLUMN last_used_at timestamptz;
ALTER TABLE api_tokens ADD COLUMN last_used_by text;

UPDATE api_tokens SET hint = right(token, 4), token = encode(sha256(convert_to(token, 'UTF8')), 'hex');

ALTER TABLE api_tokens ALTER COLUMN name DROP DEFAULT;
ALTER TABLE api_tokens ALTER COLUMN hint DROP DEFAULT;
ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_id_key UNIQUE (id);
CREATE INDEX api_tokens_user ON api_tokens (user_id);

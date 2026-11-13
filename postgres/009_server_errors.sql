CREATE TABLE server_errors (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  message text NOT NULL,
  stack text,
  digest text
);

CREATE INDEX server_errors_at ON server_errors (at DESC);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  kind text NOT NULL,
  other_user text REFERENCES users ON DELETE CASCADE,
  count bigint,
  dedupe text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (user_id, dedupe)
);

CREATE INDEX notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_other ON notifications (other_user);

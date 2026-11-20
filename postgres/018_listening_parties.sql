CREATE TABLE parties (
  id text PRIMARY KEY,
  host_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  device_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  track_id text,
  playing boolean NOT NULL DEFAULT false,
  position double precision NOT NULL DEFAULT 0,
  position_at timestamptz NOT NULL DEFAULT now(),
  songs text[] NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX parties_one_per_host ON parties (host_id) WHERE ended_at IS NULL;

CREATE TABLE party_members (
  party_id text NOT NULL REFERENCES parties ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  device_id text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  sent_track text,
  sent_playing boolean,
  sent_at timestamptz,
  PRIMARY KEY (party_id, user_id)
);

CREATE INDEX party_members_user ON party_members (user_id) WHERE left_at IS NULL;

CREATE TABLE party_adds (
  id bigserial PRIMARY KEY,
  party_id text NOT NULL REFERENCES parties ON DELETE CASCADE,
  track_id text NOT NULL,
  user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX party_adds_party ON party_adds (party_id, added_at);

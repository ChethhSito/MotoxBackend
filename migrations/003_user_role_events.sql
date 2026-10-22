CREATE TABLE user_role_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_uid text NOT NULL REFERENCES users(uid),
  actor_uid text NOT NULL REFERENCES users(uid),
  previous_role text NOT NULL,
  next_role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_role_events_target_idx ON user_role_events (target_uid, created_at DESC);

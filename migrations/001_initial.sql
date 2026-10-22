CREATE TABLE users (
  uid text PRIMARY KEY,
  email text,
  display_name text NOT NULL DEFAULT '',
  phone text,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'driver', 'admin')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  client_uid text NOT NULL REFERENCES users(uid),
  driver_uid text REFERENCES users(uid),
  ride_type text NOT NULL CHECK (ride_type IN ('taxi', 'delivery')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending', 'accepted', 'arrived', 'ongoing', 'waiting_verification', 'completed', 'canceled')),
  start_lat double precision NOT NULL CHECK (start_lat BETWEEN -90 AND 90),
  start_lng double precision NOT NULL CHECK (start_lng BETWEEN -180 AND 180),
  end_lat double precision NOT NULL CHECK (end_lat BETWEEN -90 AND 90),
  end_lng double precision NOT NULL CHECK (end_lng BETWEEN -180 AND 180),
  start_name text NOT NULL DEFAULT '',
  end_name text NOT NULL DEFAULT '',
  waypoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  comment text NOT NULL DEFAULT '',
  initial_price numeric(10,2) NOT NULL CHECK (initial_price > 0 AND initial_price <= 999),
  final_price numeric(10,2),
  price_version integer NOT NULL DEFAULT 0 CHECK (price_version >= 0),
  route_distance_m double precision,
  delivery_details jsonb,
  delivery_pin_hash text,
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  payment_method text,
  payment_confirmed_by text REFERENCES users(uid),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  paid_at timestamptz,
  canceled_by text CHECK (canceled_by IN ('client', 'driver'))
);
CREATE INDEX rides_client_history_idx ON rides (client_uid, created_at DESC);
CREATE INDEX rides_driver_history_idx ON rides (driver_uid, created_at DESC);
CREATE INDEX rides_pending_idx ON rides (created_at DESC) WHERE status = 'pending';
CREATE UNIQUE INDEX rides_one_active_client_idx ON rides (client_uid)
  WHERE status IN ('pending', 'accepted', 'arrived', 'ongoing', 'waiting_verification');
CREATE UNIQUE INDEX rides_one_active_driver_idx ON rides (driver_uid)
  WHERE status IN ('accepted', 'arrived', 'ongoing', 'waiting_verification');

CREATE TABLE offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  driver_uid text NOT NULL REFERENCES users(uid),
  price numeric(10,2) NOT NULL CHECK (price > 0 AND price <= 999),
  price_version integer NOT NULL CHECK (price_version >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'stale')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  UNIQUE (ride_id, driver_uid)
);
CREATE INDEX offers_ride_idx ON offers (ride_id, status, created_at DESC);

CREATE TABLE ride_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ride_id uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  actor_uid text REFERENCES users(uid),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ride_events_ride_idx ON ride_events (ride_id, id);

CREATE TABLE driver_positions (
  driver_uid text PRIMARY KEY REFERENCES users(uid),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id),
  from_uid text NOT NULL REFERENCES users(uid),
  to_uid text NOT NULL REFERENCES users(uid),
  role text NOT NULL CHECK (role IN ('client_to_driver', 'driver_to_client')),
  service_type text NOT NULL CHECK (service_type IN ('taxi', 'delivery')),
  score numeric(2,1) NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  badges text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, role)
);
CREATE INDEX ratings_target_idx ON ratings (to_uid, role, service_type);

CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  owner_uid text NOT NULL REFERENCES users(uid),
  kind text NOT NULL CHECK (kind IN ('workshop', 'store')),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  hours text NOT NULL DEFAULT '',
  services text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by text REFERENCES users(uid),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX businesses_kind_status_idx ON businesses (kind, status);

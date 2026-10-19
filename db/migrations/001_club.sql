-- Club shared board.
-- Apply with: npm run db:migrate
-- Requires DATABASE_URL from Neon (Vercel Marketplace).

CREATE TABLE IF NOT EXISTS months (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  piece_midi_url TEXT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles (user_id),
  month_id TEXT NOT NULL REFERENCES months (id),
  take_midi BYTEA NOT NULL,
  client_score INTEGER NOT NULL,
  server_score INTEGER NOT NULL,
  breakdown JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_official BOOLEAN NOT NULL DEFAULT FALSE
);

-- One official take per player per month. A later post replaces that row
-- until the month closes. Practice takes are not stored here.
CREATE UNIQUE INDEX IF NOT EXISTS attempts_one_official
  ON attempts (user_id, month_id)
  WHERE is_official;

CREATE INDEX IF NOT EXISTS attempts_month_official
  ON attempts (month_id, server_score DESC, created_at ASC)
  WHERE is_official;

CREATE TABLE IF NOT EXISTS submit_events (
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submit_events_user_time
  ON submit_events (user_id, created_at DESC);

-- Best official attempt per player per month. The unique index means that
-- is the only official row, ordered later by server_score.
CREATE OR REPLACE VIEW leaderboard AS
SELECT
  a.id AS attempt_id,
  a.month_id,
  a.user_id,
  p.display_name,
  p.avatar_url,
  a.server_score,
  a.client_score,
  a.created_at
FROM attempts a
JOIN profiles p ON p.user_id = a.user_id
WHERE a.is_official;

INSERT INTO months (id, slug, title, piece_midi_url, opens_at, closes_at)
VALUES (
  '2026-10',
  '2026-10',
  'Gymnopédie No. 1',
  '/club/pieces/2026-10.mid',
  TIMESTAMPTZ '2026-10-01 00:00:00 America/Los_Angeles',
  TIMESTAMPTZ '2026-11-01 00:00:00 America/Los_Angeles'
)
ON CONFLICT (id) DO NOTHING;

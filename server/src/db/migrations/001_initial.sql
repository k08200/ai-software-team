-- =============================================================================
-- 001_initial.sql
-- Initial schema for AI Software Team
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE plan AS ENUM ('free', 'starter', 'pro', 'team', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pipeline_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE stripe_event_status AS ENUM ('pending', 'processed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger function (reused across all tables)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     VARCHAR(320) NOT NULL,
  password_hash             TEXT         NOT NULL,
  plan                      plan         NOT NULL DEFAULT 'free',
  stripe_customer_id        VARCHAR(255),
  stripe_subscription_id    VARCHAR(255),
  run_count_current_period  INTEGER      NOT NULL DEFAULT 0,
  period_start              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active                 BOOLEAN      NOT NULL DEFAULT TRUE,
  email_verified            BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx
  ON users (email);

CREATE INDEX IF NOT EXISTS users_stripe_customer_idx
  ON users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_plan_idx
  ON users (plan);

CREATE INDEX IF NOT EXISTS users_created_at_idx
  ON users (created_at DESC);

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- api_keys
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  key_hash    VARCHAR(64)  NOT NULL,
  key_prefix  VARCHAR(20)  NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_idx
  ON api_keys (key_hash);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx
  ON api_keys (user_id);

CREATE INDEX IF NOT EXISTS api_keys_created_at_idx
  ON api_keys (created_at DESC);

DROP TRIGGER IF EXISTS api_keys_updated_at ON api_keys;
CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- pipeline_runs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                   UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID             NOT NULL,
  user_id              UUID             NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_idea         TEXT             NOT NULL,
  status               pipeline_status  NOT NULL DEFAULT 'queued',
  total_input_tokens   INTEGER          NOT NULL DEFAULT 0,
  total_output_tokens  INTEGER          NOT NULL DEFAULT 0,
  total_tokens         INTEGER          NOT NULL DEFAULT 0,
  estimated_cost_usd   DOUBLE PRECISION NOT NULL DEFAULT 0,
  rounds_completed     INTEGER          NOT NULL DEFAULT 0,
  duration_ms          INTEGER,
  error_message        TEXT,
  output_data          JSONB,
  started_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_runs_session_id_idx
  ON pipeline_runs (session_id);

CREATE INDEX IF NOT EXISTS pipeline_runs_user_id_idx
  ON pipeline_runs (user_id);

CREATE INDEX IF NOT EXISTS pipeline_runs_status_idx
  ON pipeline_runs (status);

CREATE INDEX IF NOT EXISTS pipeline_runs_created_at_idx
  ON pipeline_runs (created_at DESC);

-- Composite index for "all runs by user, newest first" queries
CREATE INDEX IF NOT EXISTS pipeline_runs_user_created_idx
  ON pipeline_runs (user_id, created_at DESC);

DROP TRIGGER IF EXISTS pipeline_runs_updated_at ON pipeline_runs;
CREATE TRIGGER pipeline_runs_updated_at
  BEFORE UPDATE ON pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- usage_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_events (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID             NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_id       UUID,
  pipeline_run_id  UUID             REFERENCES pipeline_runs (id) ON DELETE SET NULL,
  event_type       VARCHAR(50)      NOT NULL,
  input_tokens     INTEGER          NOT NULL DEFAULT 0,
  output_tokens    INTEGER          NOT NULL DEFAULT 0,
  total_tokens     INTEGER          NOT NULL DEFAULT 0,
  cost_usd         DOUBLE PRECISION NOT NULL DEFAULT 0,
  billing_period   VARCHAR(7)       NOT NULL,  -- "YYYY-MM"
  metadata         JSONB,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_events_user_id_idx
  ON usage_events (user_id);

CREATE INDEX IF NOT EXISTS usage_events_session_id_idx
  ON usage_events (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS usage_events_billing_period_idx
  ON usage_events (billing_period);

CREATE INDEX IF NOT EXISTS usage_events_created_at_idx
  ON usage_events (created_at DESC);

-- Composite index for "usage for a user in a billing period" aggregation
CREATE INDEX IF NOT EXISTS usage_events_user_period_idx
  ON usage_events (user_id, billing_period);

-- ---------------------------------------------------------------------------
-- stripe_events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stripe_events (
  id               UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  VARCHAR(255)         NOT NULL,
  event_type       VARCHAR(100)         NOT NULL,
  status           stripe_event_status  NOT NULL DEFAULT 'pending',
  payload          JSONB                NOT NULL,
  error_message    TEXT,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_events_stripe_event_id_idx
  ON stripe_events (stripe_event_id);

CREATE INDEX IF NOT EXISTS stripe_events_event_type_idx
  ON stripe_events (event_type);

CREATE INDEX IF NOT EXISTS stripe_events_status_idx
  ON stripe_events (status);

CREATE INDEX IF NOT EXISTS stripe_events_created_at_idx
  ON stripe_events (created_at DESC);

DROP TRIGGER IF EXISTS stripe_events_updated_at ON stripe_events;
CREATE TRIGGER stripe_events_updated_at
  BEFORE UPDATE ON stripe_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

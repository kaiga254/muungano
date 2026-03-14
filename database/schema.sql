-- =============================================================
-- Muungano Wallet v4.0  —  PostgreSQL Schema
-- Interledger-native multi-currency settlement wallet
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =============================================================
-- Enums
-- =============================================================

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE otp_purpose AS ENUM ('verify_phone', 'reset_pin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE wallet_status AS ENUM ('active', 'frozen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE supported_currency AS ENUM ('KES', 'MWK', 'USD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_entry_type AS ENUM (
    'deposit', 'withdrawal', 'transfer_out', 'transfer_in',
    'fx_conversion_out', 'fx_conversion_in',
    'ilp_payment_out', 'ilp_payment_in', 'fee'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE deposit_method AS ENUM ('bank', 'mobile_money');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('pending', 'used', 'expired', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE receiver_type AS ENUM ('phone', 'ilp_address', 'wallet_id');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE fraud_event_type AS ENUM (
    'large_transfer', 'failed_pin_attempts', 'unusual_location', 'rapid_sends'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================
-- Users  —  root entity (no company/tenant layer)
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT UNIQUE NOT NULL,
  phone          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  pin_hash       TEXT,                         -- set after registration
  full_name      TEXT NOT NULL,
  country        TEXT NOT NULL,
  ilp_address    TEXT UNIQUE,                  -- e.g. g.muungano.<uuid>
  kyc_tier       SMALLINT NOT NULL DEFAULT 0,  -- 0 = none, 1 = tier-1
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- Sessions
-- =============================================================

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

-- =============================================================
-- OTPs
-- =============================================================

CREATE TABLE IF NOT EXISTS otps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  purpose    otp_purpose NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS otps_user_id_idx ON otps(user_id);

-- =============================================================
-- KYC Profiles  —  Tier-1 identity verification
-- =============================================================

CREATE TABLE IF NOT EXISTS kyc_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  national_id   TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  country       TEXT NOT NULL,
  status        kyc_status NOT NULL DEFAULT 'pending',
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- Wallets  —  created on-demand per currency
-- =============================================================

CREATE TABLE IF NOT EXISTS wallets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency   supported_currency NOT NULL,
  status     wallet_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, currency)
);

CREATE INDEX IF NOT EXISTS wallets_user_id_idx ON wallets(user_id);

-- =============================================================
-- External Funding Accounts  —  user-owned source/destination rails
-- =============================================================

CREATE TABLE IF NOT EXISTS external_funding_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_key        TEXT NOT NULL,
  type               deposit_method NOT NULL,
  provider_name      TEXT NOT NULL,
  account_name       TEXT NOT NULL,
  account_identifier TEXT NOT NULL,
  country            TEXT NOT NULL,
  currency           supported_currency NOT NULL,
  metadata_json      JSONB NOT NULL DEFAULT '{}',
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, account_key)
);

CREATE INDEX IF NOT EXISTS external_funding_accounts_user_id_idx
  ON external_funding_accounts(user_id);

CREATE INDEX IF NOT EXISTS external_funding_accounts_currency_idx
  ON external_funding_accounts(currency);

CREATE TABLE IF NOT EXISTS external_funding_account_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funding_account_id UUID NOT NULL REFERENCES external_funding_accounts(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction          TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount             BIGINT NOT NULL CHECK (amount > 0),
  currency           supported_currency NOT NULL,
  reference          TEXT NOT NULL UNIQUE,
  narration          TEXT,
  balance_before     BIGINT NOT NULL,
  balance_after      BIGINT NOT NULL,
  metadata_json      JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS external_funding_account_txns_account_idx
  ON external_funding_account_transactions(funding_account_id, created_at DESC);

-- =============================================================
-- Ledger Entries  —  canonical balance source
-- All amounts stored as integers (smallest currency unit, e.g. cents)
-- =============================================================

CREATE TABLE IF NOT EXISTS ledger_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id     UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  type          ledger_entry_type NOT NULL,
  amount        BIGINT NOT NULL CHECK (amount > 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  reference     TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wallet_id, reference)
);

CREATE INDEX IF NOT EXISTS ledger_entries_wallet_id_idx ON ledger_entries(wallet_id);
CREATE INDEX IF NOT EXISTS ledger_entries_created_at_idx ON ledger_entries(created_at DESC);

-- =============================================================
-- Deposits
-- =============================================================

CREATE TABLE IF NOT EXISTS deposits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  funding_account_id UUID REFERENCES external_funding_accounts(id) ON DELETE SET NULL,
  amount          BIGINT NOT NULL CHECK (amount > 0),
  currency        supported_currency NOT NULL,
  method          deposit_method NOT NULL,
  status          transaction_status NOT NULL DEFAULT 'pending',
  reference       TEXT UNIQUE NOT NULL,
  idempotency_key TEXT UNIQUE,
  metadata_json   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deposits_user_id_idx ON deposits(user_id);
CREATE INDEX IF NOT EXISTS deposits_wallet_id_idx ON deposits(wallet_id);
CREATE INDEX IF NOT EXISTS deposits_funding_account_id_idx ON deposits(funding_account_id);

ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS funding_account_id UUID REFERENCES external_funding_accounts(id) ON DELETE SET NULL;

-- =============================================================
-- Withdrawals
-- =============================================================

CREATE TABLE IF NOT EXISTS withdrawals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id                UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  funding_account_id       UUID REFERENCES external_funding_accounts(id) ON DELETE SET NULL,
  destination_type         deposit_method NOT NULL,
  destination_details_json JSONB NOT NULL DEFAULT '{}',
  amount                   BIGINT NOT NULL CHECK (amount > 0),
  currency                 supported_currency NOT NULL,
  fee                      BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
  status                   transaction_status NOT NULL DEFAULT 'pending',
  idempotency_key          TEXT UNIQUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS withdrawals_user_id_idx ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS withdrawals_funding_account_id_idx ON withdrawals(funding_account_id);

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS funding_account_id UUID REFERENCES external_funding_accounts(id) ON DELETE SET NULL;

-- =============================================================
-- Quotes  —  30-second TTL pre-payment transparency
-- =============================================================

CREATE TABLE IF NOT EXISTS quotes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_wallet_id     UUID REFERENCES wallets(id) ON DELETE RESTRICT,
  source_currency      supported_currency NOT NULL,
  destination_currency supported_currency NOT NULL,
  source_amount        BIGINT NOT NULL CHECK (source_amount > 0),
  destination_amount   BIGINT NOT NULL CHECK (destination_amount > 0),
  exchange_rate        NUMERIC(20, 8) NOT NULL,
  fees_json            JSONB NOT NULL DEFAULT '{}',
  metadata_json        JSONB NOT NULL DEFAULT '{}',
  rafiki_quote_id      TEXT,
  expires_at           TIMESTAMPTZ NOT NULL,
  status               quote_status NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quotes_user_id_idx ON quotes(user_id);

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS source_wallet_id UUID REFERENCES wallets(id) ON DELETE RESTRICT;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS quotes_source_wallet_id_idx ON quotes(source_wallet_id);

-- =============================================================
-- Payments  —  Cross-border ILP payments
-- =============================================================

CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_wallet_id    UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  receiver_identifier TEXT NOT NULL,
  receiver_type       receiver_type NOT NULL,
  amount              BIGINT NOT NULL CHECK (amount > 0),
  currency            supported_currency NOT NULL,
  quote_id            UUID REFERENCES quotes(id),
  rafiki_payment_id   TEXT,
  status              transaction_status NOT NULL DEFAULT 'pending',
  idempotency_key     TEXT UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_sender_wallet_idx ON payments(sender_wallet_id);

-- =============================================================
-- Internal Transfers  —  FX inter-wallet swaps
-- =============================================================

CREATE TABLE IF NOT EXISTS internal_transfers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  dest_wallet_id   UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  source_amount    BIGINT NOT NULL CHECK (source_amount > 0),
  dest_amount      BIGINT NOT NULL CHECK (dest_amount > 0),
  fx_rate          NUMERIC(20, 8) NOT NULL,
  quote_id         UUID REFERENCES quotes(id),
  status           transaction_status NOT NULL DEFAULT 'pending',
  idempotency_key  TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS internal_transfers_user_id_idx ON internal_transfers(user_id);

-- =============================================================
-- Treasury Balances  —  liquidity management
-- =============================================================

CREATE TABLE IF NOT EXISTS treasury_balances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency            supported_currency UNIQUE NOT NULL,
  available_liquidity BIGINT NOT NULL DEFAULT 0,
  reserved_liquidity  BIGINT NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO treasury_balances (currency, available_liquidity)
VALUES
  ('KES', 100000000),
  ('MWK', 500000000),
  ('USD',  50000000)
ON CONFLICT (currency) DO NOTHING;

-- =============================================================
-- Rate Limits
-- =============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  transfer_count  INT NOT NULL DEFAULT 0,
  transfer_volume BIGINT NOT NULL DEFAULT 0,  -- USD-cent equivalent
  PRIMARY KEY (user_id, date)
);

-- =============================================================
-- Fraud Events
-- =============================================================

CREATE TABLE IF NOT EXISTS fraud_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type   fraud_event_type NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fraud_events_user_id_idx    ON fraud_events(user_id);
CREATE INDEX IF NOT EXISTS fraud_events_created_at_idx ON fraud_events(created_at DESC);

-- =============================================================
-- Simulator Accounts  —  deposit / withdrawal channel simulator
-- =============================================================

CREATE TABLE IF NOT EXISTS simulator_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  rail            TEXT NOT NULL,           -- 'mpesa' | 'bank'
  account_label   TEXT NOT NULL DEFAULT 'primary',
  current_balance BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'KES',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, rail)
);

CREATE INDEX IF NOT EXISTS simulator_accounts_user_id_idx ON simulator_accounts(user_id);
CREATE INDEX IF NOT EXISTS simulator_accounts_rail_idx    ON simulator_accounts(rail);

-- =============================================================
-- Simulator Transactions
-- =============================================================

CREATE TABLE IF NOT EXISTS simulator_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES simulator_accounts(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  rail           TEXT NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount         BIGINT NOT NULL CHECK (amount > 0),
  balance_before BIGINT NOT NULL,
  balance_after  BIGINT NOT NULL,
  reference      TEXT NOT NULL,
  metadata_json  JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reference)
);

CREATE INDEX IF NOT EXISTS sim_txns_account_id_idx ON simulator_transactions(account_id);
CREATE INDEX IF NOT EXISTS sim_txns_user_id_idx    ON simulator_transactions(user_id);

-- =============================================================
-- Helpful Views
-- =============================================================

-- Live wallet balances derived entirely from the ledger
CREATE OR REPLACE VIEW wallet_balances AS
SELECT
  w.id        AS wallet_id,
  w.user_id,
  w.currency,
  w.status,
  COALESCE(
    (SELECT le.balance_after
     FROM   ledger_entries le
     WHERE  le.wallet_id = w.id
     ORDER  BY le.created_at DESC, le.id DESC
     LIMIT  1),
    0
  ) AS balance,
  w.created_at
FROM wallets w;

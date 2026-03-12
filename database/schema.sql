CREATE TABLE IF NOT EXISTS payroll_transactions (
	id UUID PRIMARY KEY,
	employee_name TEXT NOT NULL,
	source_amount NUMERIC(14, 2) NOT NULL,
	source_currency VARCHAR(8) NOT NULL,
	destination_amount NUMERIC(14, 2) NOT NULL,
	destination_currency VARCHAR(8) NOT NULL,
	destination_pointer TEXT NOT NULL,
	quote_id TEXT NOT NULL,
	payment_id TEXT NOT NULL,
	status VARCHAR(16) NOT NULL,
	splits_json JSONB NOT NULL,
	distribution_json JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_transactions_created_at
	ON payroll_transactions (created_at DESC);

CREATE SCHEMA IF NOT EXISTS mpesa;

CREATE TABLE IF NOT EXISTS mpesa.accounts (
	account_key TEXT PRIMARY KEY,
	owner_name TEXT NOT NULL,
	currency VARCHAR(8) NOT NULL,
	balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
	metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mpesa.transactions (
	id TEXT PRIMARY KEY,
	account_key TEXT NOT NULL REFERENCES mpesa.accounts(account_key),
	action TEXT NOT NULL,
	amount NUMERIC(14, 2) NOT NULL,
	employee_name TEXT,
	obligation TEXT,
	currency VARCHAR(8) NOT NULL,
	payload_json JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpesa_transactions_created_at
	ON mpesa.transactions (created_at DESC);

INSERT INTO mpesa.accounts (account_key, owner_name, currency, balance, metadata_json)
VALUES ('primary', 'Demo Worker Wallet', 'KES', 25000, '{"channel":"mpesa"}'::jsonb)
ON CONFLICT (account_key) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS bank;

CREATE TABLE IF NOT EXISTS bank.accounts (
	account_key TEXT PRIMARY KEY,
	owner_name TEXT NOT NULL,
	currency VARCHAR(8) NOT NULL,
	balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
	metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank.transactions (
	id TEXT PRIMARY KEY,
	account_key TEXT NOT NULL REFERENCES bank.accounts(account_key),
	action TEXT NOT NULL,
	amount NUMERIC(14, 2) NOT NULL,
	employee_name TEXT,
	obligation TEXT,
	currency VARCHAR(8) NOT NULL,
	payload_json JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_created_at
	ON bank.transactions (created_at DESC);

INSERT INTO bank.accounts (account_key, owner_name, currency, balance, metadata_json)
VALUES ('primary', 'Demo Bank Clearing Account', 'KES', 50000, '{"channel":"bank"}'::jsonb)
ON CONFLICT (account_key) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS sacco;

CREATE TABLE IF NOT EXISTS sacco.accounts (
	account_key TEXT PRIMARY KEY,
	owner_name TEXT NOT NULL,
	currency VARCHAR(8) NOT NULL,
	balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
	metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sacco.transactions (
	id TEXT PRIMARY KEY,
	account_key TEXT NOT NULL REFERENCES sacco.accounts(account_key),
	action TEXT NOT NULL,
	amount NUMERIC(14, 2) NOT NULL,
	employee_name TEXT,
	obligation TEXT,
	currency VARCHAR(8) NOT NULL,
	payload_json JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sacco_transactions_created_at
	ON sacco.transactions (created_at DESC);

INSERT INTO sacco.accounts (account_key, owner_name, currency, balance, metadata_json)
VALUES ('primary', 'Demo SACCO Member Savings', 'KES', 15000, '{"channel":"sacco"}'::jsonb)
ON CONFLICT (account_key) DO NOTHING;

CREATE SCHEMA IF NOT EXISTS insurance;

CREATE TABLE IF NOT EXISTS insurance.accounts (
	account_key TEXT PRIMARY KEY,
	owner_name TEXT NOT NULL,
	currency VARCHAR(8) NOT NULL,
	balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
	metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance.transactions (
	id TEXT PRIMARY KEY,
	account_key TEXT NOT NULL REFERENCES insurance.accounts(account_key),
	action TEXT NOT NULL,
	amount NUMERIC(14, 2) NOT NULL,
	employee_name TEXT,
	obligation TEXT,
	currency VARCHAR(8) NOT NULL,
	payload_json JSONB NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_transactions_created_at
	ON insurance.transactions (created_at DESC);

INSERT INTO insurance.accounts (account_key, owner_name, currency, balance, metadata_json)
VALUES ('primary', 'Demo Insurance Premium Wallet', 'KES', 8000, '{"channel":"insurance"}'::jsonb)
ON CONFLICT (account_key) DO NOTHING;

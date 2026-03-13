-- ============================================================
-- SaaS core tables
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
	id UUID PRIMARY KEY,
	name TEXT NOT NULL,
	country VARCHAR(4) NOT NULL DEFAULT 'KE',       -- ISO-3166-1 alpha-2 or alpha-3
	currency VARCHAR(8) NOT NULL DEFAULT 'KES',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	email TEXT NOT NULL,
	password_hash TEXT NOT NULL,
	full_name TEXT NOT NULL,
	role VARCHAR(32) NOT NULL DEFAULT 'hr_admin',   -- hr_admin | payroll_officer | viewer
	is_active BOOLEAN NOT NULL DEFAULT TRUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_email ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS sessions (
	token TEXT PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- ============================================================
-- Employee records
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
	id UUID PRIMARY KEY,
	company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	employee_number TEXT,                                   -- optional HR-assigned ID
	full_name TEXT NOT NULL,
	email TEXT,
	phone TEXT,
	department TEXT,
	job_title TEXT,
	employment_type VARCHAR(32) NOT NULL DEFAULT 'full_time',  -- full_time | part_time | contract
	country VARCHAR(4) NOT NULL DEFAULT 'KE',
	-- Salary
	salary_amount NUMERIC(14, 2) NOT NULL,
	salary_currency VARCHAR(8) NOT NULL DEFAULT 'MWK',
	-- Payout
	destination_pointer TEXT NOT NULL,                     -- Open Payments / wallet address
	-- Statutory identifiers (Malawi + Kenya)
	national_id TEXT,
	kra_pin TEXT,                                          -- Kenya
	nhif_number TEXT,                                      -- Kenya
	nssf_number TEXT,                                      -- Kenya / Malawi
	tpin TEXT,                                             -- Malawi Tax PIN
	-- Status
	is_active BOOLEAN NOT NULL DEFAULT TRUE,
	start_date DATE,
	end_date DATE,
	-- Audit
	created_by UUID REFERENCES users(id),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_employees_number
	ON employees (company_id, employee_number)
	WHERE employee_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees (company_id);

-- Per-employee split rule overrides (null = use global default)
CREATE TABLE IF NOT EXISTS employee_split_rules (
	id UUID PRIMARY KEY,
	employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
	split_key VARCHAR(32) NOT NULL,   -- matches SplitRule.key
	label TEXT NOT NULL,
	percentage NUMERIC(5, 2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_split_rules_employee_key
	ON employee_split_rules (employee_id, split_key);

-- ============================================================
-- Payroll transaction log (now company-and-employee relational)
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_transactions (
	id UUID PRIMARY KEY,
	company_id UUID REFERENCES companies(id),
	employee_id UUID REFERENCES employees(id),
	created_by UUID REFERENCES users(id),
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

CREATE INDEX IF NOT EXISTS idx_payroll_transactions_company_id
	ON payroll_transactions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_transactions_employee_id
	ON payroll_transactions (employee_id, created_at DESC);

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

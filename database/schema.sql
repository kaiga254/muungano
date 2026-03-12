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

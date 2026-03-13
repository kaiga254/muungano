/* eslint-disable @typescript-eslint/no-require-imports */
const { randomUUID } = require("crypto");
const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 4102;
const accountKey = "primary";
const seedBalance = 50000;

const ledger = [];
let accountBalance = 0;
let pool;

const getPool = () => {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  return pool;
};

const initializeDatabase = async () => {
  const dbPool = getPool();
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
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
  `);

  await dbPool.query(
    `
      INSERT INTO bank.accounts (account_key, owner_name, currency, balance, metadata_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (account_key) DO NOTHING
    `,
    [accountKey, "Demo Bank Clearing Account", "KES", seedBalance, JSON.stringify({ channel: "bank" })],
  );
};

const getMemoryState = () => ({
  accountBalance,
  latestTransactions: ledger.slice(0, 20),
});

const normalizeRows = (rows) => {
  return rows.map((row) => ({
    action: row.action,
    receivedAt:
      row.receivedAt instanceof Date
        ? row.receivedAt.toISOString()
        : String(row.receivedAt),
    amount: Number(row.amount),
    employeeName: row.employeeName,
    obligation: row.obligation,
    currency: row.currency,
  }));
};

const getState = async () => {
  const dbPool = getPool();
  if (!dbPool) {
    return getMemoryState();
  }

  const [accountResult, transactionResult] = await Promise.all([
    dbPool.query(
      `
        SELECT balance
        FROM bank.accounts
        WHERE account_key = $1
        LIMIT 1
      `,
      [accountKey],
    ),
    dbPool.query(
      `
        SELECT
          action,
          amount,
          employee_name AS "employeeName",
          obligation,
          currency,
          created_at AS "receivedAt"
        FROM bank.transactions
        WHERE account_key = $1
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [accountKey],
    ),
  ]);

  return {
    accountBalance: Number(accountResult.rows[0]?.balance ?? 0),
    latestTransactions: normalizeRows(transactionResult.rows),
  };
};

const persistEntry = async (payload) => {
  const dbPool = getPool();
  if (!dbPool) {
    accountBalance += payload.amount;
    ledger.unshift(payload);
    if (ledger.length > 100) {
      ledger.length = 100;
    }

    return getMemoryState();
  }

  const client = await dbPool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO bank.accounts (account_key, owner_name, currency, balance, metadata_json)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (account_key) DO NOTHING
      `,
      [accountKey, "Demo Bank Clearing Account", payload.currency || "KES", seedBalance, JSON.stringify({ channel: "bank" })],
    );
    await client.query(
      `
        UPDATE bank.accounts
        SET balance = balance + $1,
            updated_at = NOW()
        WHERE account_key = $2
      `,
      [payload.amount, accountKey],
    );
    await client.query(
      `
        INSERT INTO bank.transactions (
          id,
          account_key,
          action,
          amount,
          employee_name,
          obligation,
          currency,
          payload_json,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
      `,
      [
        randomUUID(),
        accountKey,
        payload.action,
        payload.amount,
        payload.employeeName ?? null,
        payload.obligation ?? null,
        payload.currency || "KES",
        JSON.stringify(payload),
        payload.receivedAt,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getState();
};

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.options("*", (_req, res) => {
  res.sendStatus(204);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "bank-service" });
});

app.get("/state", async (_req, res) => {
  try {
    res.json({
      service: "bank-service",
      ...(await getState()),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load bank state",
      details: error instanceof Error ? error.message : "Unknown state error",
    });
  }
});

app.post("/transfer", async (req, res) => {
  const amount = Number(req.body?.amount) || 0;
  const payload = {
    service: "bank-service",
    action: "transfer",
    receivedAt: new Date().toISOString(),
    amount,
    ...req.body,
  };

  try {
    const state = await persistEntry(payload);

    console.log("[bank-service] transfer", payload);
    res.json({
      success: true,
      payload,
      state,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to persist bank transfer",
      details: error instanceof Error ? error.message : "Unknown persistence error",
    });
  }
});

app.post("/payment", async (req, res) => {
  const amount = Number(req.body?.amount) || 0;
  const payload = {
    service: "bank-service",
    action: "payment",
    receivedAt: new Date().toISOString(),
    amount,
    ...req.body,
  };

  try {
    const state = await persistEntry(payload);

    console.log("[bank-service] payment", payload);
    res.json({
      success: true,
      payload,
      state,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to persist bank payment",
      details: error instanceof Error ? error.message : "Unknown persistence error",
    });
  }
});

initializeDatabase()
  .catch((error) => {
    console.error("[bank-service] database initialization failed", error);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`[bank-service] listening on port ${port}`);
    });
  });
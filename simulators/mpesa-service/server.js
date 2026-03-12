/* eslint-disable @typescript-eslint/no-require-imports */
const { randomUUID } = require("crypto");
const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 4101;
const accountKey = "primary";
const seedBalance = 25000;

const transactions = [];
let balance = 0;
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
  `);

  await dbPool.query(
    `
      INSERT INTO mpesa.accounts (account_key, owner_name, currency, balance, metadata_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (account_key) DO NOTHING
    `,
    [accountKey, "Demo Worker Wallet", "KES", seedBalance, JSON.stringify({ channel: "mpesa" })],
  );
};

const getMemoryState = () => ({
  balance,
  latestTransactions: transactions.slice(0, 20),
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
        FROM mpesa.accounts
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
        FROM mpesa.transactions
        WHERE account_key = $1
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [accountKey],
    ),
  ]);

  return {
    balance: Number(accountResult.rows[0]?.balance ?? 0),
    latestTransactions: normalizeRows(transactionResult.rows),
  };
};

const persistCredit = async (payload) => {
  const dbPool = getPool();
  if (!dbPool) {
    balance += payload.amount;
    transactions.unshift(payload);
    if (transactions.length > 100) {
      transactions.length = 100;
    }

    return getMemoryState();
  }

  const client = await dbPool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO mpesa.accounts (account_key, owner_name, currency, balance, metadata_json)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (account_key) DO NOTHING
      `,
      [accountKey, "Demo Worker Wallet", payload.currency || "KES", seedBalance, JSON.stringify({ channel: "mpesa" })],
    );
    await client.query(
      `
        UPDATE mpesa.accounts
        SET balance = balance + $1,
            updated_at = NOW()
        WHERE account_key = $2
      `,
      [payload.amount, accountKey],
    );
    await client.query(
      `
        INSERT INTO mpesa.transactions (
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
  res.json({ status: "ok", service: "mpesa-service" });
});

app.get("/state", async (_req, res) => {
  try {
    res.json({
      service: "mpesa-service",
      ...(await getState()),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load MPESA state",
      details: error instanceof Error ? error.message : "Unknown state error",
    });
  }
});

app.post("/credit", async (req, res) => {
  const amount = Number(req.body?.amount) || 0;

  const payload = {
    service: "mpesa-service",
    action: "wallet-credit",
    receivedAt: new Date().toISOString(),
    amount,
    ...req.body,
  };

  try {
    const state = await persistCredit(payload);

    console.log("[mpesa-service] credit", payload);
    res.json({
      success: true,
      payload,
      state,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to persist MPESA credit",
      details: error instanceof Error ? error.message : "Unknown persistence error",
    });
  }
});

initializeDatabase()
  .catch((error) => {
    console.error("[mpesa-service] database initialization failed", error);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`[mpesa-service] listening on port ${port}`);
    });
  });
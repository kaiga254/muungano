/* eslint-disable @typescript-eslint/no-require-imports */
const { randomUUID } = require("crypto");
const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 4103;
const accountKey = "primary";
const seedBalance = 15000;

const deposits = [];
let savingsBalance = 0;
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
  `);

  await dbPool.query(
    `
      INSERT INTO sacco.accounts (account_key, owner_name, currency, balance, metadata_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (account_key) DO NOTHING
    `,
    [accountKey, "Demo SACCO Member Savings", "KES", seedBalance, JSON.stringify({ channel: "sacco" })],
  );
};

const getMemoryState = () => ({
  savingsBalance,
  latestDeposits: deposits.slice(0, 20),
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
        FROM sacco.accounts
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
        FROM sacco.transactions
        WHERE account_key = $1
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [accountKey],
    ),
  ]);

  return {
    savingsBalance: Number(accountResult.rows[0]?.balance ?? 0),
    latestDeposits: normalizeRows(transactionResult.rows),
  };
};

const persistDeposit = async (payload) => {
  const dbPool = getPool();
  if (!dbPool) {
    savingsBalance += payload.amount;
    deposits.unshift(payload);
    if (deposits.length > 100) {
      deposits.length = 100;
    }

    return getMemoryState();
  }

  const client = await dbPool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO sacco.accounts (account_key, owner_name, currency, balance, metadata_json)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (account_key) DO NOTHING
      `,
      [accountKey, "Demo SACCO Member Savings", payload.currency || "KES", seedBalance, JSON.stringify({ channel: "sacco" })],
    );
    await client.query(
      `
        UPDATE sacco.accounts
        SET balance = balance + $1,
            updated_at = NOW()
        WHERE account_key = $2
      `,
      [payload.amount, accountKey],
    );
    await client.query(
      `
        INSERT INTO sacco.transactions (
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
  res.json({ status: "ok", service: "sacco-service" });
});

app.get("/state", async (_req, res) => {
  try {
    res.json({
      service: "sacco-service",
      ...(await getState()),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load SACCO state",
      details: error instanceof Error ? error.message : "Unknown state error",
    });
  }
});

app.post("/deposit", async (req, res) => {
  const amount = Number(req.body?.amount) || 0;
  const payload = {
    service: "sacco-service",
    action: "deposit",
    receivedAt: new Date().toISOString(),
    amount,
    ...req.body,
  };

  try {
    const state = await persistDeposit(payload);

    console.log("[sacco-service] deposit", payload);
    res.json({
      success: true,
      payload,
      state,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to persist SACCO deposit",
      details: error instanceof Error ? error.message : "Unknown persistence error",
    });
  }
});

initializeDatabase()
  .catch((error) => {
    console.error("[sacco-service] database initialization failed", error);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`[sacco-service] listening on port ${port}`);
    });
  });
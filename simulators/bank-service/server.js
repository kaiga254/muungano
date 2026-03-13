/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Muungano Bank Simulator
 * Simulates a bank channel for wallet deposits and withdrawals.
 *
 * Endpoints:
 *   GET  /health                  — liveness probe
 *   GET  /state                   — current float balance + recent txns
 *   POST /deposit                 — initiate a deposit (auto-confirms after 2s)
 *   POST /withdraw                — initiate a withdrawal
 *   GET  /transactions            — list recent transactions
 */
const { randomUUID } = require("crypto");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 4102;
const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://localhost:3000";

// In-memory float account — seeded with KES 2,000,000 (bank has more float than mpesa)
let floatBalance = 2_000_000_00; // stored in minor units
const transactions = [];

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("*", (_req, res) => res.sendStatus(204));

/** GET /health */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "muungano-bank-simulator" });
});

/** GET /state */
app.get("/state", (_req, res) => {
  res.json({
    service: "muungano-bank-simulator",
    floatBalance,
    currency: "KES",
    recentTransactions: transactions.slice(0, 20),
  });
});

/** GET /transactions */
app.get("/transactions", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json({ transactions: transactions.slice(0, limit) });
});

/**
 * POST /deposit
 * Body: { depositId, amount, currency, accountNumber, reference }
 * Simulates a bank transfer inbound. After 2 seconds (bank is slower than mpesa),
 * calls back the main app's /api/deposits/confirm webhook.
 */
app.post("/deposit", async (req, res) => {
  const { depositId, amount, currency = "KES", accountNumber, reference } = req.body ?? {};

  if (!depositId || !amount) {
    return res.status(400).json({ error: "depositId and amount are required." });
  }

  const txnId = randomUUID();
  const amountNum = Number(amount);

  const txn = {
    id: txnId,
    type: "deposit",
    depositId,
    amount: amountNum,
    currency,
    accountNumber: accountNumber ?? "unknown",
    reference: reference ?? txnId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  transactions.unshift(txn);

  console.log(`[bank-sim] deposit initiated  depositId=${depositId} amount=${amountNum} ${currency}`);
  res.json({ message: "Bank deposit received. Confirming in 2 seconds.", txnId });

  // Bank transfers take a little longer than mobile money
  setTimeout(async () => {
    try {
      const callbackUrl = `${MAIN_APP_URL}/api/deposits/confirm`;
      const resp = await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositId, confirmedAmount: amountNum }),
      });
      const data = await resp.json();
      txn.status = resp.ok ? "confirmed" : "failed";
      txn.callbackResponse = data;
      floatBalance -= amountNum;
      console.log(`[bank-sim] deposit confirmed  depositId=${depositId} status=${txn.status}`);
    } catch (err) {
      txn.status = "callback_error";
      txn.error = err.message;
      console.error(`[bank-sim] deposit callback error depositId=${depositId}`, err.message);
    }
  }, 2000);
});

/**
 * POST /withdraw
 * Body: { withdrawalId, amount, currency, accountNumber, bankCode, reference }
 * Simulates the main app pushing money to a bank account.
 */
app.post("/withdraw", (req, res) => {
  const { withdrawalId, amount, currency = "KES", accountNumber, bankCode, reference } = req.body ?? {};

  if (!withdrawalId || !amount) {
    return res.status(400).json({ error: "withdrawalId and amount are required." });
  }

  const amountNum = Number(amount);

  if (floatBalance < amountNum) {
    return res.status(422).json({ error: "Simulator float insufficient." });
  }

  const txnId = randomUUID();
  floatBalance += amountNum;

  const txn = {
    id: txnId,
    type: "withdrawal",
    withdrawalId,
    amount: amountNum,
    currency,
    accountNumber: accountNumber ?? "unknown",
    bankCode: bankCode ?? "000",
    reference: reference ?? txnId,
    status: "completed",
    completedAt: new Date().toISOString(),
  };
  transactions.unshift(txn);

  console.log(`[bank-sim] withdrawal completed withdrawalId=${withdrawalId} amount=${amountNum} ${currency}`);
  res.json({ message: "Bank withdrawal processed.", txnId, status: "completed" });
});

app.listen(PORT, () => {
  console.log(`[muungano-bank-simulator] listening on port ${PORT}`);
});

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Muungano M-Pesa Simulator
 * Simulates a mobile money channel for wallet deposits and withdrawals.
 *
 * Endpoints:
 *   GET  /health                  — liveness probe
 *   GET  /state                   — current float balance + recent txns
 *   POST /deposit                 — initiate a deposit (auto-confirms after 1s)
 *   POST /withdraw                — initiate a withdrawal
 *   GET  /transactions            — list recent transactions
 */
const { randomUUID } = require("crypto");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 4101;
const MAIN_APP_URL = process.env.MAIN_APP_URL || "http://localhost:3000";

// In-memory float account — seeded with KES 500,000
let floatBalance = 500_000_00; // stored in minor units (cents / lowest denom)
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
  res.json({ status: "ok", service: "muungano-mpesa-simulator" });
});

/** GET /state */
app.get("/state", (_req, res) => {
  res.json({
    service: "muungano-mpesa-simulator",
    floatBalance,
    currency: "KES",
    recentTransactions: transactions.slice(0, 20),
  });
});

/** GET /transactions */
app.get("/transactions", (_req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json({ transactions: transactions.slice(0, limit) });
});

/**
 * POST /deposit
 * Body: { depositId, amount, currency, phone, reference }
 * Simulates a customer sending mobile money. After 1 second,
 * calls back the main app's /api/deposits/confirm webhook.
 */
app.post("/deposit", async (req, res) => {
  const { depositId, amount, currency = "KES", phone, reference } = req.body ?? {};

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
    phone: phone ?? "unknown",
    reference: reference ?? txnId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  transactions.unshift(txn);

  console.log(`[mpesa-sim] deposit initiated  depositId=${depositId} amount=${amountNum} ${currency}`);
  res.json({ message: "Deposit received. Confirming in 1 second.", txnId });

  // Async: after 1 second simulate M-Pesa confirming the payment
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
      floatBalance -= amountNum; // float decreases when depositing to wallet
      console.log(`[mpesa-sim] deposit confirmed  depositId=${depositId} status=${txn.status}`);
    } catch (err) {
      txn.status = "callback_error";
      txn.error = err.message;
      console.error(`[mpesa-sim] deposit callback error depositId=${depositId}`, err.message);
    }
  }, 1000);
});

/**
 * POST /withdraw
 * Body: { withdrawalId, amount, currency, phone, reference }
 * Simulates the main app pushing money to a mobile money account.
 */
app.post("/withdraw", (req, res) => {
  const { withdrawalId, amount, currency = "KES", phone, reference } = req.body ?? {};

  if (!withdrawalId || !amount) {
    return res.status(400).json({ error: "withdrawalId and amount are required." });
  }

  const amountNum = Number(amount);

  if (floatBalance < amountNum) {
    return res.status(422).json({ error: "Simulator float insufficient." });
  }

  const txnId = randomUUID();
  floatBalance += amountNum; // float increases when withdrawing from wallet

  const txn = {
    id: txnId,
    type: "withdrawal",
    withdrawalId,
    amount: amountNum,
    currency,
    phone: phone ?? "unknown",
    reference: reference ?? txnId,
    status: "completed",
    completedAt: new Date().toISOString(),
  };
  transactions.unshift(txn);

  console.log(`[mpesa-sim] withdrawal completed withdrawalId=${withdrawalId} amount=${amountNum} ${currency}`);
  res.json({ message: "Withdrawal processed.", txnId, status: "completed" });
});

app.listen(PORT, () => {
  console.log(`[muungano-mpesa-simulator] listening on port ${PORT}`);
});


const app = express();
const port = process.env.PORT || 4101;
const accountKey = "primary";
const seedBalance = 25000;

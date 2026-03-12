const express = require("express");

const app = express();
const port = process.env.PORT || 4102;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "bank-service" });
});

app.post("/transfer", (req, res) => {
  const payload = {
    service: "bank-service",
    action: "transfer",
    receivedAt: new Date().toISOString(),
    ...req.body,
  };

  console.log("[bank-service] transfer", payload);
  res.json({ success: true, payload });
});

app.post("/payment", (req, res) => {
  const payload = {
    service: "bank-service",
    action: "payment",
    receivedAt: new Date().toISOString(),
    ...req.body,
  };

  console.log("[bank-service] payment", payload);
  res.json({ success: true, payload });
});

app.listen(port, () => {
  console.log(`[bank-service] listening on port ${port}`);
});
const express = require("express");

const app = express();
const port = process.env.PORT || 4103;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sacco-service" });
});

app.post("/deposit", (req, res) => {
  const payload = {
    service: "sacco-service",
    action: "deposit",
    receivedAt: new Date().toISOString(),
    ...req.body,
  };

  console.log("[sacco-service] deposit", payload);
  res.json({ success: true, payload });
});

app.listen(port, () => {
  console.log(`[sacco-service] listening on port ${port}`);
});
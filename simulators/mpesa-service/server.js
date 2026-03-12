const express = require("express");

const app = express();
const port = process.env.PORT || 4101;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "mpesa-service" });
});

app.post("/credit", (req, res) => {
  const payload = {
    service: "mpesa-service",
    action: "wallet-credit",
    receivedAt: new Date().toISOString(),
    ...req.body,
  };

  console.log("[mpesa-service] credit", payload);
  res.json({ success: true, payload });
});

app.listen(port, () => {
  console.log(`[mpesa-service] listening on port ${port}`);
});
const express = require("express");

const app = express();
const port = process.env.PORT || 4104;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "insurance-service" });
});

app.post("/premium", (req, res) => {
  const payload = {
    service: "insurance-service",
    action: "premium",
    receivedAt: new Date().toISOString(),
    ...req.body,
  };

  console.log("[insurance-service] premium", payload);
  res.json({ success: true, payload });
});

app.listen(port, () => {
  console.log(`[insurance-service] listening on port ${port}`);
});
# Simulators Runbook

This folder contains 4 Node.js simulators:

- `mpesa-service` (port `4101`)
- `bank-service` (port `4102`)
- `sacco-service` (port `4103`)
- `insurance-service` (port `4104`)

## 1) Prerequisites

- Node.js 20+
- (Optional) Docker + Docker Compose
- Main app running on `http://localhost:3000` if you want deposit callbacks to complete

## 2) Run M-Pesa + Bank (used by `/api/simulators/[rail]/state`)

From repo root:

```bash
docker compose up --build muungano-mpesa-simulator muungano-bank-simulator
```

If you run them directly with Node:

```bash
cd simulators/mpesa-service && npm install && npm start
cd simulators/bank-service && npm install && npm start
```

Use separate terminals for each service.

## 3) Run SACCO + Insurance (optional)

```bash
cd simulators/sacco-service && npm install && npm start
cd simulators/insurance-service && npm install && npm start
```

If you want database-backed state for SACCO/Insurance, set `DATABASE_URL` before starting.

## 4) Verify services

```bash
curl http://localhost:4101/health
curl http://localhost:4101/state

curl http://localhost:4102/health
curl http://localhost:4102/state

curl http://localhost:4103/health
curl http://localhost:4103/state

curl http://localhost:4104/health
curl http://localhost:4104/state
```

Expected: all `/health` and `/state` calls return HTTP `200` with JSON.

## 5) Fix stale or wrong process issues

If `/state` returns `404` or the wrong service name, old processes are likely running.

Check running processes:

```bash
lsof -nP -iTCP:4101 -sTCP:LISTEN
lsof -nP -iTCP:4102 -sTCP:LISTEN
```

Stop stale process (replace `<PID>`):

```bash
kill <PID>
```

Then restart the simulator with the commands above.

## 6) Main app integration notes

- Main app reads simulator URLs from:
  - `MPESA_SERVICE_URL` (default `http://localhost:4101`)
  - `BANK_SERVICE_URL` (default `http://localhost:4102`)
- Simulator panel in UI calls `/api/simulators/mpesa/state` and `/api/simulators/bank/state`.
- You must be logged in to call `/api/simulators/*` (protected by `proxy.ts`).

# Muungano – ILP-Based Cross-Border Payroll Infrastructure

Muungano demonstrates a programmable cross-border payroll flow where salary payout and obligation routing occur as one financial event.

## Scenario

- Employer country: Malawi
- Worker country: Kenya
- Currency flow: MWK → KES

## Stack

- Next.js (App Router) + TypeScript
- Rafiki / Open Payments integration service (with mock mode for local demo)
- Interledger connector layer (simulated container)
- PostgreSQL
- Redis
- Docker Compose

## Architecture

Employer Dashboard  
→ Muungano Payroll Engine  
→ Rafiki Payment Node (sender)  
→ ILP Connector Network  
→ Rafiki Payment Node (receiver)  
→ Financial Institution Simulators

## Project Structure

```
app/
	page.tsx
	dashboard/page.tsx
	api/payroll/run/route.ts
	api/payments/quote/route.ts
	api/payments/send/route.ts
	api/distribution/route.ts

components/
	PayrollForm.tsx
	SplitDisplay.tsx
	TransactionLog.tsx

services/
	payrollService.ts
	rafikiService.ts
	distributionService.ts
	walletService.ts

config/
	env.ts
	rafiki.ts

database/schema.sql
simulators/*
docker-compose.yml
```

## API Endpoints

- `POST /api/payroll/run`
  - input: `employeeName`, `salaryAmount`, `destinationPointer`
  - flow: split calculation → quote creation → payment send → settlement status → obligation distribution → transaction log

- `POST /api/payments/quote`
  - creates a quote through `rafikiService`

- `POST /api/payments/send`
  - initiates outgoing payment and checks payment status

- `POST /api/distribution`
  - routes post-settlement funds to obligations

## Split Rules

- 40% personal wallet (`/credit`)
- 25% family remittance (`/transfer`)
- 15% savings SACCO (`/deposit`)
- 10% school fees (`/payment`)
- 10% insurance premium (`/premium`)

## Local Run

### 1) Install root dependencies

```bash
npm install
```

### 2) Start full stack

```bash
docker compose up --build
```

### 3) Open dashboard

Visit `http://localhost:3000/dashboard`

## Demo Flow (5–10s)

1. Open dashboard
2. Click **Run Payroll**
3. Payroll engine calculates splits
4. Rafiki quote is created
5. Outgoing payment is initiated (mock/live mode)
6. Settlement status is confirmed
7. Distribution service routes to simulators
8. Simulator logs and dashboard transaction log show completion

## Environment Variables

Key variables (with defaults in `config/env.ts`):

- `MWK_TO_KES_RATE=0.013`
- `RAFIKI_MOCK_MODE=true`
- `RAFIKI_SENDER_BASE_URL`
- `RAFIKI_RECEIVER_BASE_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `MPESA_SERVICE_URL`
- `BANK_SERVICE_URL`
- `SACCO_SERVICE_URL`
- `INSURANCE_SERVICE_URL`

## Notes

- Rafiki/ILP containers in this prototype are scaffold placeholders to keep the demo lightweight.
- `RAFIKI_MOCK_MODE=false` can be used to connect real Rafiki Open Payments endpoints.

export type SimulatorServiceKey = "mpesa" | "bank" | "sacco" | "insurance";

export type LedgerEntry = {
  action: string;
  receivedAt: string;
  amount?: number;
  employeeName?: string;
  obligation?: string;
  currency?: string;
};

export type MpesaState = {
  service: "mpesa-service";
  balance: number;
  latestTransactions: LedgerEntry[];
};

export type BankState = {
  service: "bank-service";
  accountBalance: number;
  latestTransactions: LedgerEntry[];
};

export type SaccoState = {
  service: "sacco-service";
  savingsBalance: number;
  latestDeposits: LedgerEntry[];
};

export type InsuranceState = {
  service: "insurance-service";
  totalPremiums: number;
  latestPremiums: LedgerEntry[];
};

type HealthResponse = {
  status: string;
  service: string;
};

type ActionResponse<TState> = {
  success: boolean;
  state: TState;
};

const simulatorBaseUrl: Record<SimulatorServiceKey, string> = {
  mpesa: process.env.NEXT_PUBLIC_MPESA_SERVICE_URL ?? "http://localhost:4101",
  bank: process.env.NEXT_PUBLIC_BANK_SERVICE_URL ?? "http://localhost:4102",
  sacco: process.env.NEXT_PUBLIC_SACCO_SERVICE_URL ?? "http://localhost:4103",
  insurance:
    process.env.NEXT_PUBLIC_INSURANCE_SERVICE_URL ?? "http://localhost:4104",
};

const request = async <T>(
  url: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return data;
};

export const checkHealth = (service: SimulatorServiceKey) => {
  return request<HealthResponse>(`${simulatorBaseUrl[service]}/health`);
};

export const getMpesaState = () => {
  return request<MpesaState>(`${simulatorBaseUrl.mpesa}/state`);
};

export const getBankState = () => {
  return request<BankState>(`${simulatorBaseUrl.bank}/state`);
};

export const getSaccoState = () => {
  return request<SaccoState>(`${simulatorBaseUrl.sacco}/state`);
};

export const getInsuranceState = () => {
  return request<InsuranceState>(`${simulatorBaseUrl.insurance}/state`);
};

const postAction = <TState>(service: SimulatorServiceKey, path: string, body: unknown) => {
  return request<ActionResponse<TState>>(`${simulatorBaseUrl[service]}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};

export const creditMpesaWallet = (payload: {
  employeeName: string;
  amount: number;
  currency: string;
  obligation?: string;
}) => {
  return postAction<MpesaState>("mpesa", "/credit", payload);
};

export const submitBankTransfer = (payload: {
  employeeName: string;
  amount: number;
  currency: string;
  obligation?: string;
}) => {
  return postAction<BankState>("bank", "/transfer", payload);
};

export const submitBankPayment = (payload: {
  employeeName: string;
  amount: number;
  currency: string;
  obligation?: string;
}) => {
  return postAction<BankState>("bank", "/payment", payload);
};

export const submitSaccoDeposit = (payload: {
  employeeName: string;
  amount: number;
  currency: string;
  obligation?: string;
}) => {
  return postAction<SaccoState>("sacco", "/deposit", payload);
};

export const submitInsurancePremium = (payload: {
  employeeName: string;
  amount: number;
  currency: string;
  obligation?: string;
}) => {
  return postAction<InsuranceState>("insurance", "/premium", payload);
};

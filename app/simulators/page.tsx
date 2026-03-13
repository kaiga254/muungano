"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import {
  checkHealth,
  creditMpesaWallet,
  getBankState,
  getInsuranceState,
  getMpesaState,
  getSaccoState,
  submitBankPayment,
  submitBankTransfer,
  submitInsurancePremium,
  submitSaccoDeposit,
  type BankState,
  type InsuranceState,
  type LedgerEntry,
  type MpesaState,
  type SaccoState,
  type SimulatorServiceKey,
} from "@/services/simulatorClient";

type ServiceStatus = "loading" | "online" | "offline";
type ToastState = {
  open: boolean;
  title: string;
  description: string;
};

const STORAGE_KEYS = {
  mpesa: "muungano.sim.mpesa",
  bank: "muungano.sim.bank",
  sacco: "muungano.sim.sacco",
  insurance: "muungano.sim.insurance",
} as const;

const numberFormatter = new Intl.NumberFormat();

const safeReadState = <T,>(key: string): T | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeState = (key: string, value: unknown) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
};

const moneyLabel = (value: number, currency: string) => {
  return `${currency} ${numberFormatter.format(value)}`;
};

const StatusBadge = ({ status }: { status: ServiceStatus }) => {
  const variant =
    status === "online"
      ? "success"
      : status === "offline"
        ? "destructive"
        : "secondary";

  return <Badge variant={variant}>{status}</Badge>;
};

const Ledger = ({
  items,
  emptyText,
  onSelect,
}: {
  items: LedgerEntry[];
  emptyText: string;
  onSelect: (item: LedgerEntry) => void;
}) => {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Action</TableHead>
          <TableHead>Person</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => (
          <TableRow
            key={`${item.receivedAt}-${item.action}-${index}`}
            className="cursor-pointer"
            onClick={() => onSelect(item)}
          >
            <TableCell>
              <Badge variant="outline">{item.action}</Badge>
            </TableCell>
            <TableCell className="font-medium">
              {item.employeeName ?? "N/A"}
            </TableCell>
            <TableCell>
              {moneyLabel(Number(item.amount) || 0, item.currency || "KES")}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(item.receivedAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

type ActionFormProps = {
  title: string;
  description: string;
  submitLabel: string;
  nameValue: string;
  amountValue: string;
  amountLabel?: string;
  onNameChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onSubmit: () => void;
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
};

function ActionForm({
  title,
  description,
  submitLabel,
  nameValue,
  amountValue,
  amountLabel = "Amount",
  onNameChange,
  onAmountChange,
  onSubmit,
  buttonVariant = "default",
}: ActionFormProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-border/70 bg-background/70 p-4">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>{title} target</Label>
          <Input
            value={nameValue}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>{amountLabel}</Label>
          <Input
            value={amountValue}
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </div>
      </div>
      <Button
        type="button"
        variant={buttonVariant}
        onClick={onSubmit}
        className="w-full sm:w-fit"
      >
        {submitLabel}
      </Button>
    </div>
  );
}

export default function SimulatorsPage() {
  const [status, setStatus] = useState<
    Record<SimulatorServiceKey, ServiceStatus>
  >({
    mpesa: "loading",
    bank: "loading",
    sacco: "loading",
    insurance: "loading",
  });

  const [mpesaState, setMpesaState] = useState<MpesaState>(
    () =>
      safeReadState<MpesaState>(STORAGE_KEYS.mpesa) ?? {
        service: "mpesa-service",
        balance: 0,
        latestTransactions: [],
      },
  );
  const [bankState, setBankState] = useState<BankState>(
    () =>
      safeReadState<BankState>(STORAGE_KEYS.bank) ?? {
        service: "bank-service",
        accountBalance: 0,
        latestTransactions: [],
      },
  );
  const [saccoState, setSaccoState] = useState<SaccoState>(
    () =>
      safeReadState<SaccoState>(STORAGE_KEYS.sacco) ?? {
        service: "sacco-service",
        savingsBalance: 0,
        latestDeposits: [],
      },
  );
  const [insuranceState, setInsuranceState] = useState<InsuranceState>(
    () =>
      safeReadState<InsuranceState>(STORAGE_KEYS.insurance) ?? {
        service: "insurance-service",
        totalPremiums: 0,
        latestPremiums: [],
      },
  );

  const [mpesaForm, setMpesaForm] = useState({
    employeeName: "Worker",
    amount: "1200",
    currency: "KES",
  });
  const [bankTransferForm, setBankTransferForm] = useState({
    employeeName: "Family",
    amount: "900",
    currency: "KES",
  });
  const [bankPaymentForm, setBankPaymentForm] = useState({
    employeeName: "School",
    amount: "600",
    currency: "KES",
  });
  const [saccoForm, setSaccoForm] = useState({
    employeeName: "Savings",
    amount: "450",
    currency: "KES",
  });
  const [insuranceForm, setInsuranceForm] = useState({
    employeeName: "Cover",
    amount: "300",
    currency: "KES",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("mpesa");
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [toastState, setToastState] = useState<ToastState>({
    open: false,
    title: "",
    description: "",
  });

  useEffect(() => {
    const sync = async () => {
      const services: SimulatorServiceKey[] = [
        "mpesa",
        "bank",
        "sacco",
        "insurance",
      ];
      await Promise.all(
        services.map(async (service) => {
          try {
            await checkHealth(service);
            setStatus((prev) => ({ ...prev, [service]: "online" }));
          } catch {
            setStatus((prev) => ({ ...prev, [service]: "offline" }));
          }
        }),
      );

      try {
        const [latestMpesa, latestBank, latestSacco, latestInsurance] =
          await Promise.all([
            getMpesaState(),
            getBankState(),
            getSaccoState(),
            getInsuranceState(),
          ]);

        setMpesaState(latestMpesa);
        setBankState(latestBank);
        setSaccoState(latestSacco);
        setInsuranceState(latestInsurance);

        writeState(STORAGE_KEYS.mpesa, latestMpesa);
        writeState(STORAGE_KEYS.bank, latestBank);
        writeState(STORAGE_KEYS.sacco, latestSacco);
        writeState(STORAGE_KEYS.insurance, latestInsurance);
      } catch {
        setMessage(
          "Some simulator states could not be refreshed. Showing cached values where available.",
        );
      }
    };

    void sync();
  }, []);

  const offlineCount = useMemo(
    () => Object.values(status).filter((value) => value === "offline").length,
    [status],
  );

  const runAction = async (runner: () => Promise<void>) => {
    setMessage(null);
    try {
      await runner();
      setMessage("Simulator action successful.");
      setToastState({
        open: true,
        title: "Action completed",
        description: "Simulator state updated successfully.",
      });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Simulator action failed.";
      setMessage(description);
      setToastState({
        open: true,
        title: "Action failed",
        description,
      });
    }
  };

  return (
    <ToastProvider>
      <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-8">
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
            <div className="space-y-3">
              <Badge
                variant="secondary"
                className="w-fit rounded-full px-3 py-1"
              >
                Localhost Simulator Console
              </Badge>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Financial Simulator Console
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  Mimicked interfaces for MPESA, bank, SACCO, and insurance
                  services with persistent state and live browser interaction.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard">
                <Button variant="outline">Back to Dashboard</Button>
              </Link>
              <Link href="/">
                <Button variant="ghost">Home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Card className="xl:col-span-2">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Offline services</p>
              <p className="mt-1 text-3xl font-semibold">{offlineCount}</p>
            </CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">MPESA wallet</p>
              <p className="mt-1 text-3xl font-semibold">
                {moneyLabel(mpesaState.balance, "KES")}
              </p>
            </CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Bank flow total</p>
              <p className="mt-1 text-3xl font-semibold">
                {moneyLabel(bankState.accountBalance, "KES")}
              </p>
            </CardContent>
          </Card>
        </section>

        {message ? (
          <Card className="border-border/70 bg-muted/40">
            <CardContent className="p-4 text-sm text-muted-foreground">
              {message}
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="mpesa">MPESA</TabsTrigger>
            <TabsTrigger value="bank">Bank</TabsTrigger>
            <TabsTrigger value="sacco">SACCO</TabsTrigger>
            <TabsTrigger value="insurance">Insurance</TabsTrigger>
          </TabsList>

          <TabsContent value="mpesa">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>MPESA Wallet</CardTitle>
                    <CardDescription>
                      Balance and recent wallet credits.
                    </CardDescription>
                  </div>
                  <StatusBadge status={status.mpesa} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">
                    Current balance
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {moneyLabel(mpesaState.balance, "KES")}
                  </p>
                </div>
                <ActionForm
                  title="Wallet credit"
                  description="Simulate mobile wallet funding for the worker."
                  submitLabel="Credit Wallet"
                  nameValue={mpesaForm.employeeName}
                  amountValue={mpesaForm.amount}
                  onNameChange={(value) =>
                    setMpesaForm((prev) => ({ ...prev, employeeName: value }))
                  }
                  onAmountChange={(value) =>
                    setMpesaForm((prev) => ({ ...prev, amount: value }))
                  }
                  onSubmit={() => {
                    void runAction(async () => {
                      const result = await creditMpesaWallet({
                        employeeName: mpesaForm.employeeName,
                        amount: Number(mpesaForm.amount) || 0,
                        currency: mpesaForm.currency,
                        obligation: "Personal Wallet",
                      });
                      setMpesaState(result.state);
                      writeState(STORAGE_KEYS.mpesa, result.state);
                    });
                  }}
                />
                <Ledger
                  items={mpesaState.latestTransactions}
                  emptyText="No MPESA transactions yet."
                  onSelect={setSelectedEntry}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bank">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Bank Interface</CardTitle>
                    <CardDescription>
                      Family transfers and school fee disbursements.
                    </CardDescription>
                  </div>
                  <StatusBadge status={status.bank} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">
                    Account flow total
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {moneyLabel(bankState.accountBalance, "KES")}
                  </p>
                </div>
                <ActionForm
                  title="Family remittance"
                  description="Simulate a transfer out to a family beneficiary."
                  submitLabel="Run Transfer"
                  nameValue={bankTransferForm.employeeName}
                  amountValue={bankTransferForm.amount}
                  buttonVariant="outline"
                  onNameChange={(value) =>
                    setBankTransferForm((prev) => ({
                      ...prev,
                      employeeName: value,
                    }))
                  }
                  onAmountChange={(value) =>
                    setBankTransferForm((prev) => ({ ...prev, amount: value }))
                  }
                  onSubmit={() => {
                    void runAction(async () => {
                      const result = await submitBankTransfer({
                        employeeName: bankTransferForm.employeeName,
                        amount: Number(bankTransferForm.amount) || 0,
                        currency: bankTransferForm.currency,
                        obligation: "Family Remittance",
                      });
                      setBankState(result.state);
                      writeState(STORAGE_KEYS.bank, result.state);
                    });
                  }}
                />
                <ActionForm
                  title="School fee payment"
                  description="Simulate an education payment through the bank rail."
                  submitLabel="Run Payment"
                  nameValue={bankPaymentForm.employeeName}
                  amountValue={bankPaymentForm.amount}
                  buttonVariant="secondary"
                  onNameChange={(value) =>
                    setBankPaymentForm((prev) => ({
                      ...prev,
                      employeeName: value,
                    }))
                  }
                  onAmountChange={(value) =>
                    setBankPaymentForm((prev) => ({ ...prev, amount: value }))
                  }
                  onSubmit={() => {
                    void runAction(async () => {
                      const result = await submitBankPayment({
                        employeeName: bankPaymentForm.employeeName,
                        amount: Number(bankPaymentForm.amount) || 0,
                        currency: bankPaymentForm.currency,
                        obligation: "School Fees",
                      });
                      setBankState(result.state);
                      writeState(STORAGE_KEYS.bank, result.state);
                    });
                  }}
                />
                <Ledger
                  items={bankState.latestTransactions}
                  emptyText="No bank transactions yet."
                  onSelect={setSelectedEntry}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sacco">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>SACCO Savings</CardTitle>
                    <CardDescription>
                      Savings deposits and member accumulation.
                    </CardDescription>
                  </div>
                  <StatusBadge status={status.sacco} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">
                    Savings balance
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {moneyLabel(saccoState.savingsBalance, "KES")}
                  </p>
                </div>
                <ActionForm
                  title="Savings deposit"
                  description="Post a SACCO contribution into the shared member account."
                  submitLabel="Deposit"
                  nameValue={saccoForm.employeeName}
                  amountValue={saccoForm.amount}
                  buttonVariant="outline"
                  onNameChange={(value) =>
                    setSaccoForm((prev) => ({ ...prev, employeeName: value }))
                  }
                  onAmountChange={(value) =>
                    setSaccoForm((prev) => ({ ...prev, amount: value }))
                  }
                  onSubmit={() => {
                    void runAction(async () => {
                      const result = await submitSaccoDeposit({
                        employeeName: saccoForm.employeeName,
                        amount: Number(saccoForm.amount) || 0,
                        currency: saccoForm.currency,
                        obligation: "Savings SACCO",
                      });
                      setSaccoState(result.state);
                      writeState(STORAGE_KEYS.sacco, result.state);
                    });
                  }}
                />
                <Ledger
                  items={saccoState.latestDeposits}
                  emptyText="No SACCO deposits yet."
                  onSelect={setSelectedEntry}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insurance">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Insurance Premiums</CardTitle>
                    <CardDescription>
                      Premium collection and recent payment history.
                    </CardDescription>
                  </div>
                  <StatusBadge status={status.insurance} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                <div className="rounded-lg border border-border/70 bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">
                    Total premiums
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {moneyLabel(insuranceState.totalPremiums, "KES")}
                  </p>
                </div>
                <ActionForm
                  title="Premium payment"
                  description="Collect a simulated premium from the payroll distribution flow."
                  submitLabel="Pay Premium"
                  nameValue={insuranceForm.employeeName}
                  amountValue={insuranceForm.amount}
                  buttonVariant="secondary"
                  onNameChange={(value) =>
                    setInsuranceForm((prev) => ({
                      ...prev,
                      employeeName: value,
                    }))
                  }
                  onAmountChange={(value) =>
                    setInsuranceForm((prev) => ({ ...prev, amount: value }))
                  }
                  onSubmit={() => {
                    void runAction(async () => {
                      const result = await submitInsurancePremium({
                        employeeName: insuranceForm.employeeName,
                        amount: Number(insuranceForm.amount) || 0,
                        currency: insuranceForm.currency,
                        obligation: "Insurance Premium",
                      });
                      setInsuranceState(result.state);
                      writeState(STORAGE_KEYS.insurance, result.state);
                    });
                  }}
                />
                <Ledger
                  items={insuranceState.latestPremiums}
                  emptyText="No premium transactions yet."
                  onSelect={setSelectedEntry}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={Boolean(selectedEntry)}
          onOpenChange={(open) => !open && setSelectedEntry(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transaction details</DialogTitle>
              <DialogDescription>
                Expanded simulator ledger entry information.
              </DialogDescription>
            </DialogHeader>
            {selectedEntry ? (
              <div className="grid gap-3 text-sm">
                <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
                  <div className="text-muted-foreground">Action</div>
                  <div className="font-medium">{selectedEntry.action}</div>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
                  <div className="text-muted-foreground">Employee / target</div>
                  <div className="font-medium">
                    {selectedEntry.employeeName ?? "N/A"}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
                  <div className="text-muted-foreground">Amount</div>
                  <div className="font-medium">
                    {moneyLabel(
                      Number(selectedEntry.amount) || 0,
                      selectedEntry.currency || "KES",
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
                  <div className="text-muted-foreground">Received at</div>
                  <div className="font-medium">
                    {new Date(selectedEntry.receivedAt).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
                  <div className="text-muted-foreground">Obligation</div>
                  <div className="font-medium">
                    {selectedEntry.obligation ?? "Not provided"}
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Toast
          open={toastState.open}
          onOpenChange={(open) => setToastState((prev) => ({ ...prev, open }))}
        >
          <ToastTitle>{toastState.title}</ToastTitle>
          <ToastDescription>{toastState.description}</ToastDescription>
          <ToastClose>×</ToastClose>
        </Toast>
        <ToastViewport />
      </main>
    </ToastProvider>
  );
}

import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./currency";

// =============================================================
// Reusable primitives
// =============================================================

const currency = z.enum(["KES", "MWK", "USD"] as [string, ...string[]]);
const positiveAmount = z.number().positive("Amount must be positive.");
const phoneNumber = z
	.string()
	.min(8, "Phone number too short.")
	.regex(/^\+?[\d\s\-()]{8,20}$/, "Invalid phone number format.");
const pinCode = z.string().length(6, "PIN must be exactly 6 digits.").regex(/^\d{6}$/, "PIN must be numeric.");

// =============================================================
// Auth validators
// =============================================================

export const RegisterSchema = z.object({
	fullName: z.string().min(2, "Full name is required.").max(120),
	email: z.string().email("Invalid email address.").toLowerCase(),
	phone: phoneNumber,
	password: z.string().min(8, "Password must be at least 8 characters."),
	country: z.string().min(2, "Country is required.").max(4).toUpperCase(),
});

export const LoginSchema = z.object({
	email: z.string().email().toLowerCase(),
	password: z.string().min(1, "Password is required."),
});

export const VerifyPhoneSchema = z.object({
	userId: z.string().uuid(),
	code: z.string().length(6),
});

export const SetPinSchema = z.object({
	pin: pinCode,
	currentPin: z.string().optional(),
});

// =============================================================
// KYC validators
// =============================================================

export const KycSubmitSchema = z.object({
	fullName: z.string().min(2).max(120),
	nationalId: z.string().min(4).max(30),
	dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date format must be YYYY-MM-DD."),
	country: z.string().min(2).max(4).toUpperCase(),
});

// =============================================================
// Wallet validators
// =============================================================

export const CreateWalletSchema = z.object({
	currency,
	pin: pinCode,
});

// =============================================================
// Deposit validators
// =============================================================

export const CreateDepositSchema = z.object({
	walletId: z.string().uuid(),
	amount: positiveAmount,
	method: z.enum(["bank", "mobile_money"]),
	idempotencyKey: z.string().max(128).optional(),
});

export const ConfirmDepositSchema = z.object({
	depositId: z.string().uuid(),
	reference: z.string().min(1),
});

// =============================================================
// Quote validators
// =============================================================

export const CreateQuoteSchema = z.object({
	sourceCurrency: currency,
	destinationCurrency: currency,
	sourceAmount: positiveAmount,
})
	.refine((d) => d.sourceCurrency !== d.destinationCurrency, {
		message: "Source and destination currencies must be different.",
	});

// =============================================================
// Payment validators
// =============================================================

export const SendPaymentSchema = z.object({
	quoteId: z.string().uuid(),
	pin: pinCode,
	receiverIdentifier: z.string().min(1, "Receiver identifier is required."),
	receiverType: z.enum(["phone", "ilp_address", "wallet_id"]),
	idempotencyKey: z.string().max(128).optional(),
});

// =============================================================
// Internal transfer validators
// =============================================================

export const InternalTransferSchema = z.object({
	quoteId: z.string().uuid(),
	pin: pinCode,
	sourceWalletId: z.string().uuid(),
	destWalletId: z.string().uuid(),
	idempotencyKey: z.string().max(128).optional(),
});

// =============================================================
// Withdrawal validators
// =============================================================

export const CreateWithdrawalSchema = z.object({
	walletId: z.string().uuid(),
	amount: positiveAmount,
	destinationType: z.enum(["bank", "mobile_money"]),
	destinationDetails: z.record(z.string(), z.string()),
	pin: pinCode,
	idempotencyKey: z.string().max(128).optional(),
});

// =============================================================
// Pagination
// =============================================================

export const PaginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).default(0),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type VerifyPhoneInput = z.infer<typeof VerifyPhoneSchema>;
export type SetPinInput = z.infer<typeof SetPinSchema>;
export type KycSubmitInput = z.infer<typeof KycSubmitSchema>;
export type CreateWalletInput = z.infer<typeof CreateWalletSchema>;
export type CreateDepositInput = z.infer<typeof CreateDepositSchema>;
export type ConfirmDepositInput = z.infer<typeof ConfirmDepositSchema>;
export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;
export type SendPaymentInput = z.infer<typeof SendPaymentSchema>;
export type InternalTransferInput = z.infer<typeof InternalTransferSchema>;
export type CreateWithdrawalInput = z.infer<typeof CreateWithdrawalSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;

// Make sure all supported currencies are validated
const _check: typeof SUPPORTED_CURRENCIES[number] = "KES";
void _check;

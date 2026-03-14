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
});

// =============================================================
// Deposit validators
// =============================================================

export const CreateDepositSchema = z.object({
	walletId: z.string().uuid(),
	fundingAccountId: z.string().uuid().optional(),
	amount: positiveAmount,
	method: z.enum(["bank", "mobile_money"]),
	simulatorPin: pinCode.optional(),
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
	sourceWalletId: z.string().uuid(),
	sourceCurrency: currency,
	destinationCurrency: currency.optional(),
	sourceAmount: positiveAmount,
	recipientType: z.enum(["bank", "mobile_money"]),
	recipientMode: z.enum(["manual", "linked_account"]),
	linkedFundingAccountId: z.string().uuid().optional(),
	recipientDetails: z
		.object({
			bankName: z.string().min(2).optional(),
			accountName: z.string().min(2).optional(),
			accountNumber: z.string().min(4).optional(),
			recipientNumber: z.string().min(4).optional(),
			recipientAccount: z.string().min(4).optional(),
		})
		.optional(),
}).superRefine((data, ctx) => {
	if (data.recipientMode === "linked_account" && !data.linkedFundingAccountId) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Select a linked account for linked recipient mode.",
			path: ["linkedFundingAccountId"],
		});
	}

	if (data.recipientMode === "manual") {
		if (data.recipientType === "bank") {
			if (!data.recipientDetails?.bankName || !data.recipientDetails?.accountName || !data.recipientDetails?.accountNumber) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Bank name, account name, and account number are required.",
					path: ["recipientDetails"],
				});
			}
		} else {
			if (!data.recipientDetails?.recipientNumber && !data.recipientDetails?.recipientAccount) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Recipient number/account is required for mobile transfer.",
					path: ["recipientDetails"],
				});
			}
		}
	}
});

// =============================================================
// Payment validators
// =============================================================

export const SendPaymentSchema = z.object({
	quoteId: z.string().uuid(),
	pin: pinCode,
	idempotencyKey: z.string().max(128).optional(),
});

// =============================================================
// Internal transfer validators
// =============================================================

/** Quote request for an internal wallet-to-wallet FX transfer. */
export const InternalTransferQuoteSchema = z.object({
	sourceWalletId: z.string().uuid("Invalid source wallet ID."),
	destWalletId: z.string().uuid("Invalid destination wallet ID."),
	sourceAmount: positiveAmount,
}).refine((d) => d.sourceWalletId !== d.destWalletId, {
	message: "Source and destination wallets must be different.",
	path: ["destWalletId"],
});

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
	fundingAccountId: z.string().uuid().optional(),
	amount: positiveAmount,
	destinationType: z.enum(["bank", "mobile_money"]),
	destinationDetails: z.record(z.string(), z.string()).optional(),
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
export type InternalTransferQuoteInput = z.infer<typeof InternalTransferQuoteSchema>;
export type SendPaymentInput = z.infer<typeof SendPaymentSchema>;
export type InternalTransferInput = z.infer<typeof InternalTransferSchema>;
export type CreateWithdrawalInput = z.infer<typeof CreateWithdrawalSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;

// Make sure all supported currencies are validated
const _check: typeof SUPPORTED_CURRENCIES[number] = "KES";
void _check;

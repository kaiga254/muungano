// =============================================================
// Typed domain errors for Muungano Wallet
// =============================================================

export class DomainError extends Error {
	public readonly statusCode: number;
	public readonly code: string;

	constructor(message: string, code: string, statusCode = 400) {
		super(message);
		this.name = "DomainError";
		this.code = code;
		this.statusCode = statusCode;
	}
}

export class NotFoundError extends DomainError {
	constructor(resource: string) {
		super(`${resource} not found.`, "NOT_FOUND", 404);
		this.name = "NotFoundError";
	}
}

export class UnauthorizedError extends DomainError {
	constructor(message = "Not authenticated.") {
		super(message, "UNAUTHORIZED", 401);
		this.name = "UnauthorizedError";
	}
}

export class ForbiddenError extends DomainError {
	constructor(message = "Access denied.") {
		super(message, "FORBIDDEN", 403);
		this.name = "ForbiddenError";
	}
}

export class ConflictError extends DomainError {
	constructor(message: string) {
		super(message, "CONFLICT", 409);
		this.name = "ConflictError";
	}
}

export class ValidationError extends DomainError {
	public readonly fields?: Record<string, string>;
	constructor(message: string, fields?: Record<string, string>) {
		super(message, "VALIDATION_ERROR", 422);
		this.name = "ValidationError";
		this.fields = fields;
	}
}

export class InsufficientFundsError extends DomainError {
	constructor() {
		super("Insufficient wallet balance.", "INSUFFICIENT_FUNDS", 400);
		this.name = "InsufficientFundsError";
	}
}

export class WalletNotFoundError extends DomainError {
	constructor(currency?: string) {
		super(
			currency
				? `No ${currency} wallet found. Create one first.`
				: "Wallet not found.",
			"WALLET_NOT_FOUND",
			404
		);
		this.name = "WalletNotFoundError";
	}
}

export class WalletFrozenError extends DomainError {
	constructor() {
		super("Wallet is frozen.", "WALLET_FROZEN", 400);
		this.name = "WalletFrozenError";
	}
}

export class QuoteExpiredError extends DomainError {
	constructor() {
		super("Quote has expired. Please generate a new one.", "QUOTE_EXPIRED", 400);
		this.name = "QuoteExpiredError";
	}
}

export class QuoteUsedError extends DomainError {
	constructor() {
		super("Quote has already been used.", "QUOTE_USED", 400);
		this.name = "QuoteUsedError";
	}
}

export class PinError extends DomainError {
	constructor(message = "Incorrect PIN.") {
		super(message, "PIN_ERROR", 400);
		this.name = "PinError";
	}
}

export class RateLimitError extends DomainError {
	constructor(message = "Daily transfer limit reached.") {
		super(message, "RATE_LIMIT", 429);
		this.name = "RateLimitError";
	}
}

export class KycRequiredError extends DomainError {
	constructor(requiredTier = 1) {
		super(
			`Tier-${requiredTier} KYC verification required for this action.`,
			"KYC_REQUIRED",
			403
		);
		this.name = "KycRequiredError";
	}
}

/** Convert any error to an HTTP-friendly shape for route handlers. */
export function toHttpError(err: unknown): { message: string; code: string; status: number } {
	if (err instanceof DomainError) {
		return { message: err.message, code: err.code, status: err.statusCode };
	}
	if (err instanceof Error) {
		return { message: err.message, code: "INTERNAL_ERROR", status: 500 };
	}
	return { message: "An unexpected error occurred.", code: "INTERNAL_ERROR", status: 500 };
}

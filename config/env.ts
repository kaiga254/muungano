const asNumber = (value: string | undefined, fallback: number): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const asBoolean = (value: string | undefined, fallback: boolean): boolean => {
	if (value === undefined) {
		return fallback;
	}

	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

export const env = {
	appName: process.env.APP_NAME ?? "Muungano",
	mwkToKesRate: asNumber(process.env.MWK_TO_KES_RATE, 0.013),
	requestTimeoutMs: asNumber(process.env.REQUEST_TIMEOUT_MS, 8_000),
	rafikiMockMode: asBoolean(process.env.RAFIKI_MOCK_MODE, true),
	rafikiSenderBaseUrl:
		process.env.RAFIKI_SENDER_BASE_URL ?? "http://rafiki-node-malawi:3000",
	rafikiReceiverBaseUrl:
		process.env.RAFIKI_RECEIVER_BASE_URL ?? "http://rafiki-node-kenya:3000",
	rafikiAuthToken: process.env.RAFIKI_AUTH_TOKEN,
	rafikiClientId: process.env.RAFIKI_CLIENT_ID,
	rafikiClientSecret: process.env.RAFIKI_CLIENT_SECRET,
	databaseUrl: process.env.DATABASE_URL,
	redisUrl: process.env.REDIS_URL,
	mpesaServiceUrl: process.env.MPESA_SERVICE_URL ?? "http://localhost:4101",
	bankServiceUrl: process.env.BANK_SERVICE_URL ?? "http://localhost:4102",
	saccoServiceUrl: process.env.SACCO_SERVICE_URL ?? "http://localhost:4103",
	insuranceServiceUrl:
		process.env.INSURANCE_SERVICE_URL ?? "http://localhost:4104",
};

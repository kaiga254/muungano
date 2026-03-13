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
	databaseUrl: process.env.DATABASE_URL ?? "postgresql://neondb_owner:npg_zQmh0XWnx8YD@ep-dark-voice-abgzt26c-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
	redisUrl: process.env.REDIS_URL,
	simulatorApiBasePath:
		process.env.SIMULATOR_API_BASE_PATH ?? "/api/simulators",
	publicSimulatorApiBasePath:
		process.env.NEXT_PUBLIC_SIMULATOR_API_BASE_PATH ?? "/api/simulators",
	// Legacy external simulator service URLs (fallback path)
	mpesaServiceUrl: process.env.MPESA_SERVICE_URL ?? "http://localhost:4101",
	bankServiceUrl: process.env.BANK_SERVICE_URL ?? "http://localhost:4102",
	saccoServiceUrl: process.env.SACCO_SERVICE_URL ?? "http://localhost:4103",
	insuranceServiceUrl:
		process.env.INSURANCE_SERVICE_URL ?? "http://localhost:4104",
	// Auth
	authSecret:
		process.env.AUTH_SECRET ??
		"change-this-in-production-use-a-long-random-secret",
	sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "__muungano_session",
	sessionTtlSeconds: asNumber(process.env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 7), // 7 days
	nodeEnv: process.env.NODE_ENV ?? "development",
};

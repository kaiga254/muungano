import { env } from "./env";

type RafikiNode = {
	baseUrl: string;
	incomingPaymentPath: string;
	outgoingPaymentPath: string;
	quotePath: string;
	outgoingPaymentStatusPath: (paymentId: string) => string;
	tokenPath: string;
};

export const rafikiConfig: {
	sender: RafikiNode;
	receiver: RafikiNode;
	openPaymentsVersion: string;
} = {
	openPaymentsVersion: "1",
	sender: {
		baseUrl: env.rafikiSenderBaseUrl,
		incomingPaymentPath: "/open-payments/incoming-payments",
		outgoingPaymentPath: "/open-payments/outgoing-payments",
		quotePath: "/open-payments/quotes",
		outgoingPaymentStatusPath: (paymentId) => `/open-payments/outgoing-payments/${paymentId}`,
		tokenPath: "/auth/token",
	},
	receiver: {
		baseUrl: env.rafikiReceiverBaseUrl,
		incomingPaymentPath: "/open-payments/incoming-payments",
		outgoingPaymentPath: "/open-payments/outgoing-payments",
		quotePath: "/open-payments/quotes",
		outgoingPaymentStatusPath: (paymentId) => `/open-payments/outgoing-payments/${paymentId}`,
		tokenPath: "/auth/token",
	},
};

export const buildRafikiUrl = (baseUrl: string, path: string): string => {
	return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
};

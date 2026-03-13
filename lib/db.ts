import { Pool, type PoolClient } from "pg";
import { env } from "@/config/env";

let pool: Pool | undefined;

export const getPool = (): Pool => {
	if (!env.databaseUrl) {
		throw new Error(
			"DATABASE_URL is required. Set it to your Neon connection string."
		);
	}

	if (!pool) {
		pool = new Pool({
			connectionString: env.databaseUrl,
			max: 10,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 5_000,
			ssl:
				env.databaseUrl.includes("neon.tech") ||
				env.databaseUrl.includes("sslmode=require")
					? { rejectUnauthorized: true }
					: undefined,
		});
	}

	return pool;
};

/**
 * Run a single parameterized query using the shared pool.
 */
export const query = async <T = Record<string, unknown>>(
	text: string,
	params?: unknown[]
): Promise<T[]> => {
	const db = getPool();
	const result = await db.query(text, params);
	return result.rows as T[];
};

/**
 * Run a set of queries inside a single serializable transaction.
 * Rolls back automatically if the callback throws.
 */
export const withTransaction = async <T>(
	callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
	const db = getPool();
	const client = await db.connect();
	try {
		await client.query("BEGIN");
		const result = await callback(client);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
};

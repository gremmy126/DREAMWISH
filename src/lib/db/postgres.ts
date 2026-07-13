import postgres from "postgres";

type PostgresClient = ReturnType<typeof postgres>;

let client: PostgresClient | null = null;

export function hasPostgresStorage() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPostgres(): PostgresClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for durable storage.");
  }

  client ??= postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false
  });
  return client;
}

export async function closePostgresForTests() {
  const current = client;
  client = null;
  if (current) await current.end({ timeout: 1 });
}

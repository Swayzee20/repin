import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

interface DatabaseGlobals {
  repinDatabase?: Database;
  repinPool?: Pool;
}

const databaseGlobals = globalThis as typeof globalThis & DatabaseGlobals;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return databaseUrl;
}

export function getDatabase() {
  if (!databaseGlobals.repinPool) {
    databaseGlobals.repinPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
  }

  databaseGlobals.repinDatabase ??= drizzle(databaseGlobals.repinPool, {
    schema,
  });

  return databaseGlobals.repinDatabase;
}

export async function checkDatabaseConnection() {
  await getDatabase().execute(sql`select 1`);
}

export { users } from "./schema";

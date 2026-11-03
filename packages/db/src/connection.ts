import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

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
    const isVercelRuntime = Boolean(process.env.VERCEL);
    databaseGlobals.repinPool = new Pool({
      allowExitOnIdle: isVercelRuntime,
      connectionString: getDatabaseUrl(),
      // A Vercel instance must not reserve most of Supabase's session-pool
      // capacity. Queries still share this singleton and queue briefly when a
      // request performs independent reads concurrently.
      max: isVercelRuntime ? 1 : 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: isVercelRuntime ? 5_000 : 30_000,
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

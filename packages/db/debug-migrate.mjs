import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

try {
  await migrate(db, {
    migrationsFolder: "./drizzle",
  });

  console.log("✅ Migration succeeded");
} catch (error) {
  console.error("❌ Migration failed");
  console.error(error);
} finally {
  await pool.end();
}

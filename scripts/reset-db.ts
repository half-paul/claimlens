import { pool, resetDb } from "../lib/db";

async function main() {
  await resetDb();
  await pool.end();
  console.log("Database reset complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

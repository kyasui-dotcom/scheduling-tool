import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db/index.ts";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Backfilling booking.visit_number based on guest_email order...");
  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY LOWER(guest_email)
        ORDER BY start_time, created_at
      ) AS rn
      FROM booking
      WHERE status = 'confirmed'
    )
    UPDATE booking SET visit_number = ranked.rn
    FROM ranked
    WHERE booking.id = ranked.id
    RETURNING booking.id
  `);
  const rowsUpdated = Array.isArray(result)
    ? result.length
    : (result as { rowCount?: number }).rowCount ?? "?";
  console.log(`Updated rows: ${rowsUpdated}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

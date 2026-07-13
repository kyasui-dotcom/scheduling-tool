import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * One-time admin: backfill visit_number for all confirmed bookings, ranked by
 * (LOWER(guest_email)) ORDER BY start_time. Idempotent — running again just
 * recomputes the same values.
 *
 * Auth: any signed-in user (deployment is single-org).
 * Usage: GET /api/admin/backfill-visit-numbers
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
    `);
    // neon-http returns { rowCount, rows, ... }
    const updated =
      (result as { rowCount?: number }).rowCount ??
      (Array.isArray(result) ? result.length : "unknown");
    return NextResponse.json({ success: true, updated });
  } catch (err) {
    console.error("[backfill-visit-numbers] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

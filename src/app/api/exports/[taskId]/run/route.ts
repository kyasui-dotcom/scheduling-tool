import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, eventTypes, exportTasks, users } from "@/lib/db/schema";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { canManageEventsOf } from "@/lib/auth-helpers";
import { appendRowsToSheet } from "@/lib/google-sheets";
import { buildBookingRow, BOOKING_ROW_HEADER } from "@/lib/booking-row";
import { subDays } from "date-fns";

const SHEETS_WRITER_EMAIL =
  process.env.SHEETS_WRITER_EMAIL || "k.yasui@raksul.com";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [task] = await db
    .select()
    .from(exportTasks)
    .where(eq(exportTasks.id, taskId));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await canManageEventsOf({
    viewerUserId: session.user.id,
    targetUserId: task.ownerUserId,
  });
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Build booking query with task filters
  const conds = [];
  if (task.eventTypeId) conds.push(eq(bookings.eventTypeId, task.eventTypeId));
  if (task.assigneeUserId)
    conds.push(eq(bookings.assignedUserId, task.assigneeUserId));
  if (task.status !== "all") {
    conds.push(
      eq(bookings.status, task.status as "confirmed" | "cancelled" | "rescheduled")
    );
  }
  if (task.daysBack) {
    const cutoff = subDays(new Date(), task.daysBack);
    conds.push(gte(bookings.startTime, cutoff));
  } else {
    if (task.fromDate)
      conds.push(gte(bookings.startTime, new Date(`${task.fromDate}T00:00:00`)));
    if (task.toDate)
      conds.push(lte(bookings.startTime, new Date(`${task.toDate}T23:59:59`)));
  }

  const rows = await db
    .select({
      booking: bookings,
      eventType: eventTypes,
      assignee: users,
    })
    .from(bookings)
    .innerJoin(eventTypes, eq(bookings.eventTypeId, eventTypes.id))
    .leftJoin(users, eq(bookings.assignedUserId, users.id))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(bookings.startTime));

  // Resolve writer account
  const [writer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SHEETS_WRITER_EMAIL));
  if (!writer) {
    await db
      .update(exportTasks)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: "error",
        lastRunError: `Sheets writer (${SHEETS_WRITER_EMAIL}) not signed up`,
        lastRunRowCount: 0,
      })
      .where(eq(exportTasks.id, taskId));
    return NextResponse.json(
      { error: `Sheets writer (${SHEETS_WRITER_EMAIL}) not signed up` },
      { status: 500 }
    );
  }

  // Prepare rows
  const dataRows = rows.map(({ booking, eventType, assignee }) =>
    buildBookingRow({ booking, eventType, assignee })
  );
  const toAppend = task.includeHeader
    ? [BOOKING_ROW_HEADER, ...dataRows]
    : dataRows;

  try {
    if (toAppend.length > 0) {
      await appendRowsToSheet({
        userId: writer.id,
        spreadsheetUrl: task.spreadsheetUrl,
        rows: toAppend,
        sheetName: task.sheetName || undefined,
      });
    }
    await db
      .update(exportTasks)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: "success",
        lastRunError: null,
        lastRunRowCount: dataRows.length,
      })
      .where(eq(exportTasks.id, taskId));
    return NextResponse.json({ appended: dataRows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sheets append failed";
    console.error("[exports run] failed:", err);
    await db
      .update(exportTasks)
      .set({
        lastRunAt: new Date(),
        lastRunStatus: "error",
        lastRunError: message,
        lastRunRowCount: 0,
      })
      .where(eq(exportTasks.id, taskId));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

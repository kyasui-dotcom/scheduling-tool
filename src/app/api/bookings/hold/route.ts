import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookings, eventTypes, eventTypeMembers } from "@/lib/db/schema";
import { and, eq, gt, lt } from "drizzle-orm";
import { addMinutes } from "date-fns";

/**
 * Create a short-lived temporary hold on a slot so other guests can't book
 * it while this guest fills out the confirmation form.
 * Returns { holdId, heldUntil }. Client passes holdId to POST /api/bookings
 * to convert the hold into a confirmed booking.
 */

const HOLD_MINUTES = 10;

const schema = z.object({
  eventTypeId: z.string().uuid(),
  startTime: z.string().datetime(),
  assignedUserId: z.string(),
  guestTimezone: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, data.eventTypeId));
  if (!eventType || !eventType.isActive) {
    return NextResponse.json(
      { error: "Event type not found or inactive" },
      { status: 404 }
    );
  }

  // Verify assignedUserId is a member of this event
  const [member] = await db
    .select({ userId: eventTypeMembers.userId })
    .from(eventTypeMembers)
    .where(
      and(
        eq(eventTypeMembers.eventTypeId, data.eventTypeId),
        eq(eventTypeMembers.userId, data.assignedUserId)
      )
    );
  if (!member) {
    return NextResponse.json(
      { error: "Assigned user is not a member of this event" },
      { status: 400 }
    );
  }

  const startTime = new Date(data.startTime);
  const endTime = addMinutes(startTime, eventType.durationMinutes);
  const now = new Date();
  const heldUntil = addMinutes(now, HOLD_MINUTES);

  // Reject if this slot already conflicts on the assignee's calendar
  // (either confirmed or an active hold)
  const overlaps = await db
    .select({
      status: bookings.status,
      heldUntil: bookings.heldUntil,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.assignedUserId, data.assignedUserId),
        lt(bookings.startTime, endTime),
        gt(bookings.endTime, startTime)
      )
    );
  const blocking = overlaps.filter(
    (b) =>
      b.status === "confirmed" ||
      (b.status === "held" && b.heldUntil && b.heldUntil > now)
  );
  if (blocking.length > 0) {
    return NextResponse.json(
      { error: "This slot is no longer available" },
      { status: 409 }
    );
  }

  // Insert a placeholder hold booking. Guest fields are filled in on confirm.
  const [held] = await db
    .insert(bookings)
    .values({
      eventTypeId: data.eventTypeId,
      assignedUserId: data.assignedUserId,
      guestCompanyName: "(仮押さえ)",
      guestName: "(仮押さえ)",
      guestEmail: "hold@placeholder.local",
      guestTimezone: data.guestTimezone,
      startTime,
      endTime,
      status: "held",
      heldUntil,
    })
    .returning({ id: bookings.id, heldUntil: bookings.heldUntil });

  return NextResponse.json({
    holdId: held.id,
    heldUntil: held.heldUntil,
    holdMinutes: HOLD_MINUTES,
  });
}

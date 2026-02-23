import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { deleteCalendarEvent } from "@/lib/google-calendar";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const body = await req.json().catch(() => ({}));

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === "cancelled") {
    return NextResponse.json(
      { error: "Booking is already cancelled" },
      { status: 400 }
    );
  }

  // Delete Google Calendar event
  if (booking.googleCalendarEventId && booking.assignedUserId) {
    try {
      await deleteCalendarEvent(
        booking.assignedUserId,
        booking.googleCalendarEventId
      );
    } catch (error) {
      console.error("Error deleting calendar event:", error);
    }
  }

  // Update booking status
  const [updated] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: body.reason || undefined,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
    .returning();

  return NextResponse.json(updated);
}

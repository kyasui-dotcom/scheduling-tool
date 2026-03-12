import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, eventTypes, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyGuestToken } from "@/lib/guest-token";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const token = req.nextUrl.searchParams.get("token");

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verify guest token
  if (!token || !verifyGuestToken(bookingId, booking.guestEmail, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, booking.eventTypeId));

  let organizerName = "Organizer";
  let username = "";
  if (booking.assignedUserId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, booking.assignedUserId));
    if (user) {
      organizerName = user.name || "Organizer";
      username = user.username || "";
    }
  }

  return NextResponse.json({
    id: booking.id,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guestTimezone: booking.guestTimezone,
    status: booking.status,
    meetingUrl: booking.meetingUrl,
    meetingPlatform: booking.meetingPlatform,
    eventTitle: eventType?.title || "Meeting",
    organizerName,
    durationMinutes: eventType?.durationMinutes || 30,
    eventTypeId: booking.eventTypeId,
    slug: eventType?.slug || "",
    username,
  });
}

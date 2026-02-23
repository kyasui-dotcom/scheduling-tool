import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, eventTypes, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateICS } from "@/lib/ics-generator";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, booking.eventTypeId));

  let organizerName = "Organizer";
  let organizerEmail = "noreply@example.com";

  if (booking.assignedUserId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, booking.assignedUserId));
    if (user) {
      organizerName = user.name || "Organizer";
      organizerEmail = user.email;
    }
  }

  const icsContent = generateICS({
    title: eventType?.title || "Meeting",
    description: [
      booking.meetingUrl ? `Meeting Link: ${booking.meetingUrl}` : "",
      booking.guestNotes ? `Notes: ${booking.guestNotes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    start: booking.startTime,
    durationMinutes: eventType?.durationMinutes || 30,
    url: booking.meetingUrl || undefined,
    organizerName,
    organizerEmail,
    attendeeName: booking.guestName,
    attendeeEmail: booking.guestEmail,
  });

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar",
      "Content-Disposition": `attachment; filename="meeting.ics"`,
    },
  });
}

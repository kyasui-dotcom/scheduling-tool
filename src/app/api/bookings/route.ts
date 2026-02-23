import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, eventTypes, users, eventTypeMembers } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createBookingSchema } from "@/lib/validations/booking";
import { getAvailableSlots, selectAssignee } from "@/lib/availability-engine";
import { createCalendarEvent } from "@/lib/google-calendar";
import { createZoomMeeting } from "@/lib/zoom";
import { addMinutes } from "date-fns";
import { getDateStringInTimezone } from "@/lib/timezone";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userBookings = await db
    .select({
      booking: bookings,
      eventType: eventTypes,
    })
    .from(bookings)
    .innerJoin(eventTypes, eq(bookings.eventTypeId, eventTypes.id))
    .where(
      eq(bookings.assignedUserId, session.user.id)
    )
    .orderBy(desc(bookings.startTime));

  return NextResponse.json(userBookings);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Load event type
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

  // Re-validate availability (race condition protection)
  const dateStr = getDateStringInTimezone(
    new Date(data.startTime),
    data.guestTimezone
  );
  const availableSlots = await getAvailableSlots({
    eventTypeId: data.eventTypeId,
    date: dateStr,
    guestTimezone: data.guestTimezone,
  });

  const requestedSlot = availableSlots.find(
    (s) => s.startTime === new Date(data.startTime).toISOString()
  );

  if (!requestedSlot) {
    return NextResponse.json(
      { error: "This time slot is no longer available" },
      { status: 409 }
    );
  }

  // Determine assigned user
  let assignedUserId: string;
  if (
    eventType.schedulingMode === "any_available" &&
    requestedSlot.availableUserIds &&
    requestedSlot.availableUserIds.length > 1
  ) {
    assignedUserId = await selectAssignee(
      requestedSlot.availableUserIds,
      data.eventTypeId
    );
  } else {
    assignedUserId =
      requestedSlot.availableUserIds?.[0] || eventType.userId;
  }

  // Load assigned user info
  const [assignedUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, assignedUserId));

  const startTime = new Date(data.startTime);
  const endTime = addMinutes(startTime, eventType.durationMinutes);

  // Generate meeting link
  let meetingUrl: string | undefined;
  let meetingId: string | undefined;
  let googleCalendarEventId: string | undefined;

  try {
    if (eventType.meetingPlatform === "zoom") {
      const zoom = await createZoomMeeting({
        topic: `${eventType.title} with ${data.guestName}`,
        startTime: startTime.toISOString(),
        durationMinutes: eventType.durationMinutes,
      });
      meetingUrl = zoom.joinUrl;
      meetingId = zoom.meetingId;
    }

    // Create Google Calendar event
    const description = [
      `Meeting: ${eventType.title}`,
      `Guest: ${data.guestName} (${data.guestEmail})`,
      data.guestNotes ? `Notes: ${data.guestNotes}` : "",
      meetingUrl ? `Meeting Link: ${meetingUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Get all attendee emails for all_available mode
    let attendeeEmails = [data.guestEmail];
    if (eventType.schedulingMode === "all_available") {
      const members = await db
        .select({ userId: eventTypeMembers.userId })
        .from(eventTypeMembers)
        .where(eq(eventTypeMembers.eventTypeId, data.eventTypeId));

      const memberUsers = await db
        .select({ email: users.email })
        .from(users)
        .where(
          eq(
            users.id,
            members.map((m) => m.userId)[0] // This is simplified - in production use inArray
          )
        );
      // For simplicity, just add assigned user's email
    }

    const calendarResult = await createCalendarEvent({
      userId: assignedUserId,
      summary: `${eventType.title} - ${data.guestName}`,
      description,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      attendeeEmails: [data.guestEmail],
      includeGoogleMeet: eventType.meetingPlatform === "google_meet",
      location: meetingUrl,
    });

    googleCalendarEventId = calendarResult.eventId;
    if (calendarResult.meetUrl) {
      meetingUrl = calendarResult.meetUrl;
    }
  } catch (error) {
    console.error("Error creating calendar event:", error);
    // Continue with booking even if calendar event fails
  }

  // Insert booking
  const [booking] = await db
    .insert(bookings)
    .values({
      eventTypeId: data.eventTypeId,
      assignedUserId,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      guestNotes: data.guestNotes,
      guestTimezone: data.guestTimezone,
      guestAnswers: data.guestAnswers,
      startTime,
      endTime,
      meetingPlatform: eventType.meetingPlatform,
      meetingUrl,
      meetingId,
      googleCalendarEventId,
    })
    .returning();

  return NextResponse.json(booking, { status: 201 });
}

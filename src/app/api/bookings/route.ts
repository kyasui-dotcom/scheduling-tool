import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, eventTypes } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createBookingSchema } from "@/lib/validations/booking";
import {
  getAvailability,
  isFlexibleStartAvailable,
  selectAssignee,
} from "@/lib/availability-engine";
import {
  createCalendarEvent,
  getMultiUserFreeBusy,
} from "@/lib/google-calendar";
import { createZoomMeeting } from "@/lib/zoom";
import { addMinutes } from "date-fns";
import { getDateStringInTimezone } from "@/lib/timezone";

function formatCalendarTitle(
  format: string | null | undefined,
  eventTitle: string,
  company: string,
  guestName: string
): string {
  switch (format) {
    case "company_first":
      return `${company}/${guestName}様 ${eventTitle}`;
    case "company_only":
      return `${company} ${eventTitle}`;
    case "title_first":
    default:
      return `${eventTitle}${company}/${guestName}様`;
  }
}

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
  let availableUserIds: string[] | undefined;

  if (eventType.slotMode === "flexible_start") {
    const flex = await isFlexibleStartAvailable({
      eventTypeId: data.eventTypeId,
      startTimeIso: new Date(data.startTime).toISOString(),
      guestTimezone: data.guestTimezone,
    });
    if (!flex) {
      return NextResponse.json(
        { error: "This start time is no longer available" },
        { status: 409 }
      );
    }
    availableUserIds = flex.availableUserIds;
  } else {
    const result = await getAvailability({
      eventTypeId: data.eventTypeId,
      date: dateStr,
      guestTimezone: data.guestTimezone,
    });
    const requestedSlot = result.slots.find(
      (s) => s.startTime === new Date(data.startTime).toISOString()
    );
    if (!requestedSlot) {
      return NextResponse.json(
        { error: "This time slot is no longer available" },
        { status: 409 }
      );
    }
    availableUserIds = requestedSlot.availableUserIds;
  }

  // Determine assigned user
  let assignedUserId: string;
  if (
    eventType.schedulingMode === "any_available" &&
    availableUserIds &&
    availableUserIds.length > 1
  ) {
    // Defensive re-check: filter to users actually free at the requested time
    // (window aggregation can over-report when users' free windows overlap but
    //  the chosen instant is only free for a subset)
    const reqStart = new Date(data.startTime);
    const reqEnd = addMinutes(reqStart, eventType.durationMinutes);
    const busyMap = await getMultiUserFreeBusy(
      availableUserIds,
      reqStart.toISOString(),
      reqEnd.toISOString()
    );
    const reqStartMs = reqStart.getTime();
    const reqEndMs = reqEnd.getTime();
    const trulyFree = availableUserIds.filter((uid) => {
      const busy = busyMap.get(uid) || [];
      return !busy.some((b) => {
        const bs = new Date(b.start).getTime();
        const be = new Date(b.end).getTime();
        return bs < reqEndMs && be > reqStartMs;
      });
    });
    const finalCandidates = trulyFree.length > 0 ? trulyFree : availableUserIds;
    assignedUserId =
      finalCandidates.length > 1
        ? await selectAssignee(finalCandidates, data.eventTypeId)
        : finalCandidates[0];
  } else {
    assignedUserId = availableUserIds?.[0] || eventType.userId;
  }

  const startTime = new Date(data.startTime);
  const endTime = addMinutes(startTime, eventType.durationMinutes);

  // Generate meeting link
  let meetingUrl: string | undefined;
  let meetingId: string | undefined;
  let googleCalendarEventId: string | undefined;

  try {
    if (eventType.meetingPlatform === "zoom") {
      const zoom = await createZoomMeeting({
        topic: formatCalendarTitle(
          eventType.calendarTitleFormat,
          eventType.title,
          data.guestCompanyName,
          data.guestName
        ),
        startTime: startTime.toISOString(),
        durationMinutes: eventType.durationMinutes,
      });
      meetingUrl = zoom.joinUrl;
      meetingId = zoom.meetingId;
    }

    // Create Google Calendar event
    const description = [
      `Meeting: ${eventType.title}`,
      `Company: ${data.guestCompanyName}`,
      `Guest: ${data.guestName} (${data.guestEmail})`,
      data.guestNotes ? `Notes: ${data.guestNotes}` : "",
      meetingUrl ? `Meeting Link: ${meetingUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const calendarTitle = formatCalendarTitle(
      eventType.calendarTitleFormat,
      eventType.title,
      data.guestCompanyName,
      data.guestName
    );

    // Only the assigned user gets the calendar event.
    // For any_available, other members are NOT invited as attendees so their
    // calendars are not touched.
    const calendarResult = await createCalendarEvent({
      userId: assignedUserId,
      summary: calendarTitle,
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
      guestCompanyName: data.guestCompanyName,
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

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  bookings,
  eventTypes,
  eventTypeMembers,
  users,
} from "@/lib/db/schema";
import { and, eq, desc, sql, lt, gt } from "drizzle-orm";

const SHEETS_WRITER_EMAIL =
  process.env.SHEETS_WRITER_EMAIL || "k.yasui@raksul.com";
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
import { appendRowToSheet } from "@/lib/google-sheets";
import { generateGuestToken } from "@/lib/guest-token";
import { notifySlackNewBooking } from "@/lib/slack";
import { createZoomMeeting } from "@/lib/zoom";
import { addMinutes } from "date-fns";
import { getDateStringInTimezone } from "@/lib/timezone";

const LEGACY_PRESETS: Record<string, string> = {
  title_first: "{title}{company}/{name}様",
  company_first: "{company}/{name}様 {title}",
  company_only: "{company} {title}",
};
const DEFAULT_TEMPLATE = "{title}{company}/{name}様";

function formatCalendarTitle(
  template: string | null | undefined,
  eventTitle: string,
  company: string,
  guestName: string
): string {
  let t = template || DEFAULT_TEMPLATE;
  // Backwards compat: events created before free-text templates may store preset names
  if (LEGACY_PRESETS[t]) t = LEGACY_PRESETS[t];
  return t
    .replaceAll("{title}", eventTitle)
    .replaceAll("{company}", company)
    .replaceAll("{name}", guestName);
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

  const reqStart = new Date(data.startTime);
  const reqEnd = addMinutes(reqStart, eventType.durationMinutes);

  // Fast path: client pre-selected the assignee at slot click.
  // Skip the Google FreeBusy re-check entirely — only do a cheap DB validation:
  //  1. assignedUserId is a member of this event
  //  2. No confirmed booking already overlaps that user's calendar
  let assignedUserId: string | null = null;
  if (data.assignedUserId) {
    const [member] = await db
      .select({ userId: eventTypeMembers.userId })
      .from(eventTypeMembers)
      .where(
        and(
          eq(eventTypeMembers.eventTypeId, data.eventTypeId),
          eq(eventTypeMembers.userId, data.assignedUserId)
        )
      );
    if (member) {
      const conflict = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.assignedUserId, data.assignedUserId),
            eq(bookings.status, "confirmed"),
            lt(bookings.startTime, reqEnd),
            gt(bookings.endTime, reqStart)
          )
        )
        .limit(1);
      if (conflict.length === 0) {
        assignedUserId = data.assignedUserId;
      }
    }
  }

  // Slow fallback path: client did not pre-select (or pre-selected invalid).
  // Run the full availability + assignee selection like before.
  if (!assignedUserId) {
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

    if (
      eventType.schedulingMode === "any_available" &&
      availableUserIds &&
      availableUserIds.length > 1
    ) {
      // Defensive re-check via Google FreeBusy (only when no pre-assignment)
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
      const finalCandidates =
        trulyFree.length > 0 ? trulyFree : availableUserIds;
      assignedUserId =
        finalCandidates.length > 1
          ? await selectAssignee(finalCandidates, data.eventTypeId)
          : finalCandidates[0];
    } else {
      assignedUserId = availableUserIds?.[0] || eventType.userId;
    }
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

    // Build custom question Q&A lines
    const customAnswerLines: string[] = [];
    if (
      Array.isArray(data.guestAnswers) &&
      Array.isArray(eventType.customQuestions)
    ) {
      const qMap = new Map<string, string>();
      for (const q of eventType.customQuestions as Array<{
        id: string;
        question: string;
      }>) {
        if (q?.id) qMap.set(q.id, q.question);
      }
      for (const a of data.guestAnswers) {
        const q = qMap.get(a.questionId) || "(質問)";
        const ans = Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
        const ansStr = String(ans);
        if (ansStr.length > 0) {
          customAnswerLines.push(`■ ${q}\n${ansStr}`);
        }
      }
    }

    // Create Google Calendar event description
    const description = [
      `【${eventType.title}】`,
      `会社名: ${data.guestCompanyName}`,
      `担当者: ${data.guestName}`,
      `メール: ${data.guestEmail}`,
      meetingUrl ? `会議URL: ${meetingUrl}` : "",
      data.guestNotes ? `\n■ お客様メモ\n${data.guestNotes}` : "",
      customAnswerLines.length > 0
        ? `\n===== 予約時の入力内容 =====\n${customAnswerLines.join("\n\n")}`
        : "",
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

  // How many confirmed bookings this guestEmail already has → 何回目
  const [{ prevCount }] = await db
    .select({ prevCount: sql<number>`count(*)::int` })
    .from(bookings)
    .where(
      and(
        sql`LOWER(${bookings.guestEmail}) = LOWER(${data.guestEmail})`,
        eq(bookings.status, "confirmed")
      )
    );
  const visitNumber = (prevCount || 0) + 1;

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
      visitNumber,
      startTime,
      endTime,
      meetingPlatform: eventType.meetingPlatform,
      meetingUrl,
      meetingId,
      googleCalendarEventId,
    })
    .returning();

  // Optional: append to a Google Sheets URL configured on the event type.
  // Non-blocking — failure is logged but the booking still succeeds.
  // Auth: prefers service account from GOOGLE_SPREADSHEET env var; falls back
  // to a fixed writer account (SHEETS_WRITER_EMAIL) when env is not set.
  if (eventType.spreadsheetUrl) {
    try {
      // Resolve fallback writer userId only if env service account is unset.
      let writerUserId: string | undefined;
      if (!process.env.GOOGLE_SPREADSHEET) {
        const [writer] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, SHEETS_WRITER_EMAIL));
        if (!writer) {
          throw new Error(
            `No sheets auth available: set GOOGLE_SPREADSHEET env or sign up ${SHEETS_WRITER_EMAIL}`
          );
        }
        writerUserId = writer.id;
      }

      // Look up the assignee (whose calendar the meeting was created on)
      const [assignee] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, assignedUserId));
      const answersText = (() => {
        if (
          !Array.isArray(data.guestAnswers) ||
          !Array.isArray(eventType.customQuestions)
        ) {
          return "";
        }
        const qMap = new Map<string, string>();
        for (const q of eventType.customQuestions as Array<{
          id: string;
          question: string;
        }>) {
          if (q?.id) qMap.set(q.id, q.question);
        }
        return data.guestAnswers
          .map((a) => {
            const q = qMap.get(a.questionId) || "(質問)";
            const ans = Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
            return `${q}: ${ans}`;
          })
          .join(" | ");
      })();

      const fmtJst = (d: Date) =>
        new Intl.DateTimeFormat("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Tokyo",
          hour12: false,
        })
          .format(d)
          .replace(/\//g, "-");

      await appendRowToSheet({
        userId: writerUserId, // undefined when env service account is used
        spreadsheetUrl: eventType.spreadsheetUrl,
        header: [
          "予約日時",
          "開始日時",
          "終了日時",
          "イベント名",
          "社名",
          "担当者名",
          "メール",
          "顧客メモ",
          "カスタム質問回答",
          "会議URL",
          "カレンダー担当者",
          "カレンダー担当者メール",
          "所要分",
          "会議プラットフォーム",
          "予約ID",
          "予約管理URL",
          "何回目",
        ],
        values: [
          fmtJst(booking.createdAt),
          fmtJst(booking.startTime),
          fmtJst(booking.endTime),
          eventType.title,
          data.guestCompanyName,
          data.guestName,
          data.guestEmail,
          data.guestNotes || "",
          answersText,
          meetingUrl || "",
          assignee?.name || "",
          assignee?.email || "",
          String(eventType.durationMinutes),
          eventType.meetingPlatform === "google_meet"
            ? "Google Meet"
            : eventType.meetingPlatform === "zoom"
            ? "Zoom"
            : "対面/電話",
          booking.id,
          (() => {
            const appUrl =
              process.env.NEXT_PUBLIC_APP_URL ||
              process.env.VERCEL_URL ||
              "http://localhost:3000";
            const base = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
            const token = generateGuestToken(booking.id, data.guestEmail);
            return `${base}/booking-manage/${booking.id}?token=${token}`;
          })(),
          String(visitNumber),
        ],
      });
    } catch (err) {
      console.error("[sheets append] failed:", err);
      // Do not fail the booking — sheets is optional.
    }
  }

  // Optional: notify Slack.
  // Priority: per-event slack_webhook_url > WEBHOOKURL env var.
  const slackWebhookUrl =
    eventType.slackWebhookUrl || process.env.WEBHOOKURL || null;
  if (slackWebhookUrl) {
    try {
      const [assignee] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, assignedUserId));

      const customAnswers: { question: string; answer: string }[] = [];
      if (
        Array.isArray(data.guestAnswers) &&
        Array.isArray(eventType.customQuestions)
      ) {
        const qMap = new Map<string, string>();
        for (const q of eventType.customQuestions as Array<{
          id: string;
          question: string;
        }>) {
          if (q?.id) qMap.set(q.id, q.question);
        }
        for (const a of data.guestAnswers) {
          const q = qMap.get(a.questionId) || "(質問)";
          const ans = Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
          if (String(ans).length > 0) {
            customAnswers.push({ question: q, answer: String(ans) });
          }
        }
      }

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.VERCEL_URL ||
        "http://localhost:3000";
      const base = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
      const manageUrl = `${base}/booking-manage/${booking.id}?token=${generateGuestToken(booking.id, data.guestEmail)}`;

      await notifySlackNewBooking(slackWebhookUrl, {
        eventTitle: eventType.title,
        companyName: data.guestCompanyName,
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        startTime,
        endTime,
        assigneeName: assignee?.name || "",
        assigneeEmail: assignee?.email || "",
        meetingUrl: meetingUrl || null,
        meetingPlatform: eventType.meetingPlatform,
        customAnswers,
        guestNotes: data.guestNotes,
        manageUrl,
      });
    } catch (err) {
      console.error("[slack notify] failed:", err);
      // Do not fail the booking — Slack is optional.
    }
  }

  return NextResponse.json(booking, { status: 201 });
}

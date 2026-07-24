import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, eventTypes, users } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { appendRowsToSheet } from "@/lib/google-sheets";
import { generateGuestToken } from "@/lib/guest-token";

/**
 * One-time admin: write all PAST confirmed bookings of an event to its
 * configured spreadsheet, in the exact same 17-column format the automatic
 * per-booking append uses (so the sheet stays uniform).
 *
 * Usage (signed-in): GET /api/admin/backfill-sheet?slug=<eventSlug>
 * NOT idempotent — running twice duplicates rows. Run once.
 */

const HEADER = [
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
];

function fmtJst(d: Date | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("ja-JP", {
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
}

// One-time key for a single unauthenticated run (removed right after use)
const ONE_TIME_KEY = "3b8aa9df3ff1b0c5960cea5bb27e0d806b812514b7a49fb8";

export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  if (key !== ONE_TIME_KEY) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.slug, slug))
    .limit(1);
  if (!eventType) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!eventType.spreadsheetUrl) {
    return NextResponse.json(
      { error: "This event has no spreadsheetUrl configured" },
      { status: 400 }
    );
  }

  const rows = await db
    .select({ booking: bookings, assignee: users })
    .from(bookings)
    .leftJoin(users, eq(bookings.assignedUserId, users.id))
    .where(
      and(
        eq(bookings.eventTypeId, eventType.id),
        eq(bookings.status, "confirmed")
      )
    )
    .orderBy(asc(bookings.startTime));

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";
  const base = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;

  const qMap = new Map<string, string>();
  if (Array.isArray(eventType.customQuestions)) {
    for (const q of eventType.customQuestions as Array<{
      id: string;
      question: string;
    }>) {
      if (q?.id) qMap.set(q.id, q.question);
    }
  }

  const dataRows = rows.map(({ booking, assignee }) => {
    let answersText = "";
    if (Array.isArray(booking.guestAnswers)) {
      answersText = (
        booking.guestAnswers as Array<{
          questionId: string;
          answer: string | string[];
        }>
      )
        .map((a) => {
          const q = qMap.get(a.questionId) || "(質問)";
          const ans = Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
          return `${q}: ${ans}`;
        })
        .filter((s) => s.length > 0)
        .join(" | ");
    }
    const token = generateGuestToken(booking.id, booking.guestEmail);
    return [
      fmtJst(booking.createdAt),
      fmtJst(booking.startTime),
      fmtJst(booking.endTime),
      eventType.title,
      booking.guestCompanyName,
      booking.guestName,
      booking.guestEmail,
      booking.guestNotes || "",
      answersText,
      booking.meetingUrl || "",
      assignee?.name || "",
      assignee?.email || "",
      String(eventType.durationMinutes),
      eventType.meetingPlatform === "google_meet"
        ? "Google Meet"
        : eventType.meetingPlatform === "zoom"
        ? "Zoom"
        : "対面/電話",
      booking.id,
      `${base}/booking-manage/${booking.id}?token=${token}`,
      booking.visitNumber != null ? String(booking.visitNumber) : "",
    ];
  });

  try {
    await appendRowsToSheet({
      spreadsheetUrl: eventType.spreadsheetUrl,
      rows: dataRows,
      header: HEADER,
    });
    return NextResponse.json({
      success: true,
      event: eventType.title,
      appended: dataRows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sheets append failed";
    console.error("[backfill-sheet] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, eventTypes, users } from "@/lib/db/schema";
import { and, eq, inArray, gte, lte, desc } from "drizzle-orm";
import { getManagedUserIds } from "@/lib/auth-helpers";

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

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

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") === "me" ? "me" : "team";
  const status = searchParams.get("status") || "confirmed";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const assigneeParam = searchParams.get("assignee") || "";

  const managedIds = await getManagedUserIds(session.user.id);
  const scopedIds = scope === "me" ? [session.user.id] : managedIds;
  const assigneeIds =
    assigneeParam && managedIds.includes(assigneeParam)
      ? [assigneeParam]
      : scopedIds;

  const conds = [inArray(bookings.assignedUserId, assigneeIds)];
  if (status !== "all") {
    conds.push(
      eq(
        bookings.status,
        status as "confirmed" | "cancelled" | "rescheduled"
      )
    );
  }
  if (from) conds.push(gte(bookings.startTime, new Date(`${from}T00:00:00`)));
  if (to) conds.push(lte(bookings.startTime, new Date(`${to}T23:59:59`)));

  const rows = await db
    .select({
      booking: bookings,
      eventType: eventTypes,
      assignee: users,
    })
    .from(bookings)
    .innerJoin(eventTypes, eq(bookings.eventTypeId, eventTypes.id))
    .leftJoin(users, eq(bookings.assignedUserId, users.id))
    .where(and(...conds))
    .orderBy(desc(bookings.startTime));

  const header = [
    "予約作成日時",
    "開始日時",
    "終了日時",
    "所要分",
    "担当者名",
    "担当者メール",
    "顧客社名",
    "顧客担当者名",
    "顧客メール",
    "イベント名",
    "会議プラットフォーム",
    "会議URL",
    "ステータス",
    "キャンセル日時",
    "キャンセル理由",
    "顧客メモ",
    "顧客タイムゾーン",
    "カスタム質問回答",
    "何回目",
  ];

  const csvLines: string[] = [header.map(csvEscape).join(",")];

  const statusLabel: Record<string, string> = {
    confirmed: "確定",
    cancelled: "キャンセル",
    rescheduled: "変更",
  };
  const platformLabel: Record<string, string> = {
    google_meet: "Google Meet",
    zoom: "Zoom",
    none: "対面/電話",
  };

  for (const { booking, eventType, assignee } of rows) {
    const durationMin = Math.round(
      (booking.endTime.getTime() - booking.startTime.getTime()) / 60000
    );

    // Join custom question answers as "Q: A | Q: A"
    let answersText = "";
    if (
      Array.isArray(booking.guestAnswers) &&
      Array.isArray(eventType.customQuestions)
    ) {
      const qMap = new Map<string, string>();
      for (const q of eventType.customQuestions as Array<{
        id: string;
        question: string;
      }>) {
        if (q?.id) qMap.set(q.id, q.question);
      }
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

    csvLines.push(
      [
        csvEscape(fmtJst(booking.createdAt)),
        csvEscape(fmtJst(booking.startTime)),
        csvEscape(fmtJst(booking.endTime)),
        csvEscape(durationMin),
        csvEscape(assignee?.name || ""),
        csvEscape(assignee?.email || ""),
        csvEscape(booking.guestCompanyName),
        csvEscape(booking.guestName),
        csvEscape(booking.guestEmail),
        csvEscape(eventType.title),
        csvEscape(platformLabel[booking.meetingPlatform || ""] || ""),
        csvEscape(booking.meetingUrl || ""),
        csvEscape(statusLabel[booking.status] || booking.status),
        csvEscape(fmtJst(booking.cancelledAt)),
        csvEscape(booking.cancellationReason || ""),
        csvEscape(booking.guestNotes || ""),
        csvEscape(booking.guestTimezone),
        csvEscape(answersText),
        csvEscape(booking.visitNumber ?? ""),
      ].join(",")
    );
  }

  // UTF-8 BOM + CRLF line endings for Excel compatibility with Japanese
  const bom = "﻿";
  const body = bom + csvLines.join("\r\n");

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}`;
  const filename = `bookings_${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

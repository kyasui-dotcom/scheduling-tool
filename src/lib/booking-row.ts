import type { bookings, eventTypes, users } from "@/lib/db/schema";

type Booking = typeof bookings.$inferSelect;
type EventType = typeof eventTypes.$inferSelect;
type UserRow = typeof users.$inferSelect;

export const BOOKING_ROW_HEADER = [
  "予約日時",
  "開始日時",
  "終了日時",
  "所要分",
  "担当者名",
  "担当者メール",
  "顧客社名",
  "顧客担当者名",
  "顧客メール",
  "イベント名",
  "会議URL",
  "顧客メモ",
  "カスタム質問回答",
  "ステータス",
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

const STATUS_LABEL: Record<string, string> = {
  confirmed: "確定",
  cancelled: "キャンセル",
  rescheduled: "変更",
};

/**
 * Build one row of scalar cell values in the order defined by BOOKING_ROW_HEADER.
 */
export function buildBookingRow(params: {
  booking: Booking;
  eventType: Pick<EventType, "title" | "customQuestions">;
  assignee: Pick<UserRow, "name" | "email"> | null | undefined;
}): string[] {
  const { booking, eventType, assignee } = params;
  const durationMin = Math.round(
    (booking.endTime.getTime() - booking.startTime.getTime()) / 60000
  );

  // Custom question answers: Q: A | Q: A
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

  return [
    fmtJst(booking.createdAt),
    fmtJst(booking.startTime),
    fmtJst(booking.endTime),
    String(durationMin),
    assignee?.name || "",
    assignee?.email || "",
    booking.guestCompanyName,
    booking.guestName,
    booking.guestEmail,
    eventType.title,
    booking.meetingUrl || "",
    booking.guestNotes || "",
    answersText,
    STATUS_LABEL[booking.status] || booking.status,
  ];
}

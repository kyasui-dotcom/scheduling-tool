import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, eventTypes } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SearchParams {
  tab?: string; // "upcoming" | "past" | "all"
}

export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const sp = await searchParams;
  const tab = sp.tab === "past" || sp.tab === "all" ? sp.tab : "upcoming";

  const rows = await db
    .select({
      booking: bookings,
      eventType: eventTypes,
    })
    .from(bookings)
    .innerJoin(eventTypes, eq(bookings.eventTypeId, eventTypes.id))
    .where(
      and(
        eq(bookings.assignedUserId, session.user.id),
        eq(bookings.status, "confirmed")
      )
    )
    .orderBy(desc(bookings.startTime));

  const now = new Date();
  const upcoming = rows.filter((r) => r.booking.startTime.getTime() > now.getTime());
  const past = rows.filter((r) => r.booking.startTime.getTime() <= now.getTime());
  const list =
    tab === "upcoming" ? upcoming : tab === "past" ? past : rows;

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      timeZone: "Asia/Tokyo",
      hour12: false,
    }).format(d);

  const formatAnswers = (
    guestAnswers: unknown,
    customQuestions: unknown
  ): { question: string; answer: string; description?: string }[] => {
    if (!Array.isArray(guestAnswers) || !Array.isArray(customQuestions)) {
      return [];
    }
    const qMap = new Map<string, { question: string; description?: string }>();
    for (const q of customQuestions as Array<{
      id: string;
      question: string;
      description?: string;
    }>) {
      if (q?.id) qMap.set(q.id, { question: q.question, description: q.description });
    }
    return (
      guestAnswers as Array<{ questionId: string; answer: string | string[] }>
    )
      .map((a) => {
        const q = qMap.get(a.questionId);
        const ans = Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
        return {
          question: q?.question || "(質問)",
          description: q?.description,
          answer: String(ans),
        };
      })
      .filter((a) => a.answer.length > 0);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">自分の予約</h1>
        <p className="text-muted-foreground">
          お客様が予約時に入力した内容をまとめて確認できます
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <TabLink href="/my-bookings" active={tab === "upcoming"}>
          今後 ({upcoming.length})
        </TabLink>
        <TabLink href="/my-bookings?tab=past" active={tab === "past"}>
          過去 ({past.length})
        </TabLink>
        <TabLink href="/my-bookings?tab=all" active={tab === "all"}>
          すべて ({rows.length})
        </TabLink>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {tab === "upcoming"
                ? "今後の予約はありません"
                : tab === "past"
                ? "過去の予約はありません"
                : "予約はありません"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {list.map(({ booking, eventType }) => {
            const answers = formatAnswers(
              booking.guestAnswers,
              eventType.customQuestions
            );
            const isPast = booking.startTime.getTime() <= now.getTime();
            return (
              <Card
                key={booking.id}
                className={isPast ? "opacity-70" : ""}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-base">
                        {eventType.title}
                      </CardTitle>
                      <p className="text-sm font-mono mt-1">
                        {fmt(booking.startTime)} 〜{" "}
                        {new Intl.DateTimeFormat("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Tokyo",
                          hour12: false,
                        }).format(booking.endTime)}
                        <span className="text-muted-foreground ml-2">
                          ({eventType.durationMinutes}分)
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isPast && <Badge variant="secondary">終了</Badge>}
                      {booking.meetingUrl && !isPast && (
                        <a
                          href={booking.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm px-3 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                        >
                          会議に参加
                        </a>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 顧客情報 */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">お客様情報</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <Row label="社名" value={booking.guestCompanyName} />
                      <Row label="担当者名" value={booking.guestName} />
                      <Row label="メール" value={booking.guestEmail} />
                      <Row label="TZ" value={booking.guestTimezone} muted />
                    </div>
                  </div>

                  {/* 予約時のメモ */}
                  {booking.guestNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">
                        お客様メモ
                      </p>
                      <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded p-3">
                        {booking.guestNotes}
                      </p>
                    </div>
                  )}

                  {/* カスタム質問回答 */}
                  {answers.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        カスタム質問の回答
                      </p>
                      <div className="space-y-2 text-sm">
                        {answers.map((a, i) => (
                          <div key={i}>
                            <div className="font-medium">{a.question}</div>
                            {a.description && (
                              <div className="text-xs text-muted-foreground">
                                {a.description}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap mt-0.5">
                              {a.answer}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] text-muted-foreground pt-2 border-t">
                    予約日時: {fmt(booking.createdAt)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`text-sm px-3 py-1 rounded-md border ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-muted"
      }`}
    >
      {children}
    </a>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 w-16">{label}:</span>
      <span className={muted ? "text-muted-foreground" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

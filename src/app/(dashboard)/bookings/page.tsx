import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, eventTypes, users } from "@/lib/db/schema";
import { and, eq, inArray, gte, lte, desc, count } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getManagedUserIds } from "@/lib/auth-helpers";

interface SearchParams {
  scope?: string;    // "me" | "team" (default: team)
  assignee?: string; // user id
  status?: string;   // "confirmed" | "cancelled" | "all"
  from?: string;     // YYYY-MM-DD
  to?: string;       // YYYY-MM-DD
  page?: string;     // 1-indexed page number
}

const PAGE_SIZE = 50;

export default async function BookingsAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const sp = await searchParams;
  const scope = sp.scope === "me" ? "me" : "team";
  const status = sp.status || "confirmed";
  const from = sp.from || "";
  const to = sp.to || "";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const managedIds = await getManagedUserIds(session.user.id);
  const scopedAssigneeIds = scope === "me" ? [session.user.id] : managedIds;

  // Optional single-assignee filter (must be within managed set)
  let assigneeIds = scopedAssigneeIds;
  if (sp.assignee && managedIds.includes(sp.assignee)) {
    assigneeIds = [sp.assignee];
  }

  // Fetch team members for the assignee dropdown
  const teamMembers =
    managedIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          .where(inArray(users.id, managedIds))
      : [];

  const conds = [inArray(bookings.assignedUserId, assigneeIds)];
  if (status !== "all") {
    conds.push(
      eq(
        bookings.status,
        status as "confirmed" | "cancelled" | "rescheduled"
      )
    );
  }
  if (from) {
    conds.push(gte(bookings.startTime, new Date(`${from}T00:00:00`)));
  }
  if (to) {
    conds.push(lte(bookings.startTime, new Date(`${to}T23:59:59`)));
  }

  // Total count for pagination
  const [{ total }] = await db
    .select({ total: count() })
    .from(bookings)
    .innerJoin(eventTypes, eq(bookings.eventTypeId, eventTypes.id))
    .where(and(...conds));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

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
    .orderBy(desc(bookings.startTime))
    .limit(PAGE_SIZE)
    .offset(offset);

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
      hour12: false,
    }).format(d);

  // Format guest custom-question answers as "Q: A / Q: A"
  const formatAnswers = (
    guestAnswers: unknown,
    customQuestions: unknown
  ): { question: string; answer: string }[] => {
    if (!Array.isArray(guestAnswers) || !Array.isArray(customQuestions)) {
      return [];
    }
    const qMap = new Map<string, string>();
    for (const q of customQuestions as Array<{ id: string; question: string }>) {
      if (q?.id) qMap.set(q.id, q.question);
    }
    return (
      guestAnswers as Array<{ questionId: string; answer: string | string[] }>
    )
      .map((a) => {
        const q = qMap.get(a.questionId) || "(質問)";
        const ans = Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
        return { question: q, answer: String(ans) };
      })
      .filter((a) => a.answer.length > 0);
  };

  const buildLink = (patch: Partial<SearchParams>) => {
    const p = new URLSearchParams();
    const merged = {
      scope,
      status,
      from,
      to,
      assignee: sp.assignee,
      page: currentPage > 1 ? String(currentPage) : undefined,
      ...patch,
    };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) p.set(k, String(v));
    });
    const s = p.toString();
    return s ? `/bookings?${s}` : "/bookings";
  };

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">予約管理</h1>
        <p className="text-muted-foreground">
          誰にいつ予約が入ったか、同ドメイン全員分を横断で確認できます
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">絞り込み</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            method="get"
            action="/bookings"
            className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                担当
              </label>
              <select
                name="assignee"
                defaultValue={sp.assignee || ""}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
              >
                <option value="">全員（同ドメイン）</option>
                {teamMembers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                    {u.id === session.user!.id ? "（自分）" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                ステータス
              </label>
              <select
                name="status"
                defaultValue={status}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
              >
                <option value="confirmed">確定のみ</option>
                <option value="cancelled">キャンセルのみ</option>
                <option value="all">すべて</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                開始日 (from)
              </label>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                終了日 (to)
              </label>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="w-full border rounded-md px-2 py-1.5 text-sm bg-background"
              />
            </div>
            <input type="hidden" name="scope" value={scope} />
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm"
              >
                絞り込む
              </button>
              <Link
                href="/bookings"
                className="px-3 py-1.5 rounded-md border text-sm hover:bg-muted"
              >
                クリア
              </Link>
            </div>
          </form>

          <div className="flex items-center gap-2 mt-4">
            <span className="text-xs text-muted-foreground">表示:</span>
            <Link
              href={buildLink({ scope: "team", assignee: "" })}
              className={`text-sm px-3 py-1 rounded-md border ${
                scope === "team"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              同ドメイン全員
            </Link>
            <Link
              href={buildLink({ scope: "me", assignee: "" })}
              className={`text-sm px-3 py-1 rounded-md border ${
                scope === "me"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted"
              }`}
            >
              自分のみ
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            予約一覧 ({total > 0 ? `${rangeStart}〜${rangeEnd} / ${total}件` : "0件"})
          </CardTitle>
          <a
            href={`/api/bookings/export${buildLink({}).replace("/bookings", "")}`}
            className="text-sm px-3 py-1.5 rounded-md border hover:bg-muted"
            download
          >
            CSV エクスポート
          </a>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              該当する予約はありません
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">
                      予約日時
                    </th>
                    <th className="text-left px-4 py-2 font-medium">開始日時</th>
                    <th className="text-left px-4 py-2 font-medium">担当</th>
                    <th className="text-left px-4 py-2 font-medium">顧客</th>
                    <th className="text-left px-4 py-2 font-medium">イベント</th>
                    <th className="text-left px-4 py-2 font-medium">状態</th>
                    <th className="text-left px-4 py-2 font-medium">リンク</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ booking, eventType, assignee }) => {
                    const answers = formatAnswers(
                      booking.guestAnswers,
                      eventType.customQuestions
                    );
                    return (
                      <Fragment key={booking.id}>
                    <tr className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {fmt(booking.createdAt)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">
                        {fmt(booking.startTime)}
                        <br />
                        <span className="text-muted-foreground">
                          - {fmt(booking.endTime)}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {assignee?.name || assignee?.email || "-"}
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">
                          {booking.guestCompanyName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {booking.guestName} / {booking.guestEmail}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div>{eventType.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {eventType.durationMinutes}分
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            booking.status === "confirmed"
                              ? "default"
                              : booking.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {booking.status === "confirmed"
                            ? "確定"
                            : booking.status === "cancelled"
                            ? "キャンセル"
                            : "変更"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {booking.meetingUrl && (
                          <a
                            href={booking.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            {booking.meetingPlatform === "google_meet"
                              ? "Meet"
                              : booking.meetingPlatform === "zoom"
                              ? "Zoom"
                              : "会議"}
                            を開く
                          </a>
                        )}
                      </td>
                    </tr>
                    {answers.length > 0 && (
                      <tr className="bg-muted/10">
                        <td colSpan={7} className="px-4 py-2 text-xs">
                          <div className="text-muted-foreground text-[10px] mb-1">
                            カスタム質問の回答
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                            {answers.map((a, i) => (
                              <div
                                key={i}
                                className="flex gap-2 leading-tight"
                              >
                                <span className="text-muted-foreground shrink-0">
                                  {a.question}:
                                </span>
                                <span className="break-all">{a.answer}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3 flex-wrap gap-2">
              <p className="text-xs text-muted-foreground">
                {currentPage} / {totalPages} ページ
              </p>
              <div className="flex items-center gap-1">
                <PagerLink
                  href={buildLink({ page: "1" })}
                  disabled={currentPage <= 1}
                  label="«"
                />
                <PagerLink
                  href={buildLink({ page: String(currentPage - 1) })}
                  disabled={currentPage <= 1}
                  label="‹ 前へ"
                />
                {getPageWindow(currentPage, totalPages).map((n) => (
                  <PagerLink
                    key={n}
                    href={buildLink({ page: String(n) })}
                    active={n === currentPage}
                    label={String(n)}
                  />
                ))}
                <PagerLink
                  href={buildLink({ page: String(currentPage + 1) })}
                  disabled={currentPage >= totalPages}
                  label="次へ ›"
                />
                <PagerLink
                  href={buildLink({ page: String(totalPages) })}
                  disabled={currentPage >= totalPages}
                  label="»"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PagerLink({
  href,
  label,
  active,
  disabled,
}: {
  href: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="text-xs px-2.5 py-1 rounded-md border text-muted-foreground/50 cursor-not-allowed">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`text-xs px-2.5 py-1 rounded-md border ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-muted"
      }`}
    >
      {label}
    </Link>
  );
}

// Returns up to 5 page numbers centered around currentPage
function getPageWindow(currentPage: number, totalPages: number): number[] {
  const width = 5;
  if (totalPages <= width) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(width / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + width - 1);
  if (end - start + 1 < width) start = end - width + 1;
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

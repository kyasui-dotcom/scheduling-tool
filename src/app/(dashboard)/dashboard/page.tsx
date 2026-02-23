import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, eventTypes, users } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeInZone } from "@/lib/timezone";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id));

  const events = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.userId, session.user.id));

  const upcomingBookings = await db
    .select({
      booking: bookings,
      eventType: eventTypes,
    })
    .from(bookings)
    .innerJoin(eventTypes, eq(bookings.eventTypeId, eventTypes.id))
    .where(
      and(
        eq(bookings.assignedUserId, session.user.id),
        eq(bookings.status, "confirmed"),
        gte(bookings.startTime, new Date())
      )
    )
    .orderBy(bookings.startTime)
    .limit(5);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ダッシュボード</h1>
          <p className="text-muted-foreground">
            こんにちは、{session.user.name}さん
          </p>
        </div>
        <Button asChild>
          <Link href="/events/new">新しいイベントタイプを作成</Link>
        </Button>
      </div>

      {/* Booking URL */}
      {user?.username && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">予約ページURL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-muted rounded text-sm">
                {appUrl}/{user.username}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={undefined}
                className="shrink-0"
              >
                コピー
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              イベントタイプ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{events.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              今後の予約
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{upcomingBookings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              ユーザー名
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-mono">{user?.username || "未設定"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Event Types */}
      <div>
        <h2 className="text-lg font-semibold mb-4">イベントタイプ</h2>
        {events.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">
                まだイベントタイプがありません
              </p>
              <Button asChild>
                <Link href="/events/new">作成する</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((event) => (
              <Card key={event.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: event.color || "#6366f1" }}
                    />
                    <CardTitle className="text-base">{event.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {event.durationMinutes}分
                    </p>
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {event.meetingPlatform === "google_meet"
                          ? "Google Meet"
                          : event.meetingPlatform === "zoom"
                          ? "Zoom"
                          : "なし"}
                      </Badge>
                      <Badge variant={event.isActive ? "default" : "secondary"}>
                        {event.isActive ? "有効" : "無効"}
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/events/${event.id}`}>編集</Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          href={`/${user?.username}/${event.slug}`}
                          target="_blank"
                        >
                          予約ページ
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Bookings */}
      <div>
        <h2 className="text-lg font-semibold mb-4">今後の予約</h2>
        {upcomingBookings.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">今後の予約はありません</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingBookings.map(({ booking, eventType }) => (
              <Card key={booking.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{eventType.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.guestName} ({booking.guestEmail})
                      </p>
                      <p className="text-sm">
                        {formatDateTimeInZone(
                          booking.startTime.toISOString(),
                          user?.timezone || "Asia/Tokyo"
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {booking.meetingUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={booking.meetingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            会議に参加
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

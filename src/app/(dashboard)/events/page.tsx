import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventTypes, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function EventsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id));

  const events = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.userId, session.user.id))
    .orderBy(eventTypes.createdAt);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">イベントタイプ</h1>
          <p className="text-muted-foreground">
            予約可能なミーティングのテンプレートを管理します
          </p>
        </div>
        <Button asChild>
          <Link href="/events/new">新規作成</Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              まだイベントタイプがありません。最初のイベントタイプを作成しましょう。
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
                <div className="space-y-3">
                  {event.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {event.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {event.durationMinutes}分
                    </Badge>
                    <Badge variant="secondary">
                      {event.meetingPlatform === "google_meet"
                        ? "Google Meet"
                        : event.meetingPlatform === "zoom"
                        ? "Zoom"
                        : "対面/電話"}
                    </Badge>
                    <Badge variant="secondary">
                      {event.schedulingMode === "any_available"
                        ? "誰か空いていればOK"
                        : event.schedulingMode === "all_available"
                        ? "全員空き必要"
                        : "指定メンバー"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono truncate">
                    {appUrl}/{user?.username}/{event.slug}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/events/${event.id}`}>編集</Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`/${user?.username}/${event.slug}`}
                        target="_blank"
                      >
                        プレビュー
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
  );
}

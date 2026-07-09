import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventTypes, eventTypeMembers, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmbedDialog } from "@/components/embed-dialog";
import { getManagedUserIds } from "@/lib/auth-helpers";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { owner: ownerFilter } = await searchParams;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id));

  const managedIds = await getManagedUserIds(session.user.id);

  // Fetch profiles for all managed users (for filter dropdown)
  const allManaged =
    managedIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            username: users.username,
          })
          .from(users)
          .where(inArray(users.id, managedIds))
      : [];

  // Filter event owners by URL ?owner=...
  // "me" = self (default), "all" = entire managed set, otherwise a specific userId
  let ownerIdsToShow: string[] = [session.user.id];
  if (ownerFilter === "all") {
    ownerIdsToShow = managedIds;
  } else if (ownerFilter && managedIds.includes(ownerFilter)) {
    ownerIdsToShow = [ownerFilter];
  }

  const events = await db
    .select()
    .from(eventTypes)
    .where(inArray(eventTypes.userId, ownerIdsToShow))
    .orderBy(eventTypes.createdAt);

  // Look up owner profiles to render "owner" badge
  const ownerIds = Array.from(new Set(events.map((e) => e.userId)));
  const ownerProfiles =
    ownerIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            username: users.username,
          })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : [];
  const ownerById = new Map(ownerProfiles.map((u) => [u.id, u]));

  // Get member counts for all events
  const eventIds = events.map((e) => e.id);
  const membersByEvent: Record<string, { userId: string }[]> = {};
  if (eventIds.length > 0) {
    const allMembers = await db
      .select({ eventTypeId: eventTypeMembers.eventTypeId, userId: eventTypeMembers.userId })
      .from(eventTypeMembers)
      .where(inArray(eventTypeMembers.eventTypeId, eventIds));

    for (const m of allMembers) {
      if (!membersByEvent[m.eventTypeId]) membersByEvent[m.eventTypeId] = [];
      membersByEvent[m.eventTypeId].push({ userId: m.userId });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
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

      {allManaged.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">表示:</span>
          <Link
            href="/events"
            className={`text-sm px-3 py-1 rounded-md border ${
              !ownerFilter || ownerFilter === "me"
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted"
            }`}
          >
            自分のみ
          </Link>
          <Link
            href="/events?owner=all"
            className={`text-sm px-3 py-1 rounded-md border ${
              ownerFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted"
            }`}
          >
            全員
          </Link>
          {allManaged
            .filter((u) => u.id !== session.user!.id)
            .map((u) => (
              <Link
                key={u.id}
                href={`/events?owner=${u.id}`}
                className={`text-sm px-3 py-1 rounded-md border ${
                  ownerFilter === u.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-muted"
                }`}
              >
                {u.name || u.email}
              </Link>
            ))}
        </div>
      )}

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
          {events.map((event) => {
            const members = membersByEvent[event.id] || [];
            const memberCount = members.length;
            const ownerProfile = ownerById.get(event.userId);
            const isOwn = event.userId === session.user!.id;
            const ownerUsername = ownerProfile?.username || user?.username;
            return (
              <Card key={event.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: event.color || "#6366f1" }}
                    />
                    <CardTitle className="text-base">{event.title}</CardTitle>
                  </div>
                  {!isOwn && ownerProfile && (
                    <p className="text-xs text-amber-700 mt-1">
                      代理管理: {ownerProfile.name || ownerProfile.email} のカレンダー
                    </p>
                  )}
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
                      {event.schedulingMode !== "specific_person" && (
                        <Badge variant="outline">
                          {memberCount}名
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono truncate">
                      {appUrl}/b/{event.slug}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/events/${event.id}`}>編集</Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          href={`/b/${event.slug}`}
                          target="_blank"
                        >
                          プレビュー
                        </Link>
                      </Button>
                      <EmbedDialog
                        username={ownerUsername || ""}
                        slug={event.slug}
                        appUrl={appUrl}
                      />
                    </div>
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

import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));

  if (!user) {
    notFound();
  }

  const events = await db
    .select()
    .from(eventTypes)
    .where(
      and(eq(eventTypes.userId, user.id), eq(eventTypes.isActive, true))
    );

  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {user.image && (
            <img
              src={user.image}
              alt=""
              className="w-16 h-16 rounded-full mx-auto mb-3"
            />
          )}
          <h1 className="text-xl font-bold">{user.name}</h1>
          <p className="text-muted-foreground text-sm">
            以下のイベントから日程を選んでください
          </p>
        </div>

        <div className="space-y-3">
          {events.length === 0 ? (
            <p className="text-center text-muted-foreground">
              現在予約可能なイベントはありません
            </p>
          ) : (
            events.map((event) => (
              <Link key={event.id} href={`/${username}/${event.slug}`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{
                          backgroundColor: event.color || "#6366f1",
                        }}
                      />
                      <div className="flex-1">
                        <h3 className="font-medium">{event.title}</h3>
                        {event.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {event.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary">
                        {event.durationMinutes}分
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Powered by Schedule
        </p>
      </div>
    </div>
  );
}

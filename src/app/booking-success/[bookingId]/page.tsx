import { db } from "@/lib/db";
import { bookings, eventTypes, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildGoogleCalendarUrl } from "@/lib/ics-generator";

export default async function BookingSuccessPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) notFound();

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, booking.eventTypeId));

  let organizerName = "Organizer";
  if (booking.assignedUserId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, booking.assignedUserId));
    if (user) organizerName = user.name || "Organizer";
  }

  const formatDateTime = (date: Date) =>
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: booking.guestTimezone,
      hour12: false,
    }).format(date);

  const googleCalUrl = buildGoogleCalendarUrl({
    title: eventType?.title || "Meeting",
    startTime: booking.startTime,
    endTime: booking.endTime,
    description: [
      booking.meetingUrl ? `Meeting Link: ${booking.meetingUrl}` : "",
      `Organizer: ${organizerName}`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: booking.meetingUrl || undefined,
  });

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="text-4xl mb-2">&#10003;</div>
            <CardTitle>予約が確定しました</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <h3 className="font-semibold">
                {eventType?.title || "Meeting"}
              </h3>
              <p className="text-sm">{organizerName} さんとのミーティング</p>
              <p className="text-sm font-medium">
                {formatDateTime(booking.startTime)}
              </p>
              <p className="text-xs text-muted-foreground">
                {eventType?.durationMinutes}分 | タイムゾーン:{" "}
                {booking.guestTimezone}
              </p>
            </div>

            {booking.meetingUrl && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">会議リンク</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {booking.meetingPlatform === "google_meet"
                      ? "Google Meet"
                      : booking.meetingPlatform === "zoom"
                      ? "Zoom"
                      : "Meeting"}
                  </Badge>
                  <a
                    href={booking.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline truncate"
                  >
                    {booking.meetingUrl}
                  </a>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                カレンダーに追加
              </h4>
              <div className="flex flex-col gap-2">
                <Button asChild variant="outline" className="w-full">
                  <a
                    href={googleCalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google カレンダーに追加
                  </a>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <a
                    href={`/api/bookings/${booking.id}/ics`}
                    download="meeting.ics"
                  >
                    .ics ファイルをダウンロード
                  </a>
                </Button>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              確認メールは {booking.guestEmail} に送信されます
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

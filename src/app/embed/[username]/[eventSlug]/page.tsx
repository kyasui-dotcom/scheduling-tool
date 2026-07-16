import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingClient } from "@/app/(booking)/[username]/[eventSlug]/booking-client";
import { getAvailabilityRange } from "@/lib/availability-engine";
import { format } from "date-fns";

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ username: string; eventSlug: string }>;
}) {
  const { username, eventSlug } = await params;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));

  if (!user) notFound();

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(
      and(
        eq(eventTypes.userId, user.id),
        eq(eventTypes.slug, eventSlug),
        eq(eventTypes.isActive, true)
      )
    );

  if (!eventType) notFound();

  const prefetchTz = user.timezone || "Asia/Tokyo";
  let initialAvailability:
    | {
        timezone: string;
        days: Array<{
          date: string;
          slots: { startTime: string; endTime: string }[];
          windows: { startTime: string; latestStartTime: string }[];
        }>;
      }
    | undefined;
  try {
    const range = await getAvailabilityRange({
      eventTypeId: eventType.id,
      startDate: format(new Date(), "yyyy-MM-dd"),
      days: 2,
      guestTimezone: prefetchTz,
    });
    initialAvailability = {
      timezone: prefetchTz,
      days: range.map((r) => ({
        date: r.date,
        slots: r.slots,
        windows: r.windows,
      })),
    };
  } catch {
    // best-effort
  }

  return (
    <BookingClient
      initialAvailability={initialAvailability}
      eventType={{
        id: eventType.id,
        title: eventType.title,
        description: eventType.description,
        durationMinutes: eventType.durationMinutes,
        color: eventType.color,
        slotMode: eventType.slotMode ?? "fixed_slots",
        bookingWindowStart: eventType.bookingWindowStart,
        bookingWindowEnd: eventType.bookingWindowEnd,
        maxAdvanceDays: eventType.maxAdvanceDays ?? 60,
        minNoticeMinutes: eventType.minNoticeMinutes ?? 0,
      }}
      organizer={{
        name: user.name || username,
        username: user.username || username,
        image: user.image,
      }}
    />
  );
}

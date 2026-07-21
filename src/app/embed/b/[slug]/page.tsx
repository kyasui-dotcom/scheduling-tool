import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  BookingClient,
  type InitialAvailability,
} from "@/app/(booking)/[username]/[eventSlug]/booking-client";
import { getAvailabilityRange } from "@/lib/availability-engine";
import { format } from "date-fns";

export default async function EmbedBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [row] = await db
    .select({ eventType: eventTypes, user: users })
    .from(eventTypes)
    .innerJoin(users, eq(users.id, eventTypes.userId))
    .where(and(eq(eventTypes.slug, slug), eq(eventTypes.isActive, true)))
    .limit(1);

  if (!row) notFound();
  const { eventType, user } = row;

  const prefetchTz = user.timezone || "Asia/Tokyo";
  const initialAvailability: Promise<InitialAvailability | undefined> =
    getAvailabilityRange({
      eventTypeId: eventType.id,
      startDate: format(new Date(), "yyyy-MM-dd"),
      days: 2,
      guestTimezone: prefetchTz,
    })
      .then((range) => ({
        timezone: prefetchTz,
        days: range.map((r) => ({
          date: r.date,
          slots: r.slots,
          windows: r.windows,
        })),
      }))
      .catch(() => undefined);

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
        name: user.name || slug,
        username: user.username || slug,
        image: user.image,
      }}
    />
  );
}

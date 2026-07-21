import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingClient } from "@/app/(booking)/[username]/[eventSlug]/booking-client";

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ username: string; eventSlug: string }>;
}) {
  const { username, eventSlug } = await params;

  const [row] = await db
    .select({ eventType: eventTypes, user: users })
    .from(eventTypes)
    .innerJoin(users, eq(users.id, eventTypes.userId))
    .where(
      and(
        eq(users.username, username),
        eq(eventTypes.slug, eventSlug),
        eq(eventTypes.isActive, true)
      )
    )
    .limit(1);

  if (!row) notFound();
  const { eventType, user } = row;

  return (
    <BookingClient
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

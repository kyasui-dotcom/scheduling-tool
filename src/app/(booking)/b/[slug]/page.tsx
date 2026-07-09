import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingClient } from "@/app/(booking)/[username]/[eventSlug]/booking-client";

/**
 * Fully random public URL: /b/<random-slug>
 * Resolves an event solely by its slug (no username involved).
 * Slugs are random 10-char alphanumeric so collisions across users are
 * astronomically rare; we still LIMIT 1 to be safe.
 */
export default async function BookingBySlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(and(eq(eventTypes.slug, slug), eq(eventTypes.isActive, true)))
    .limit(1);

  if (!eventType) notFound();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, eventType.userId));

  if (!user) notFound();

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
        name: user.name || slug,
        // Reused by legacy navigation code but unused in this path
        username: user.username || slug,
        image: user.image,
      }}
    />
  );
}

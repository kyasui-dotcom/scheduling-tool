import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingClient } from "@/app/(booking)/[username]/[eventSlug]/booking-client";

/**
 * Fully random public URL: /b/<random-slug>
 * Single joined query keeps TTFB to one DB round trip. No server-side
 * availability prefetch: streaming an unresolved promise held the HTML
 * stream open (~3s) and blocked first paint. The client fetches
 * availability after the shell renders instead.
 */
export default async function BookingBySlugPage({
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
        username: user.username || slug,
        image: user.image,
      }}
    />
  );
}

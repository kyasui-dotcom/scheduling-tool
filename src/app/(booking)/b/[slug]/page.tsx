import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingClient } from "@/app/(booking)/[username]/[eventSlug]/booking-client";
import { getAvailabilityRange } from "@/lib/availability-engine";
import { format } from "date-fns";

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

  // Server-side prefetch for the first 2 days so the calendar renders with
  // data on the very first paint (skips the client's Phase-1 Google FreeBusy wait).
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
    // Prefetch is best-effort; client will fetch on mount if this fails
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
        name: user.name || slug,
        // Reused by legacy navigation code but unused in this path
        username: user.username || slug,
        image: user.image,
      }}
    />
  );
}

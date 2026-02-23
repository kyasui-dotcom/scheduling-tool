import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingClient } from "./booking-client";

export default async function BookingPage({
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

  return (
    <BookingClient
      eventType={{
        id: eventType.id,
        title: eventType.title,
        description: eventType.description,
        durationMinutes: eventType.durationMinutes,
        color: eventType.color,
      }}
      organizer={{
        name: user.name || username,
        username: user.username || username,
        image: user.image,
      }}
    />
  );
}

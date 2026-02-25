import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventTypes, eventTypeMembers, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all event types for the current user
  const events = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.userId, session.user.id))
    .orderBy(eventTypes.createdAt);

  if (events.length === 0) {
    return NextResponse.json([]);
  }

  // Get all members for these events
  const eventIds = events.map((e) => e.id);
  const members = await db
    .select()
    .from(eventTypeMembers)
    .where(inArray(eventTypeMembers.eventTypeId, eventIds));

  // Get unique user IDs
  const userIds = [...new Set(members.map((m) => m.userId))];

  let userMap: Record<string, { id: string; name: string | null; email: string; image: string | null; username: string | null }> = {};

  if (userIds.length > 0) {
    const userDetails = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        username: users.username,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    userMap = Object.fromEntries(userDetails.map((u) => [u.id, u]));
  }

  // Combine events with member details
  const eventsWithMembers = events.map((event) => {
    const eventMembers = members
      .filter((m) => m.eventTypeId === event.id)
      .map((m) => userMap[m.userId])
      .filter(Boolean);

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      schedulingMode: event.schedulingMode,
      isActive: event.isActive,
      color: event.color,
      members: eventMembers,
    };
  });

  return NextResponse.json(eventsWithMembers);
}

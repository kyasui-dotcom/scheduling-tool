import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const slug = searchParams.get("slug");

  if (!username || !slug) {
    return NextResponse.json(
      { error: "username and slug are required" },
      { status: 400 }
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(
      and(
        eq(eventTypes.userId, user.id),
        eq(eventTypes.slug, slug),
        eq(eventTypes.isActive, true)
      )
    );

  if (!eventType) {
    return NextResponse.json(
      { error: "Event type not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    eventTypeId: eventType.id,
    title: eventType.title,
    durationMinutes: eventType.durationMinutes,
  });
}

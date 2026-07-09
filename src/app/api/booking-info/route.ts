import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, eventTypes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json(
      { error: "slug is required" },
      { status: 400 }
    );
  }

  // Prefer slug-only lookup (fully random URL). Fall back to (user, slug)
  // for the legacy /<username>/<slug> URL if username is provided.
  let eventType;
  if (username) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    [eventType] = await db
      .select()
      .from(eventTypes)
      .where(
        and(
          eq(eventTypes.userId, user.id),
          eq(eventTypes.slug, slug),
          eq(eventTypes.isActive, true)
        )
      );
  } else {
    [eventType] = await db
      .select()
      .from(eventTypes)
      .where(and(eq(eventTypes.slug, slug), eq(eventTypes.isActive, true)))
      .limit(1);
  }

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
    customQuestions: eventType.customQuestions || [],
  });
}

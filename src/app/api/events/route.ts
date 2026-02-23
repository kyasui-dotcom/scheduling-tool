import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventTypes, eventTypeMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createEventTypeSchema } from "@/lib/validations/event";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.userId, session.user.id))
    .orderBy(eventTypes.createdAt);

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createEventTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { memberUserIds, ...eventData } = parsed.data;

  const [eventType] = await db
    .insert(eventTypes)
    .values({
      ...eventData,
      userId: session.user.id,
    })
    .returning();

  // Add the owner as a member
  await db.insert(eventTypeMembers).values({
    eventTypeId: eventType.id,
    userId: session.user.id,
    isRequired: true,
  });

  // Add additional members if provided
  if (memberUserIds && memberUserIds.length > 0) {
    await db.insert(eventTypeMembers).values(
      memberUserIds
        .filter((id) => id !== session.user!.id)
        .map((userId) => ({
          eventTypeId: eventType.id,
          userId,
          isRequired: true,
        }))
    );
  }

  return NextResponse.json(eventType, { status: 201 });
}

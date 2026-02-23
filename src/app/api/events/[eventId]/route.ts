import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventTypes, eventTypeMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { updateEventTypeSchema } from "@/lib/validations/event";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [eventType] = await db
    .select()
    .from(eventTypes)
    .where(
      and(
        eq(eventTypes.id, eventId),
        eq(eventTypes.userId, session.user.id)
      )
    );

  if (!eventType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const members = await db
    .select()
    .from(eventTypeMembers)
    .where(eq(eventTypeMembers.eventTypeId, eventId));

  return NextResponse.json({ ...eventType, members });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateEventTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { memberUserIds, ...updateData } = parsed.data;

  const [updated] = await db
    .update(eventTypes)
    .set({ ...updateData, updatedAt: new Date() })
    .where(
      and(
        eq(eventTypes.id, eventId),
        eq(eventTypes.userId, session.user.id)
      )
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Update members if provided
  if (memberUserIds) {
    await db
      .delete(eventTypeMembers)
      .where(eq(eventTypeMembers.eventTypeId, eventId));

    const allMemberIds = [
      session.user!.id,
      ...memberUserIds.filter((id) => id !== session.user!.id),
    ];
    await db.insert(eventTypeMembers).values(
      allMemberIds.map((userId) => ({
        eventTypeId: eventId,
        userId,
        isRequired: true,
      }))
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [deleted] = await db
    .delete(eventTypes)
    .where(
      and(
        eq(eventTypes.id, eventId),
        eq(eventTypes.userId, session.user.id)
      )
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

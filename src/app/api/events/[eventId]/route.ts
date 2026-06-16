import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventTypes, eventTypeMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateEventTypeSchema } from "@/lib/validations/event";
import { canManageEventsOf } from "@/lib/auth-helpers";

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
    .where(eq(eventTypes.id, eventId));

  if (!eventType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await canManageEventsOf({
    viewerUserId: session.user.id,
    targetUserId: eventType.userId,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // ownerUserId is ignored on update — owner is fixed at creation time
  const { memberUserIds, ...rest } = parsed.data;
  const updateData = { ...rest };
  delete (updateData as { ownerUserId?: string }).ownerUserId;

  // Load the event to determine its owner
  const [existing] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, eventId));

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await canManageEventsOf({
    viewerUserId: session.user.id,
    targetUserId: existing.userId,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [updated] = await db
      .update(eventTypes)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(eventTypes.id, eventId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Update members if provided. The event's owner (existing.userId) stays in.
    if (memberUserIds) {
      await db
        .delete(eventTypeMembers)
        .where(eq(eventTypeMembers.eventTypeId, eventId));

      const allMemberIds = Array.from(
        new Set([
          existing.userId,
          ...memberUserIds.filter((id) => id !== existing.userId),
        ])
      );
      await db.insert(eventTypeMembers).values(
        allMemberIds.map((userId) => ({
          eventTypeId: eventId,
          userId,
          isRequired: true,
        }))
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/events/:id] DB error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }
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

  const [existing] = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.id, eventId));

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await canManageEventsOf({
    viewerUserId: session.user.id,
    targetUserId: existing.userId,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(eventTypes).where(eq(eventTypes.id, eventId));

  return NextResponse.json({ success: true });
}

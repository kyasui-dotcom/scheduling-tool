import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventTypes, eventTypeMembers } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { createEventTypeSchema } from "@/lib/validations/event";
import { canManageEventsOf, getManagedUserIds } from "@/lib/auth-helpers";

// List events the user can manage (own + same email domain)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const managedIds = await getManagedUserIds(session.user.id);

  const events = await db
    .select()
    .from(eventTypes)
    .where(inArray(eventTypes.userId, managedIds))
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

  const { memberUserIds, ownerUserId, ...eventData } = parsed.data;

  // Resolve owner: default to current user, else verify same-domain permission
  const targetOwnerId = ownerUserId || session.user.id;
  if (targetOwnerId !== session.user.id) {
    const allowed = await canManageEventsOf({
      viewerUserId: session.user.id,
      targetUserId: targetOwnerId,
    });
    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Forbidden: 同じメールドメインのユーザーのみイベントを代理作成できます",
        },
        { status: 403 }
      );
    }
  }

  const [eventType] = await db
    .insert(eventTypes)
    .values({
      ...eventData,
      userId: targetOwnerId,
    })
    .returning();

  // Add the owner as a member (note: this is the event owner, not the session user)
  await db.insert(eventTypeMembers).values({
    eventTypeId: eventType.id,
    userId: targetOwnerId,
    isRequired: true,
  });

  if (memberUserIds && memberUserIds.length > 0) {
    const extras = memberUserIds.filter((id) => id !== targetOwnerId);
    if (extras.length > 0) {
      await db.insert(eventTypeMembers).values(
        extras.map((userId) => ({
          eventTypeId: eventType.id,
          userId,
          isRequired: true,
        }))
      );
    }
  }

  return NextResponse.json(eventType, { status: 201 });
}

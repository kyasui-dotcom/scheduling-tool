import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { exportTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateExportTaskSchema } from "@/lib/validations/export-task";
import { canManageEventsOf } from "@/lib/auth-helpers";

async function loadAndCheck(taskId: string, viewerUserId: string) {
  const [task] = await db
    .select()
    .from(exportTasks)
    .where(eq(exportTasks.id, taskId));
  if (!task) return { task: null as null, allowed: false };
  const allowed = await canManageEventsOf({
    viewerUserId,
    targetUserId: task.ownerUserId,
  });
  return { task, allowed };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { task, allowed } = await loadAndCheck(taskId, session.user.id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(task);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { task, allowed } = await loadAndCheck(taskId, session.user.id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = updateExportTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(exportTasks)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(exportTasks.id, taskId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { task, allowed } = await loadAndCheck(taskId, session.user.id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(exportTasks).where(eq(exportTasks.id, taskId));
  return NextResponse.json({ success: true });
}

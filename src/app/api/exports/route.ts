import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { exportTasks } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { createExportTaskSchema } from "@/lib/validations/export-task";
import { getManagedUserIds } from "@/lib/auth-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const managedIds = await getManagedUserIds(session.user.id);
  const tasks = await db
    .select()
    .from(exportTasks)
    .where(inArray(exportTasks.ownerUserId, managedIds))
    .orderBy(desc(exportTasks.updatedAt));

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createExportTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [task] = await db
    .insert(exportTasks)
    .values({
      ...parsed.data,
      ownerUserId: session.user.id,
    })
    .returning();

  return NextResponse.json(task, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({
      username: users.username,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, session.user.id));

  return NextResponse.json(user || { username: "", timezone: "Asia/Tokyo" });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { username, timezone } = body;

  if (username) {
    // Validate username format
    if (!/^[a-z0-9-]+$/.test(username)) {
      return NextResponse.json(
        { error: "ユーザー名は英小文字、数字、ハイフンのみ使用できます" },
        { status: 400 }
      );
    }

    // Check uniqueness
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.username, username), ne(users.id, session.user.id))
      );

    if (existing) {
      return NextResponse.json(
        { error: "このユーザー名は既に使われています" },
        { status: 409 }
      );
    }
  }

  await db
    .update(users)
    .set({
      username: username || undefined,
      timezone: timezone || undefined,
      updatedAt: new Date(),
    })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ success: true });
}

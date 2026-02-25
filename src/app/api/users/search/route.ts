import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ilike, ne, and, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = req.nextUrl.searchParams.get("q");
  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const searchPattern = `%${query}%`;

  const results = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      username: users.username,
    })
    .from(users)
    .where(
      and(
        ne(users.id, session.user.id),
        or(
          ilike(users.email, searchPattern),
          ilike(users.name, searchPattern),
          ilike(users.username, searchPattern)
        )
      )
    )
    .limit(10);

  return NextResponse.json(results);
}

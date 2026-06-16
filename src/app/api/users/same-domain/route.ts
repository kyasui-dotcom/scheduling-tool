import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, ilike } from "drizzle-orm";
import { getEmailDomain } from "@/lib/auth-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [me] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id));

  const domain = getEmailDomain(me?.email);
  if (!domain) return NextResponse.json([]);

  const results = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      username: users.username,
    })
    .from(users)
    .where(ilike(users.email, `%@${domain}`));

  return NextResponse.json(results);
}

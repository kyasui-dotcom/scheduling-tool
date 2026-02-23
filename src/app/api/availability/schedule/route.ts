import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { availabilitySchedules, availabilityRules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [schedule] = await db
    .select()
    .from(availabilitySchedules)
    .where(
      and(
        eq(availabilitySchedules.userId, session.user.id),
        eq(availabilitySchedules.isDefault, true)
      )
    );

  if (!schedule) {
    return NextResponse.json({ timezone: "Asia/Tokyo", rules: [] });
  }

  const rules = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.scheduleId, schedule.id));

  return NextResponse.json({
    timezone: schedule.timezone,
    rules: rules.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
    })),
  });
}

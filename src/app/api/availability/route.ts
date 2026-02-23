import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  availabilitySchedules,
  availabilityRules,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAvailableSlots } from "@/lib/availability-engine";
import { updateAvailabilitySchema } from "@/lib/validations/availability";

// Public: Get available slots for a specific event type and date
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventTypeId = searchParams.get("eventTypeId");
  const date = searchParams.get("date");
  const timezone = searchParams.get("timezone") || "Asia/Tokyo";

  if (!eventTypeId || !date) {
    return NextResponse.json(
      { error: "eventTypeId and date are required" },
      { status: 400 }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Date must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  try {
    const slots = await getAvailableSlots({
      eventTypeId,
      date,
      guestTimezone: timezone,
    });

    return NextResponse.json({
      date,
      timezone,
      slots,
    });
  } catch (error) {
    console.error("Error computing availability:", error);
    return NextResponse.json(
      { error: "Failed to compute availability" },
      { status: 500 }
    );
  }
}

// Authenticated: Update user's availability schedule
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Find or create default schedule
  let [schedule] = await db
    .select()
    .from(availabilitySchedules)
    .where(
      and(
        eq(availabilitySchedules.userId, session.user.id),
        eq(availabilitySchedules.isDefault, true)
      )
    );

  if (!schedule) {
    [schedule] = await db
      .insert(availabilitySchedules)
      .values({
        userId: session.user.id,
        name: "Default",
        isDefault: true,
        timezone: parsed.data.timezone,
      })
      .returning();
  } else {
    // Update timezone
    await db
      .update(availabilitySchedules)
      .set({ timezone: parsed.data.timezone })
      .where(eq(availabilitySchedules.id, schedule.id));
  }

  // Delete existing rules and insert new ones
  await db
    .delete(availabilityRules)
    .where(eq(availabilityRules.scheduleId, schedule.id));

  if (parsed.data.rules.length > 0) {
    await db.insert(availabilityRules).values(
      parsed.data.rules.map((rule) => ({
        scheduleId: schedule.id,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
      }))
    );
  }

  return NextResponse.json({ success: true });
}

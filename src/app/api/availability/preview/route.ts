import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAvailabilityRangeFromConfig } from "@/lib/availability-engine";

const previewSchema = z.object({
  memberUserIds: z.array(z.string()).min(1),
  durationMinutes: z.number().int().min(5).max(480),
  schedulingMode: z.enum(["any_available", "all_available", "specific_person"]),
  slotMode: z.enum(["fixed_slots", "flexible_start"]),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  minNoticeMinutes: z.number().int().min(0).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  timezone: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(14).default(7),
  excludeEventTypeId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  // Ensure the caller is one of the queried members (don't leak others' availability)
  if (!data.memberUserIds.includes(session.user.id)) {
    return NextResponse.json(
      { error: "Forbidden: must be a member of the queried set" },
      { status: 403 }
    );
  }

  try {
    const range = await getAvailabilityRangeFromConfig({
      memberUserIds: data.memberUserIds,
      startDate: data.startDate,
      days: data.days,
      guestTimezone: data.timezone,
      slotMode: data.slotMode,
      durationMinutes: data.durationMinutes,
      bufferBeforeMinutes: data.bufferBeforeMinutes,
      bufferAfterMinutes: data.bufferAfterMinutes,
      minNoticeMinutes: data.minNoticeMinutes,
      maxAdvanceDays: data.maxAdvanceDays,
      schedulingMode: data.schedulingMode,
      excludeEventTypeId: data.excludeEventTypeId,
    });

    const results = range.map((r) => ({
      date: r.date,
      slotCount: r.mode === "fixed_slots" ? r.slots.length : r.windows.length,
      firstStart:
        r.mode === "fixed_slots"
          ? r.slots[0]?.startTime
          : r.windows[0]?.startTime,
      lastEnd:
        r.mode === "fixed_slots"
          ? r.slots[r.slots.length - 1]?.endTime
          : r.windows[r.windows.length - 1]?.latestStartTime,
    }));

    return NextResponse.json({ timezone: data.timezone, days: results });
  } catch (err) {
    console.error("[availability preview] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preview failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { availabilityOverrides } from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { addDays, format, parseISO } from "date-fns";

const createSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const deleteSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// List all blocked overrides for the current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(availabilityOverrides)
    .where(
      and(
        eq(availabilityOverrides.userId, session.user.id),
        eq(availabilityOverrides.isBlocked, true)
      )
    );

  // Group consecutive blocked dates into ranges for display
  const sorted = rows
    .map((r) => format(r.date, "yyyy-MM-dd"))
    .sort();

  const ranges: Array<{ startDate: string; endDate: string }> = [];
  for (const dateStr of sorted) {
    const last = ranges[ranges.length - 1];
    if (last) {
      const nextDay = format(addDays(parseISO(last.endDate), 1), "yyyy-MM-dd");
      if (dateStr === nextDay) {
        last.endDate = dateStr;
        continue;
      }
    }
    ranges.push({ startDate: dateStr, endDate: dateStr });
  }

  return NextResponse.json({ ranges });
}

// Block a date range (creates one override row per day)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const start = parseISO(parsed.data.startDate);
  const end = parseISO(parsed.data.endDate);
  if (end.getTime() < start.getTime()) {
    return NextResponse.json(
      { error: "endDate must be >= startDate" },
      { status: 400 }
    );
  }

  // Build list of dates in range (inclusive)
  const dates: Date[] = [];
  for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    dates.push(new Date(d));
  }

  // Delete existing overrides in this range first to avoid duplicates
  await db
    .delete(availabilityOverrides)
    .where(
      and(
        eq(availabilityOverrides.userId, session.user.id),
        gte(availabilityOverrides.date, start),
        lte(availabilityOverrides.date, end)
      )
    );

  const userId = session.user.id;
  await db.insert(availabilityOverrides).values(
    dates.map((date) => ({
      userId,
      date,
      isBlocked: true,
    }))
  );

  return NextResponse.json({ success: true, count: dates.length });
}

// Delete a specific range
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = deleteSchema.safeParse({
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "startDate and endDate required" },
      { status: 400 }
    );
  }

  const start = parseISO(parsed.data.startDate);
  const end = parseISO(parsed.data.endDate);

  await db
    .delete(availabilityOverrides)
    .where(
      and(
        eq(availabilityOverrides.userId, session.user.id),
        eq(availabilityOverrides.isBlocked, true),
        gte(availabilityOverrides.date, start),
        lte(availabilityOverrides.date, end)
      )
    );

  return NextResponse.json({ success: true });
}
